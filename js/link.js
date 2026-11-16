// Verbindung Handy ↔ Tablet.
// Das Video läuft direkt von Gerät zu Gerät (WebRTC-Datenkanal im selben WLAN), nichts davon geht ins Internet.
// Nur zum gegenseitigen Finden tauschen beide Seiten ein paar kurze Nachrichten über eine Vermittlung aus.
// Diese Nachrichten sind mit dem Kopplungs-Code verschlüsselt – die Vermittlung kann sie nicht lesen.

const PUBLIC_RELAY = 'https://ntfy.sh';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne I, O, 0, 1 – die verwechselt man leicht
const PART = 2400;          // Vermittlungs-Nachrichten in Teile dieser Länge zerlegen
const FRAG = 16000;         // Videostücke in Pakete dieser Größe zerlegen
const HIGH_WATER = 3e6;     // so viel darf sich im Sendepuffer stauen, dann werden Bilder ausgelassen
export const LOW_WATER = 256e3;

const te = new TextEncoder(), td = new TextDecoder();

export function newCode() {
  return [...crypto.getRandomValues(new Uint8Array(8))].map(x => ALPHABET[x % 32]).join('');
}
export const formatCode = c => `${c.slice(0, 4)}-${c.slice(4)}`;
export function cleanCode(s) {
  const c = (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === 8 && [...c].every(ch => ALPHABET.includes(ch)) ? c : null;
}

// Liefert der eigene Server eine Vermittlung mit (Start vom Mac)? Sonst die öffentliche nehmen.
export async function findRelay(custom) {
  if (custom) return custom.replace(/\/+$/, '');
  try {
    const u = new URL('api/relay', location.href).href;
    const r = await fetch(u + '/ping', { cache: 'no-store' });
    if (r.ok && (await r.text()).trim() === 'pong') return u;
  } catch {}
  return PUBLIC_RELAY;
}

// ---------- Verschlüsselung der Vermittlungs-Nachrichten ----------
async function derive(code) {
  const raw = await crypto.subtle.importKey('raw', te.encode(code), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: te.encode('trainings-kamera-v1'), iterations: 100000, hash: 'SHA-256' }, raw, 384));
  return {
    topic: 'tk' + [...bits.slice(0, 16)].map(b => b.toString(16).padStart(2, '0')).join(''),
    key: await crypto.subtle.importKey('raw', bits.slice(16, 48), 'AES-GCM', false, ['encrypt', 'decrypt']),
  };
}

async function pipe(bytes, stream) {
  const w = stream.writable.getWriter();
  w.write(bytes); w.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}
const toB64 = u => { let s = ''; for (const b of u) s += String.fromCharCode(b); return btoa(s); };
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function seal(obj, key) {
  let body = te.encode(JSON.stringify(obj)), flag = 0;
  if ('CompressionStream' in self) { body = await pipe(body, new CompressionStream('deflate-raw')); flag = 1; }
  const plain = new Uint8Array(body.length + 1);
  plain[0] = flag; plain.set(body, 1);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv); out.set(ct, 12);
  return toB64(out);
}

async function unseal(str, key) {
  const raw = fromB64(str);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.subarray(0, 12) }, key, raw.subarray(12)));
  let body = plain.subarray(1);
  if (plain[0] === 1) body = await pipe(body, new DecompressionStream('deflate-raw'));
  return JSON.parse(td.decode(body));
}

// ---------- Vermittlung (ntfy-kompatibel: POST /thema, GET /thema/sse) ----------
class Relay {
  #parts = new Map();
  constructor(base, topic, key, onmsg) { Object.assign(this, { base, topic, key, onmsg }); }

  open() {
    return new Promise(res => {
      const es = this.es = new EventSource(`${this.base}/${this.topic}/sse`);
      es.onopen = () => res();
      es.onmessage = e => this.#onEvent(e.data);
      es.onerror = () => {}; // EventSource verbindet sich von selbst neu
      setTimeout(res, 4000);
    });
  }

  async #onEvent(raw) {
    let m;
    try {
      const ev = JSON.parse(raw);
      if (ev.event && ev.event !== 'message') return;
      m = JSON.parse(ev.message);
    } catch { return; }
    let d = m.d;
    if (m.n > 1) {
      const arr = this.#parts.get(m.k) || [];
      arr[m.i] = m.d;
      this.#parts.set(m.k, arr);
      if (arr.filter(x => x != null).length < m.n) return;
      this.#parts.delete(m.k);
      d = arr.join('');
    }
    let obj;
    try { obj = await unseal(d, this.key); } catch { return; } // fremde oder beschädigte Nachricht
    this.onmsg(obj);
  }

  async send(obj) {
    const d = await seal(obj, this.key);
    const k = Math.random().toString(36).slice(2, 8), n = Math.ceil(d.length / PART);
    for (let i = 0; i < n; i++) {
      const r = await fetch(`${this.base}/${this.topic}`, { method: 'POST', body: JSON.stringify({ k, i, n, d: d.slice(i * PART, (i + 1) * PART) }) })
        .catch(() => { throw new Error('Die Vermittlung ist nicht erreichbar. Ist das Gerät im WLAN bzw. online?'); });
      if (r.status === 429) throw new Error('Zu viele Verbindungsversuche. Bitte eine Minute warten.');
      if (!r.ok) throw new Error('Die Vermittlung antwortet nicht (' + r.status + ').');
    }
  }

  close() { this.es?.close(); }
}

