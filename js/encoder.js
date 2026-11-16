// Kamerabilder → komprimierte Videostücke (WebCodecs).
// Läuft auf dem Gerät, an dem die Kamera hängt: am Handy oder – bei USB-Kamera – am PC selbst.
// Alle Zeitstempel sind Mikrosekunden auf der Uhr dieses Geräts (performance.now()).

export const nowUs = () => Math.round(performance.now() * 1000);

const CODECS = [
  'avc1.640033', 'avc1.640028', 'avc1.4d0028', 'avc1.42E01F', // H.264, von hoher zu einfacher Stufe
  'vp09.00.40.08',                                            // Ausweich für Geräte ohne H.264-Encoder
];
const KEY_EVERY_US = 500000; // alle 0,5 s ein Schlüsselbild: genaue Schnitte, schnelles Springen

export class Encoder extends EventTarget {
  running = false;
  hold = false;      // true = Bilder verwerfen (niemand hört zu oder die Funkstrecke ist verstopft)
  width = 0; height = 0;
  codec = '';
  frames = 0;        // kodierte Bilder seit Start (für die fps-Anzeige)
  #gen = 0;
  restarts = 0;      // so oft musste der Encoder neu angelegt werden
  #soft = false;     // true = Hardware-Encoder kommt nicht in Gang, Software-Encoder verwenden
  #outTimes = [];    // Zeitpunkte der letzten Ausgaben
  #checkFrom = 0;
  #attempts = 0;