const gathered = pc => new Promise(res => {
  if (pc.iceGatheringState === 'complete') return res();
  const done = () => { pc.removeEventListener('icegatheringstatechange', check); clearTimeout(t); res(); };
  const check = () => pc.iceGatheringState === 'complete' && done();
  pc.addEventListener('icegatheringstatechange', check);
  const t = setTimeout(done, 2500);
});
// TCP-Kandidaten braucht im WLAN niemand; ohne sie bleibt die Nachricht klein
const slim = sdp => sdp.split('\r\n').filter(l => !/^a=candidate:.* tcp /i.test(l)).join('\r\n');

// ---------- Die Verbindung selbst ----------
// role 'cam' = Handy (bietet an), role 'view' = Tablet (nimmt an)
// Ereignisse: 'state', 'open', 'close', 'message' (Steuerdaten), 'chunk' (Videostück), 'error'
export class Link extends EventTarget {
  state = 'idle'; // 'idle' | 'waiting' | 'connecting' | 'connected'
  relayBase = '';
  #id = Math.random().toString(36).slice(2, 10);
  #peer = null;
  #offerNo = 0;
  #tries = 0;
  #fails = 0;
  #stopped = true;

  constructor({ role, code, relay }) {
    super();
    Object.assign(this, { role, code, relayPref: relay });
  }

  async start() {
    this.#stopped = false;
    try {
      const { topic, key } = await derive(this.code);
      this.relayBase = await findRelay(this.relayPref);
      if (this.#stopped) return;
      this.relay = new Relay(this.relayBase, topic, key, m => this.#onSignal(m).catch(e => this.#error(e)));
      await this.relay.open();
    } catch (e) { this.#error(e); return; }
    if (this.#stopped) return;
    this.#set('waiting');
    this.hello();
    this.onVis = () => { if (!document.hidden && this.state === 'waiting') this.hello(); };
    document.addEventListener('visibilitychange', this.onVis);
  }

  stop() {
    this.#stopped = true;
    clearTimeout(this.retry);
    document.removeEventListener('visibilitychange', this.onVis);
    this.relay?.close();
    this.#drop();
    this.#set('idle');
  }

  // "Ich bin da" rufen – wer es hört, startet den Verbindungsaufbau
  hello() {
    this.#tries = 0;
    this.#sayHello();
  }

  #sayHello() {
    clearTimeout(this.retry);
    if (this.#stopped || this.state !== 'waiting') return;
    this.relay.send({ t: 'hello', from: this.role, id: this.#id }).catch(e => this.#error(e));
    // ein paar Wiederholungen, dann still warten (die Gegenseite meldet sich, sobald sie startet)
    const wait = [3000, 8000, 20000][this.#tries++];
    if (wait) this.retry = setTimeout(() => this.#sayHello(), wait);
  }

  #set(s) {
    if (this.state === s) return;
    this.state = s;
    this.dispatchEvent(new Event('state'));
  }
  #error(e) { this.dispatchEvent(new CustomEvent('error', { detail: e })); }

  async #onSignal(m) {
    if (this.#stopped || m.from === this.role) return;
    const fresh = this.state === 'waiting' || m.id !== this.#peer;
    if (this.role === 'cam') {
      if (m.t === 'hello' && fresh) await this.#offer(m.id);
      else if (m.t === 'answer' && m.to === this.#id && m.n === this.#offerNo && this.pc?.signalingState === 'have-local-offer') {
        await this.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp });
      }
    } else {
      if (m.t === 'hello' && fresh) await this.relay.send({ t: 'hello', from: 'view', id: this.#id });
      else if (m.t === 'offer' && m.to === this.#id) await this.#answer(m);
    }
  }

  #newPc() {
    this.#drop();
    this.#set('connecting');
    const pc = this.pc = new RTCPeerConnection({ iceServers: [] }); // nur direkte Wege im lokalen Netz
    pc.onconnectionstatechange = () => {
      if (pc !== this.pc) return;
      const s = pc.connectionState;
      if (s === 'failed' || s === 'closed') this.#lost();
      else if (s === 'disconnected') this.discTimer = setTimeout(() => { if (pc === this.pc && pc.connectionState !== 'connected') this.#lost(); }, 4000);
    };
    this.connTimer = setTimeout(() => { if (pc === this.pc && this.state !== 'connected') this.#lost(); }, 15000);
    return pc;
  }

  async #offer(peer) {
    const pc = this.#newPc();
    this.#peer = peer;
    this.#adopt(pc.createDataChannel('tk', { ordered: true }));
    await pc.setLocalDescription(await pc.createOffer());
    await gathered(pc);
    if (pc !== this.pc) return;
    await this.relay.send({ t: 'offer', from: 'cam', id: this.#id, to: peer, n: ++this.#offerNo, sdp: slim(pc.localDescription.sdp) });
  }

  async #answer(m) {
    const pc = this.#newPc();
    this.#peer = m.id;
    pc.ondatachannel = e => { if (pc === this.pc) this.#adopt(e.channel); };
    await pc.setRemoteDescription({ type: 'offer', sdp: m.sdp });
    await pc.setLocalDescription(await pc.createAnswer());
    await gathered(pc);
    if (pc !== this.pc) return;
    await this.relay.send({ t: 'answer', from: 'view', id: this.#id, to: m.id, n: m.n, sdp: slim(pc.localDescription.sdp) });
  }

  #adopt(dc) {
    this.dc = dc;
    dc.binaryType = 'arraybuffer';
    const opened = () => {
      if (dc !== this.dc || this.state === 'connected') return;
      clearTimeout(this.connTimer);
      this.#fails = 0;
      this.#set('connected');
      // Lebenszeichen: alle 2 s ein kurzes Signal. Bleibt die Gegenseite 6 s still, ist sie weg
      // (Seite geschlossen, Handy gesperrt, WLAN verloren) – das merkt WebRTC allein erst viel später.
      this.lastRx = performance.now();
      clearInterval(this.beat);
      this.beat = setInterval(() => {
        if (dc !== this.dc) return;
        if (performance.now() - this.lastRx > 6000) return this.#lost();
        try { dc.send('.'); } catch {}
      }, 2000);
      this.dispatchEvent(new Event('open'));
    };
    dc.onopen = opened;
    dc.onclose = () => { if (dc === this.dc) this.#lost(); };
    dc.onmessage = e => this.#onData(e.data);
    if (dc.readyState === 'open') opened();
  }

  #drop() {
    clearTimeout(this.connTimer); clearTimeout(this.discTimer); clearInterval(this.beat);
    const { pc, dc } = this;
    this.pc = this.dc = this.partial = null;
    try { dc?.close(); } catch {}
    try { pc?.close(); } catch {}
  }

  #lost() {
    const was = this.state;
    this.#drop();
    if (this.#stopped) return;
    this.#set('waiting');
    if (was === 'connected') this.dispatchEvent(new Event('close'));
    else if (++this.#fails >= 4) {
      // nicht endlos weiterprobieren – meist sind die Geräte in verschiedenen Netzen
      this.#fails = 0;
      this.#error(new Error('Handy und Tablet finden sich nicht. Sind beide im selben WLAN?'));
      return;
    }
    this.hello();
  }

  // ---------- Daten ----------
  get buffered() { return this.dc?.bufferedAmount ?? 0; }

  sendJSON(obj) {
    if (this.dc?.readyState !== 'open') return false;
    try { this.dc.send(JSON.stringify(obj)); return true; } catch { return false; }
  }

  // false = nicht gesendet (keine Verbindung oder Stau) – der Sender muss dann bis zum nächsten Schlüsselbild aussetzen
  sendChunk({ ts, type, data }) {
    const dc = this.dc;
    if (dc?.readyState !== 'open' || dc.bufferedAmount > HIGH_WATER) return false;
    try {
      for (let off = 0; off === 0 || off < data.length; off += FRAG) {
        const part = data.subarray(off, off + FRAG);
        const msg = new Uint8Array(9 + part.length);
        msg[0] = (type === 'key' ? 1 : 0) | (off === 0 ? 2 : 0) | (off + FRAG >= data.length ? 4 : 0);
        new DataView(msg.buffer).setFloat64(1, ts);
        msg.set(part, 9);
        dc.send(msg);
      }
      return true;
    } catch { return false; }
  }

  #onData(d) {
    this.lastRx = performance.now();
    if (typeof d === 'string') {
      if (d === '.') return; // Lebenszeichen
      let m;
      try { m = JSON.parse(d); } catch { return; }
      this.dispatchEvent(new CustomEvent('message', { detail: m }));
      return;
    }
    const u = new Uint8Array(d), flags = u[0];
    if (flags & 2) this.partial = { ts: new DataView(d).getFloat64(1), type: flags & 1 ? 'key' : 'delta', parts: [], size: 0 };
    const p = this.partial;
    if (!p) return;
    p.parts.push(u.subarray(9));
    p.size += u.length - 9;
    if (!(flags & 4)) return;
    this.partial = null;
    const data = new Uint8Array(p.size);
    let off = 0;
    for (const part of p.parts) { data.set(part, off); off += part.length; }
    this.dispatchEvent(new CustomEvent('chunk', { detail: { ts: p.ts, type: p.type, data } }));
  }
}