  // Den Hardware-Encoder einmal "aufwärmen", BEVOR die Kamera geöffnet wird.
  // Gemessen in Chrome am Mac: der allererste Hardware-Encoder nach dem Browser-Start braucht 6–9 s
  // bis zum ersten Bild, und eine in dieser Zeit schon offene Kamera liefert danach keine Bilder mehr.
  // Auf Geräten ohne dieses Problem dauert das Aufwärmen nur einen Augenblick.
  static #warm = null;
  static warmUp() {
    return Encoder.#warm ??= (async () => {
      if (!('VideoEncoder' in window)) return;
      let out = 0, enc;
      try {
        const cfg = { codec: CODECS[0], width: 1280, height: 720, bitrate: 4e6, framerate: 30, latencyMode: 'realtime', avc: { format: 'avc' } };
        if (!(await VideoEncoder.isConfigSupported(cfg)).supported) return;
        enc = new VideoEncoder({ output: () => out++, error: () => { out = 99; } });
        enc.configure(cfg);
        const cv = new OffscreenCanvas(1280, 720), g = cv.getContext('2d');
        const t0 = performance.now();
        for (let i = 0; out < 2 && performance.now() - t0 < 12000; i++) {
          g.fillStyle = i % 2 ? '#111' : '#222'; g.fillRect(0, 0, 1280, 720);
          if (enc.encodeQueueSize < 2) { const f = new VideoFrame(cv, { timestamp: i * 33333 }); enc.encode(f, { keyFrame: i === 0 }); f.close(); }
          await new Promise(r => setTimeout(r, 40));
        }
      } catch {} finally { try { enc?.close(); } catch {} }
    })();
  }

  async start({ video, track, bitrate, fps }) {
    this.stop();
    this.running = true;
    this.bitrate = bitrate * 1e6;
    this.fps = fps || 30;
    this.video = video;
    this.base = 0; this.ft0 = null; this.lastTs = 0; this.lastKeyTs = -Infinity;
    this.width = this.height = 0;
    this.#checkFrom = performance.now();
    this.#outTimes = [];
    this.watch = setInterval(() => this.#watchdog(), 500);

    if (track && 'MediaStreamTrackProcessor' in window) {
      this.track = track.clone();
      const reader = new MediaStreamTrackProcessor({ track: this.track }).readable.getReader();
      this.reader = reader;
      (async () => {
        while (this.running && this.reader === reader) {
          const { value: frame, done } = await reader.read().catch(() => ({ done: true }));
          if (done) break;
          this.#onFrame(frame, frame.timestamp);
        }
      })();
    } else {
      // Safari und Videodateien: Bilder vom Video-Element abgreifen
      const loop = (_, meta) => {
        if (!this.running) return;
        this.rvfc = video.requestVideoFrameCallback(loop);
        if (!video.videoWidth) return;
        let frame;
        try { frame = new VideoFrame(video, { timestamp: 0 }); } catch { return; }
        this.#onFrame(frame, meta?.mediaTime != null ? meta.mediaTime * 1e6 : NaN);
      };
      this.rvfc = video.requestVideoFrameCallback(loop);
    }
  }

  stop() {
    this.running = false;
    clearInterval(this.watch);
    this.reader?.cancel().catch(() => {});
    this.track?.stop();
    if (this.rvfc && this.video) this.video.cancelVideoFrameCallback(this.rvfc);
    try { this.enc?.close(); } catch {}
    this.enc = this.reader = this.track = this.rvfc = null;
  }

  forceKey() { this.lastKeyTs = -Infinity; }

  // Überwachung: Läuft die Kamera, aber es kommen kaum Bilder heraus, hängt die Kamera-Kette.
  // Dann 'stalled' melden – wer den Encoder benutzt, öffnet die Kamera neu (nur das hilft, siehe warmUp).
  // Nach drei Versuchen auf den Software-Encoder ausweichen, nach sechs aufgeben.
  get warming() { return this.running && !this.hold && this.#recent(2000) < 5; }
  #recent(ms) { const t = performance.now() - ms; return this.#outTimes.reduce((n, x) => n + (x > t), 0); }

  #watchdog() {
    const now = performance.now();
    const sourceIdle = this.track ? (this.track.muted || this.track.readyState !== 'live') : (this.video.paused || this.video.ended);
    if (!this.running || this.configuring || this.hold || document.hidden || sourceIdle) { this.#checkFrom = now; return; }
    if (now - this.#checkFrom < 4000) return;
    if (this.#recent(3000) >= 9) { if (now - this.#checkFrom > 30000) this.#attempts = 0; return; } // gesund (≥ 3 Bilder/s)
    this.#checkFrom = now;
    this.#attempts++;
    if (this.#attempts > 6) {
      if (!this.gaveUp) this.dispatchEvent(new CustomEvent('error', { detail: new Error('Die Kamera liefert zu wenige Bilder. Bitte die Seite neu laden.') }));
      this.gaveUp = true;
      return;
    }
    if (this.#attempts > 3) this.#soft = true;
    this.restarts++;
    this.dispatchEvent(new Event('stalled'));
  }

  // Gleichmäßige Zeitstempel: Abstände von der Kamera, Nullpunkt von der Geräte-Uhr
  #stamp(ft) {
    const now = nowUs();
    if (Number.isFinite(ft) && this.ft0 != null) {
      const ts = this.base + (ft - this.ft0);
      if (ts > this.lastTs && Math.abs(ts - now) < 250000) return (this.lastTs = ts);
    }
    this.base = Math.max(now, this.lastTs + 1000);
    this.ft0 = Number.isFinite(ft) ? ft : null;
    return (this.lastTs = this.base);
  }

  async #configure(w, h) {
    const gen = ++this.#gen;
    try { this.enc?.close(); } catch {}
    this.enc = null;
    let cfg;
    // Normal entscheidet der Browser (meist Hardware). Nach einem Hänger zuerst Software probieren.
    for (const hw of this.#soft ? ['prefer-software', 'no-preference'] : ['no-preference']) {
      for (const codec of CODECS) {
        const c = { codec, width: w, height: h, bitrate: this.bitrate, framerate: this.fps, latencyMode: 'realtime', hardwareAcceleration: hw };
        if (codec.startsWith('avc1')) c.avc = { format: 'avc' };
        const s = await VideoEncoder.isConfigSupported(c).catch(() => null);
        if (s?.supported) { cfg = c; break; }
      }
      if (cfg) break;
    }
    if (gen !== this.#gen || !this.running) return;
    if (!cfg) throw new Error(`Dieses Gerät kann ${w}×${h} nicht aufnehmen (kein passender Video-Encoder)`);
    const enc = new VideoEncoder({
      output: (chunk, meta) => this.#onChunk(chunk, meta, gen),
      error: e => this.dispatchEvent(new CustomEvent('error', { detail: e })),
    });
    enc.configure(cfg);
    this.enc = enc;
    this.width = w; this.height = h; this.codec = cfg.codec;
    this.sentConfig = false;
    this.#checkFrom = performance.now();
    this.forceKey();
  }

  #onFrame(frame, ft) {
    // H.264 braucht gerade Seitenlängen
    const w = frame.displayWidth - frame.displayWidth % 2, h = frame.displayHeight - frame.displayHeight % 2;
    if (w !== this.width || h !== this.height) {
      frame.close();
      // neue Bildgröße (Start oder Handy gedreht): Encoder neu einrichten
      this.configuring ??= this.#configure(w, h)
        .catch(e => this.dispatchEvent(new CustomEvent('error', { detail: e })))
        .finally(() => { this.configuring = null; });
      return;
    }
    const enc = this.enc;
    if (this.hold || !enc || enc.state !== 'configured' || enc.encodeQueueSize > 4) { frame.close(); return; }
    const ts = this.#stamp(ft);
    const f = new VideoFrame(frame, { timestamp: ts });
    frame.close();
    const key = ts - this.lastKeyTs >= KEY_EVERY_US;
    if (key) this.lastKeyTs = ts;
    try { enc.encode(f, { keyFrame: key }); } catch (e) { this.dispatchEvent(new CustomEvent('error', { detail: e })); }
    f.close();
  }

  #onChunk(chunk, meta, gen) {
    if (gen !== this.#gen) return;
    this.#outTimes.push(performance.now());
    if (this.#outTimes.length > 240) this.#outTimes.splice(0, 120);
    const dc = meta?.decoderConfig;
    if (dc && !this.sentConfig) {
      this.sentConfig = true;
      const d = dc.description;
      this.config = {
        codec: dc.codec || this.codec,
        width: this.width, height: this.height,
        description: d ? new Uint8Array(d.buffer ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : d.slice(0)) : null,
      };
      this.dispatchEvent(new CustomEvent('config', { detail: this.config }));
    }
    if (!this.sentConfig) return;
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    this.frames++;
    this.dispatchEvent(new CustomEvent('chunk', { detail: { ts: chunk.timestamp, type: chunk.type, data } }));
  }
}
