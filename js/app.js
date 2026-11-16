// Anzeige-Seite (Tablet oder PC): empfängt das Kamerabild, erkennt Spieler, schneidet und zeigt Szenen.

import { settings, profile, updateProfile, DEFAULT_PROFILE, save } from './settings.js';
import { listCameras, openCamera, stopStream, trackInfo, cameraError } from './camera.js';
import { Encoder, nowUs } from './encoder.js';
import { ClipBuffer } from './buffer.js';
import { StreamView } from './view.js';
import { Detector, SceneTracker } from './detector.js';
import { Link, newCode, formatCode } from './link.js';
import { Player, SPEEDS } from './player.js';
import { putClip, deleteClip, getClipData, allClips, prune } from './storage.js';
import { ic } from './icons.js';
import qrcode from '../vendor/qrcode.js';

const $ = s => document.querySelector(s);
const main = $('main');
const live = $('#live');
const liveCanvas = $('#liveCanvas');
const overlay = $('#overlay');
const livePane = $('#livePane');
const params = new URLSearchParams(location.hash.slice(1));

const buffer = new ClipBuffer();
const encoder = new Encoder();                       // nur bei "Kamera an diesem Gerät"
const liveView = new StreamView(liveCanvas, buffer); // nur bei "Handy als Kamera"
const delayView = new StreamView($('#delayCanvas'), buffer);
const detector = new Detector();
const tracker = new SceneTracker();
const players = [new Player($('#p1'), 'p1'), new Player($('#p2'), 'p2')];
let active = players[0];
let clips = [];
let mode = null;       // 'phone' | 'local' | 'file'
let stream = null;     // lokale Kamera
let link = null;       // Verbindung zum Handy
let phone = null;      // letzte Statusmeldung vom Handy
let phoneBye = false;  // true = die Übertragung wurde am Handy mit Absicht beendet
const BYE = 'Die Übertragung wurde am Handy beendet. Zum Weitermachen dort „Kamera starten“ tippen.';

// Bild vom Handy drehen (nur bei "Handy als Kamera"): Live-Bild, verzögertes Bild und gespeicherte Szenen
function applyRotation() {
  const r = mode === 'phone' ? (settings.rotate || 0) : 0;
  liveView.rotation = delayView.rotation = buffer.rotation = r;
}
let delayOn = false;

// ---------- Hilfen ----------
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}
const fmtTime = d => new Date(d).toLocaleTimeString('de-AT');
const fmtSec = s => s.toFixed(1).replace('.', ',') + ' s';
const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const coarse = matchMedia('(pointer: coarse)').matches;

const supported = 'VideoDecoder' in window && 'VideoEncoder' in window;
if (!supported) {
  $('#startErr').textContent = window.isSecureContext
    ? 'Dieser Browser ist zu alt. Bitte Safari ab iOS 16.4, Chrome oder Edge verwenden.'
    : 'Die Seite muss über https:// geöffnet werden.';
  $('#phoneBtn').disabled = $('#localBtn').disabled = true;
}

// ---------- Quelle: starten, stoppen ----------
function showBox(which) { // 'start' | 'pair' | null
  $('#startBox').hidden = which !== 'start';
  $('#pairBox').hidden = which !== 'pair';
}

let startNo = 0; // zählt Startversuche, damit ein überholter Start nichts mehr anrichtet
function stopSource() {
  startNo++;
  tracker.flush(profile());
  encoder.stop();
  stopStream(stream); stream = null;
  if (live.src) { URL.revokeObjectURL(live.src); live.removeAttribute('src'); live.load(); }
  live.srcObject = null;
  link?.stop(); link = null; phone = null;
  liveView.stop();
  delayView.stop();
  detector.stop();
  buffer.reset(null);
  mode = null;
  applyRotation();
  livePane.classList.remove('remote');
  $('#camInfo').textContent = '';
  setRec();
}

function beginDetect() {
  detector.start(liveFrame, profile);
  if (delayOn) delayView.start(settings.delay);
  setRec();
}

// Das aktuelle Live-Bild für Erkennung und Vorschaubilder
function liveFrame() {
  if (mode === 'phone') {
    return liveView.lastTs ? { el: liveCanvas, w: liveCanvas.width, h: liveCanvas.height, t: liveView.lastTs } : null;
  }
  return live.videoWidth && live.readyState >= 2 ? { el: live, w: live.videoWidth, h: live.videoHeight, t: nowUs() } : null;
}

encoder.addEventListener('config', e => buffer.configure(e.detail));
encoder.addEventListener('chunk', e => buffer.push(e.detail));
encoder.addEventListener('error', e => toast('Aufnahme-Fehler: ' + (e.detail?.message || e.detail)));
// Kamera-Kette hängt: Kamera neu öffnen (bei einer Videodatei genügt ein neuer Encoder)
encoder.addEventListener('stalled', () => {
  if (mode === 'local') startLocal();
  else if (mode === 'file') encoder.start({ video: live, bitrate: settings.bitrate, fps: 30 });
});
buffer.addEventListener('reset', () => {
  tracker.reset();
  const c = buffer.config;
  if (c) $('#camInfo').textContent = $('#camInfo').textContent.replace(/\d+×\d+/, `${c.width}×${c.height}`);
});

// --- Kamera an diesem Gerät ---
async function startLocal() {
  stopSource();
  showBox(null);
  $('#startErr').textContent = '';
  const my = ++startNo;
  mode = 'local';
  settings.source = 'local';
  setRec();
  try {
    await Encoder.warmUp(); // erst den Encoder aufwärmen, dann die Kamera öffnen
    if (my !== startNo) return;
    stream = await openCamera(settings);
    if (my !== startNo) { stopStream(stream); stream = null; return; }
    live.srcObject = stream;
    await live.play();
    const info = trackInfo(stream);
    await encoder.start({ video: live, track: stream.getVideoTracks()[0], bitrate: settings.bitrate, fps: Math.round(info.fps || settings.fps) });
    $('#camInfo').textContent = `${info.label || 'Kamera'} · ${info.width}×${info.height} · ${Math.round(info.fps || 0)} fps`;
    const track = stream.getVideoTracks()[0];
    track.addEventListener('ended', () => {
      if (mode !== 'local' || stream?.getVideoTracks()[0] !== track) return;
      stopSource();
      showBox('start');
      $('#startErr').textContent = 'Die Kamera wurde getrennt. Kabel und Webcam-App prüfen.';
    });
    beginDetect();
  } catch (e) {
    console.error(e);
    if (my !== startNo) return;
    stopSource();
    showBox('start');
    $('#startErr').textContent = cameraError(e);
  }
}

// --- Videodatei (zum Ausprobieren) ---
async function startFile(blob) {
  stopSource();
  showBox(null);
  const my = ++startNo;
  mode = 'file';
  setRec();
  try {
    await Encoder.warmUp();
    if (my !== startNo) return;
    live.src = URL.createObjectURL(blob);
    live.loop = true;
    await live.play();
    await encoder.start({ video: live, bitrate: settings.bitrate, fps: 30 });
    $('#camInfo').textContent = `Videodatei · ${live.videoWidth}×${live.videoHeight}`;
    beginDetect();
  } catch (e) {
    if (my !== startNo) return;
    stopSource();
    showBox('start');
    $('#startErr').textContent = 'Diese Videodatei lässt sich nicht abspielen.';
  }
}

// --- Handy als Kamera ---
function startPhone() {
  stopSource();
  mode = 'phone';
  phoneBye = false;
  applyRotation();
  settings.source = 'phone';
  if (!settings.code) settings.code = params.get('code') || newCode();
  livePane.classList.add('remote');
  showPair('Warte auf das Handy …');
  link = new Link({ role: 'view', code: settings.code, relay: settings.relay });
  const l = link;
  l.addEventListener('state', () => {
    if (l !== link) return;
    if (l.state === 'connecting') $('#pairState').textContent = 'Handy gefunden – verbinde …';
    else if (l.state === 'connected') { $('#pairState').textContent = 'Verbunden – warte auf das Bild …'; $('#pairErr').textContent = ''; }
    else if (l.state === 'waiting') $('#pairState').textContent = phoneBye ? BYE : 'Warte auf das Handy …';
    setRec();
  });
  l.addEventListener('open', () => { phoneBye = false; buffer.reset(null); l.sendJSON(camWish()); }); // neues Handy / neu verbunden: frischer Speicher
  l.addEventListener('close', () => {
    if (l !== link) return;
    tracker.flush(profile());
    liveView.stop();
    detector.stop();
    showPair(phoneBye ? BYE : 'Verbindung zum Handy unterbrochen. Warte …');
    if (!phoneBye) toast('Verbindung zum Handy unterbrochen');
  });
  l.addEventListener('error', e => { if (l === link) $('#pairErr').textContent = e.detail?.message || String(e.detail); });
  l.addEventListener('chunk', e => { if (l === link) buffer.push(e.detail); });
  l.addEventListener('message', e => { if (l === link) onPhoneMessage(e.detail); });
  l.start();
}

// Was das Handy einstellen soll
const camWish = () => ({ t: 'set', resolution: settings.resolution, fps: settings.fps, bitrate: settings.bitrate, deviceId: settings.phoneCam });

async function onPhoneMessage(m) {
  if (m.t === 'config') {
    let cfg = { codec: m.codec, width: m.width, height: m.height, description: m.description ? Uint8Array.from(atob(m.description), c => c.charCodeAt(0)) : null };
    // sofort übernehmen, die ersten Bilder kommen direkt hinterher
    if (!buffer.configure(cfg) && liveView.on) return; // Handy hat nur seinen Encoder neu gestartet
    cfg = buffer.config;
    liveView.start(0);
    showBox(null);
    beginDetect();
    const dc = { codec: cfg.codec, codedWidth: cfg.width, codedHeight: cfg.height };
    if (cfg.description) dc.description = cfg.description;
    const ok = await VideoDecoder.isConfigSupported(dc).then(s => s.supported, () => false);
    if (!ok && buffer.config === cfg) {
      liveView.stop();
      showPair('Das Bild kommt an, lässt sich aber nicht anzeigen');
      $('#pairErr').textContent = `Dieses Gerät kann das Videoformat des Handys (${cfg.codec}) nicht anzeigen.`;
    }
  } else if (m.t === 'info') {
    phone = m;
    $('#camInfo').textContent = `📱 ${m.label || 'Handy'} · ${m.width}×${m.height} · ${m.fps} fps` + (m.dropped ? ' · Funk langsam!' : '');
  } else if (m.t === 'bye') {
    phoneBye = true;
    tracker.flush(profile());
    liveView.stop();
    detector.stop();
    showPair(BYE);
  } else if (m.t === 'error') {
    showPair('Das Handy meldet ein Problem');
    $('#pairErr').textContent = m.message;
  }
}
liveView.onError = () => { $('#pairErr').textContent = 'Das Bild vom Handy lässt sich nicht anzeigen.'; showBox('pair'); };

function phoneUrl() {
  const u = new URL('kamera.html', location.href);
  u.hash = 'c=' + settings.code;
  return u.href;
}

function showPair(state) {
  showBox('pair');
  $('#pairState').textContent = state;
  $('#pairCode').textContent = formatCode(settings.code);
  const url = phoneUrl();
  $('#pairUrl').textContent = url.split('#')[0].replace(/^https?:\/\//, '');
  const c = $('#qr');
  // "localhost" kann ein Handy nicht erreichen: dann keinen QR-Code zeigen, sondern einen Hinweis
  c.hidden = isLocalhost;
  $('#pairLocal').hidden = !isLocalhost;
  if (isLocalhost) return;
  const q = qrcode(0, 'M');
  q.addData(url);
  q.make();
  const n = q.getModuleCount(), cell = 6, pad = 3;
  c.width = c.height = (n + pad * 2) * cell;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#000';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) g.fillRect((x + pad) * cell, (y + pad) * cell, cell, cell);
}

$('#phoneBtn').onclick = startPhone;
$('#localBtn').onclick = startLocal;
$('#fileLink').onclick = e => { e.preventDefault(); $('#fileInput').click(); };
$('#fileInput').onchange = e => { const f = e.target.files[0]; if (f) startFile(f); e.target.value = ''; };
$('#pairRetry').onclick = () => { $('#pairErr').textContent = ''; link?.hello(); };
$('#pairBack').onclick = () => { stopSource(); settings.source = ''; showBox('start'); };
$('#pairNew').onclick = () => {
  if (!confirm('Neuen Code erzeugen? Das Handy muss danach den neuen Code scannen.')) return;
  settings.code = newCode();
  startPhone();
};

function setRec() {
  const r = $('#recState');
  const rec = mode && buffer.chunks.length && buffer.now() - buffer.latestTs < 2e6;
  const starting = (mode === 'local' || mode === 'file') && !rec;
  $('#liveHint').hidden = !starting || !$('#startBox').hidden;
  $('#rotBtn').hidden = !(mode === 'phone' && link?.state === 'connected');
  const lf = liveFrame();
  main.dataset.video = lf && lf.h > lf.w ? 'portrait' : 'landscape'; // Hochformat: Bilder nebeneinander statt übereinander
  r.className = 'pill' + (rec ? ' rec' : '');
  const secs = rec ? Math.round((buffer.latestTs - buffer.oldestTs) / 1e6) : 0;
  const html = rec ? `AUFNAHME<span class="x"> · ${secs} s</span>`
    : starting ? 'Kamera startet …'
    : mode === 'phone' ? (link?.state === 'connected' ? 'Handy verbunden' : 'Warte auf Handy')
    : 'Kamera aus';
  if (r.dataset.html !== html) { r.dataset.html = html; r.innerHTML = html; }
  r.title = rec ? `Aufnahme läuft – die letzten ${secs} Sekunden sind zwischengespeichert` : '';
}
setInterval(setRec, 1000);

// ---------- Erkennung & Szenen ----------
let best = null;   // bestes Vorschaubild der laufenden Szene
let lastDet = 0;

detector.addEventListener('status', () => updateDetState());
detector.addEventListener('result', e => {
  const r = e.detail;
  const p = profile();
  lastDet = performance.now();
  tracker.update(r.present, r.t, p);
  drawOverlay(r, p);
  updateDetState(r);
  if (tracker.active && r.present) {
    const score = r.best ? r.best.h : r.motion;
    if (!best || (score > best.score && performance.now() - best.at > 300)) {
      best = { score, at: performance.now(), thumb: snapshot() };
    }
  }
});
// Kommt kein Bild mehr (Funk weg), läuft die Uhr trotzdem weiter: eine offene Szene sauber beenden
setInterval(() => {
  if (tracker.active && performance.now() - lastDet > 1000) tracker.update(false, buffer.now(), profile());
}, 500);

tracker.addEventListener('start', () => { best = null; });
tracker.addEventListener('scene', e => {
  const thumb = best?.thumb;
  best = null;
  cutWhenReady(e.detail.start, e.detail.end, 'auto', thumb);
});

function updateDetState(r) {
  const d = $('#detState');
  const ai = detector.aiStatus;
  if (!r) { d.textContent = ai; d.className = 'pill' + (detector.od ? ' ok' : ''); return; }
  const what = r.mode === 'person' ? 'Spieler' : 'Bewegung';
  d.textContent = tracker.active ? 'Szene läuft …' : r.present ? `${what} erkannt` : (r.mode === 'person' ? ai : 'Bewegungsmodus');
  d.className = 'pill' + (tracker.active ? ' scene' : r.present ? ' hot' : detector.od ? ' ok' : '');
}

function snapshot() {
  const f = liveFrame();
  if (!f) return null;
  const c = document.createElement('canvas');
  c.width = 320; c.height = Math.round(320 * f.h / f.w);
  c.getContext('2d').drawImage(f.el, 0, 0, c.width, c.height);
  return c;
}

const canvasToBuffer = c => c ? new Promise(r => c.toBlob(b => r(b ? b.arrayBuffer() : null), 'image/jpeg', 0.75)) : Promise.resolve(null);

async function cutWhenReady(start, end, source, thumbCanvas) {
  // warten, bis das Ende der Szene aufgenommen ist
  const deadline = performance.now() + 5000;
  while (buffer.latestTs < end && performance.now() < deadline) await new Promise(r => setTimeout(r, 100));
  const cut = buffer.cut(start, end);
  if (!cut) { if (source === 'manual') toast('Noch nicht genug aufgenommen'); return; }
  const clip = {
    id: crypto.randomUUID(),
    createdAt: Date.now() - Math.max(0, (buffer.now() - cut.start) / 1000),
    duration: cut.duration, fps: cut.fps, width: cut.width, height: cut.height,
    thumb: await canvasToBuffer(thumbCanvas || snapshot()),
    starred: false, source, profile: settings.profile,
  };
  try {
    await putClip(clip, cut.data);
  } catch (e) {
    console.error(e);
    return toast('Speicher voll – bitte alte Szenen löschen');
  }
  clips.unshift(clip);
  const removed = await prune(settings.maxClips).catch(() => []);
  if (removed.length) clips = clips.filter(c => !removed.includes(c.id));
  renderClips(clip.id);
  if (source === 'manual') toast(`Szene gespeichert (${fmtSec(clip.duration)})`);
  autoShow(clip, cut.data, source === 'manual');
}

function autoShow(clip, data, force) {
  const target = players[0];
  if (!force && (!settings.autoShow || target.busy)) return;
  if (!force && main.dataset.layout === 'clip-clip' && players.some(p => p.busy)) return;
  show(target, clip, { speed: +settings.autoSpeed, loop: settings.autoLoop }, data);
}

// Szene in einen Player laden (Video erst jetzt aus dem Speicher holen)
async function show(player, clip, opts, data) {
  const token = player.token = (player.token || 0) + 1;
  data ??= await getClipData(clip.id).catch(() => null);
  if (token !== player.token) return; // inzwischen wurde eine andere Szene gewählt
  if (!data) return toast('Diese Szene ist nicht mehr gespeichert');
  player.load(clip, new Blob([data], { type: 'video/mp4' }), opts);
  markLoaded();
}

function markScene() {
  if (!buffer.chunks.length) return toast('Es läuft noch keine Aufnahme');
  const now = buffer.latestTs;
  cutWhenReady(now - settings.manualLen * 1e6, now + 0.8e6, 'manual', snapshot());
}
$('#markBtn').onclick = markScene;
$('#rotBtn').onclick = () => {
  settings.rotate = ((settings.rotate || 0) + 90) % 360;
  applyRotation();
  toast(settings.rotate ? `Bild um ${settings.rotate}° gedreht – neue Szenen werden so gespeichert` : 'Bild wieder ungedreht');
};

// ---------- Overlay: Erkennung + Bereich ----------
function videoRect() {
  const W = overlay.clientWidth, H = overlay.clientHeight;
  const f = liveFrame();
  const vw = f?.w || 16, vh = f?.h || 9;
  const s = Math.min(W / vw, H / vh);
  return { x: (W - vw * s) / 2, y: (H - vh * s) / 2, w: vw * s, h: vh * s, W, H };
}

let zoning = null;
function drawOverlay(r, p) {
  const dpr = devicePixelRatio || 1;
  const vr = videoRect();
  if (vr.W < 20) return; // Live-Bild ist gerade ausgeblendet
  if (overlay.width !== Math.round(vr.W * dpr) || overlay.height !== Math.round(vr.H * dpr)) { overlay.width = Math.round(vr.W * dpr); overlay.height = Math.round(vr.H * dpr); }
  const g = overlay.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, vr.W, vr.H);
  const X = x => vr.x + x * vr.w, Y = y => vr.y + y * vr.h;

  const zone = zoning?.rect || p.zone;
  if (zone) {
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.beginPath();
    g.rect(vr.x, vr.y, vr.w, vr.h);
    g.rect(X(zone.x), Y(zone.y), zone.w * vr.w, zone.h * vr.h);
    g.fill('evenodd');
    g.setLineDash([8, 6]); g.strokeStyle = '#ffb020'; g.lineWidth = 2;
    g.strokeRect(X(zone.x), Y(zone.y), zone.w * vr.w, zone.h * vr.h);
    g.setLineDash([]);
  }
  if (delayOn || !r) return;

  if (r.mode === 'person') {
    // Mindestgröße als Balken links
    g.fillStyle = 'rgba(255,176,32,.85)';
    g.fillRect(vr.x + 6, Y(1) - p.minHeight * vr.h - 6, 6, p.minHeight * vr.h);
    g.font = '600 13px system-ui';
    for (const b of r.boxes) {
      g.lineWidth = b.counted ? 3 : 1.5;
      g.strokeStyle = b.counted ? '#35d07f' : 'rgba(200,210,220,.55)';
      g.strokeRect(X(b.x), Y(b.y), b.w * vr.w, b.h * vr.h);
      const label = b.counted ? 'Spieler' : b.reason;
      g.fillStyle = b.counted ? '#35d07f' : 'rgba(30,36,44,.8)';
      const tw = g.measureText(label).width + 10;
      g.fillRect(X(b.x), Math.max(vr.y, Y(b.y) - 20), tw, 20);
      g.fillStyle = b.counted ? '#04150c' : '#cfd6de';
      g.fillText(label, X(b.x) + 5, Math.max(vr.y, Y(b.y) - 20) + 14);
    }
  } else {
    const lvl = Math.min(1, r.motion / (p.motionLevel * 2));
    g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(vr.x + 10, Y(1) - 22, 160, 12);
    g.fillStyle = r.present ? '#35d07f' : '#8b97a6'; g.fillRect(vr.x + 10, Y(1) - 22, 160 * lvl, 12);
    g.fillStyle = '#ffb020'; g.fillRect(vr.x + 10 + 80, Y(1) - 25, 2, 18);
  }
}

function norm(e) {
  const vr = videoRect(), b = overlay.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (e.clientX - b.left - vr.x) / vr.w)),
    y: Math.min(1, Math.max(0, (e.clientY - b.top - vr.y) / vr.h)),
  };
}
function setZoning(on) {
  livePane.classList.toggle('zoning', on);
  $('#zoneBtn').classList.toggle('on', on);
}
const updateZoneUi = () => { const z = !!profile().zone; $('#zoneClear').hidden = !z; $('#zoneBtn').hidden = z; };
$('#zoneBtn').onclick = () => {
  setZoning(!livePane.classList.contains('zoning'));
  if (livePane.classList.contains('zoning')) toast('Jetzt im Live-Bild einen Rahmen um den Spielbereich ziehen');
};
$('#zoneClear').onclick = () => { updateProfile({ zone: null }); updateZoneUi(); drawOverlay(detector.last, profile()); toast('Bereich entfernt – das ganze Bild wird erkannt'); };
overlay.addEventListener('pointerdown', e => {
  if (!livePane.classList.contains('zoning')) return;
  overlay.setPointerCapture(e.pointerId);
  const a = norm(e);
  zoning = { a, rect: { x: a.x, y: a.y, w: 0, h: 0 } };
});
overlay.addEventListener('pointermove', e => {
  if (!zoning) return;
  const b = norm(e), a = zoning.a;
  zoning.rect = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
  drawOverlay(detector.last, profile());
});
const endZone = () => {
  if (!zoning) return;
  const r = zoning.rect;
  zoning = null;
  setZoning(false);
  if (r.w > 0.05 && r.h > 0.05) { updateProfile({ zone: r }); toast('Erkennungs-Bereich gespeichert'); }
  updateZoneUi();
  drawOverlay(detector.last, profile());
};
overlay.addEventListener('pointerup', endZone);
overlay.addEventListener('pointercancel', endZone);

// ---------- Live / Verzögert ----------
function setDelay(on) {
  delayOn = on;
  if (on && mode) delayView.start(settings.delay); else delayView.stop();
  livePane.classList.toggle('delaying', on);
  $('#delayBadge').textContent = `VERZÖGERT ${settings.delay} s`;
  $('#liveBtn').classList.toggle('on', !on);
  $('#delayBtn').classList.toggle('on', on);
  $('#delayBtn').textContent = `Verzögert ${settings.delay} s`;
}
$('#liveBtn').onclick = () => setDelay(false);
$('#delayBtn').onclick = () => setDelay(true);

// ---------- Layout & Player ----------
function setLayout(l) {
  main.dataset.layout = l;
  settings.layout = l;
  document.querySelectorAll('#layoutSeg button').forEach(b => b.classList.toggle('on', b.dataset.layout === l));
  setActive(l === 'clip-clip' ? active : players[0]);
  if (l === 'clip-clip' && !players[1].clip) {
    // zweiten Player mit der vorherigen Szene füllen
    const i = clips.indexOf(players[0].clip);
    const other = clips[i + 1] || clips[0];
    if (other && other !== players[0].clip) show(players[1], other, { play: false, speed: players[0].speed });
  }
  markLoaded();
}
document.querySelectorAll('#layoutSeg button').forEach(b => b.onclick = () => setLayout(b.dataset.layout));

function setActive(p) {
  active = p;
  players.forEach(x => x.root.classList.toggle('active', x === p && main.dataset.layout === 'clip-clip'));
}
let syncOn = false;
players.forEach(p => {
  p.root.addEventListener('pointerdown', () => setActive(p), true);
  p.addEventListener('sync', e => {
    if (syncOn && main.dataset.layout === 'clip-clip') players.find(x => x !== p).applySync(e.detail);
  });
  p.addEventListener('hint', e => toast(e.detail));
  p.addEventListener('star', e => toggleStar(e.detail));
  p.addEventListener('export', e => exportClip(e.detail));
});
$('#syncBtn').onclick = () => {
  syncOn = !syncOn;
  $('#syncBtn').classList.toggle('on', syncOn);
  toast(syncOn ? 'Beide Szenen laufen gemeinsam' : 'Szenen einzeln steuern');
};

// ---------- Szenen-Liste ----------
function renderClips(newId) {
  const box = $('#clips');
  const list = $('#onlyStar').checked ? clips.filter(c => c.starred) : clips;
  $('#clipCount').textContent = clips.length ? `(${clips.length})` : '';
  if (!list.length) {
    box.innerHTML = `<p class="muted pad">${clips.length ? 'Keine Szenen mit Stern.' : 'Noch keine Szenen. Sobald jemand ins Bild kommt, erscheinen sie hier.'}</p>`;
    return;
  }
  box.innerHTML = '';
  for (const c of list) {
    if (c.thumb && !c.thumbUrl) c.thumbUrl = URL.createObjectURL(new Blob([c.thumb], { type: 'image/jpeg' }));
    const el = document.createElement('div');
    el.className = 'clip' + (c.id === newId ? ' new' : '');
    el.dataset.id = c.id;
    el.innerHTML = `
      <img src="${c.thumbUrl || ''}" alt="" draggable="false">
      <div class="meta">
        <b>${fmtTime(c.createdAt)}</b>
        <span>${fmtSec(c.duration)} · <span class="tag ${c.source}">${c.source === 'manual' ? 'markiert' : 'auto'}</span></span>
        <div class="acts">
          <button class="${c.starred ? 'set' : ''}" data-act="star" title="Mit Stern behalten (S)" aria-label="Behalten">${ic(c.starred ? 'star-on' : 'star')}</button>
          <button data-act="export" title="Als Video speichern (E)" aria-label="Speichern">${ic('save')}</button>
          <button data-act="del" title="Löschen (Entf)" aria-label="Löschen">${ic('trash')}</button>
        </div>
      </div>`;
    box.appendChild(el);
  }
  markLoaded();
}

function markLoaded() {
  const two = main.dataset.layout === 'clip-clip';
  document.querySelectorAll('.clip').forEach(el => {
    el.classList.toggle('in-p1', players[0].clip?.id === el.dataset.id);
    el.classList.toggle('in-p2', two && players[1].clip?.id === el.dataset.id);
  });
}

function openFromList(clip, second) {
  let p = active;
  if (second) {
    if (main.dataset.layout !== 'clip-clip') setLayout('clip-clip');
    p = players[1];
  }
  p.touch();
  setActive(p);
  show(p, clip, { loop: settings.autoLoop });
}

// Lange drücken (Finger) = im zweiten Player öffnen
let press = null;
$('#clips').addEventListener('pointerdown', e => {
  const el = e.target.closest('.clip');
  if (!el || e.target.closest('button') || e.pointerType === 'mouse') return;
  press = { id: el.dataset.id, x: e.clientX, y: e.clientY, timer: setTimeout(() => {
    const clip = clips.find(c => c.id === press?.id);
    press = { done: true };
    if (clip) { openFromList(clip, true); toast('Im zweiten Player geöffnet'); }
  }, 550) };
});
$('#clips').addEventListener('pointermove', e => {
  if (press?.timer && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) { clearTimeout(press.timer); press = null; }
});
['pointerup', 'pointercancel', 'pointerleave'].forEach(t => $('#clips').addEventListener(t, () => { if (press?.timer) { clearTimeout(press.timer); press = null; } }));
$('#clips').addEventListener('contextmenu', e => { if (coarse) e.preventDefault(); });

$('#clips').addEventListener('click', e => {
  if (press?.done) { press = null; return; } // gehörte zum langen Drücken
  const el = e.target.closest('.clip');
  if (!el) return;
  const clip = clips.find(c => c.id === el.dataset.id);
  const act = e.target.closest('button')?.dataset.act;
  if (act === 'star') return toggleStar(clip);
  if (act === 'export') return exportClip(clip);
  if (act === 'del') return removeClip(clip);
  openFromList(clip, e.shiftKey);
});
$('#onlyStar').onchange = () => renderClips();
$('#clearAll').onclick = async () => {
  const n = clips.filter(c => !c.starred).length;
  if (!n || !confirm(`${n} Szenen ohne Stern löschen? Das kann nicht rückgängig gemacht werden.`)) return;
  for (const c of clips.filter(c => !c.starred)) await removeClip(c, true);
  renderClips();
};

const stripUrl = ({ thumbUrl, ...rest }) => rest;

async function toggleStar(clip) {
  if (!clip) return;
  clip.starred = !clip.starred;
  await putClip(stripUrl(clip));
  renderClips();
  players.forEach(p => p.refresh());
}

async function removeClip(clip, silent) {
  if (!clip) return;
  await deleteClip(clip.id);
  clips = clips.filter(c => c !== clip);
  if (clip.thumbUrl) URL.revokeObjectURL(clip.thumbUrl);
  players.forEach(p => { if (p.clip === clip) p.unload(); });
  if (!silent) { renderClips(); toast('Szene gelöscht'); }
}

async function exportClip(clip) {
  if (!clip) return;
  const data = await getClipData(clip.id).catch(() => null);
  if (!data) return toast('Diese Szene ist nicht mehr gespeichert');
  const d = new Date(clip.createdAt);
  const pad = n => String(n).padStart(2, '0');
  const name = `Szene_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.mp4`;
  const file = new File([data], name, { type: 'video/mp4' });
  // Tablet/Handy: Teilen-Menü ("Video sichern", AirDrop, WhatsApp …)
  if (coarse && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  toast('Gespeichert im Download-Ordner: ' + name);
}

function selectRelative(dir) {
  const list = $('#onlyStar').checked ? clips.filter(c => c.starred) : clips;
  if (!list.length) return;
  const i = list.indexOf(active.clip);
  const next = list[Math.min(list.length - 1, Math.max(0, i < 0 ? 0 : i + dir))];
  active.touch();
  show(active, next, { loop: settings.autoLoop });
  document.querySelector(`.clip[data-id="${next.id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// ---------- Tastatur ----------
document.addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]') || e.target.matches('input, select, textarea') || e.metaKey || e.ctrlKey) return;
  const p = active;
  const k = e.key;
  let handled = true;
  p.touch();
  if (k === ' ') p.action('play', true);
  else if (k === 'ArrowLeft') e.shiftKey ? p.seekBy(-1, true) : p.step(-1, true);
  else if (k === 'ArrowRight') e.shiftKey ? p.seekBy(1, true) : p.step(1, true);
  else if (k === 'ArrowUp') selectRelative(-1);
  else if (k === 'ArrowDown') selectRelative(1);
  else if (k >= '1' && k <= '5') p.setSpeed(SPEEDS[+k - 1], true);
  else if (k === 'm' || k === 'M') markScene();
  else if (k === 'a' || k === 'A') p.action('A', true);
  else if (k === 'b' || k === 'B') p.action('B', true);
  else if (k === 'l' || k === 'L') p.action('clearloop', true);
  else if (k === 's' || k === 'S') toggleStar(p.clip);
  else if (k === 'e' || k === 'E') exportClip(p.clip);
  else if (k === 'Delete' || k === 'Backspace') removeClip(p.clip);
  else if (k === 'd' || k === 'D') setDelay(!delayOn);
  else if (k === 'z' || k === 'Z') p.resetZoom();
  else if (k === 'Tab' && main.dataset.layout === 'clip-clip') setActive(players.find(x => x !== active));
  else handled = false;
  if (handled) e.preventDefault();
});

// ---------- Einstellungen ----------
const dlg = $('#settingsDlg');
const form = dlg.querySelector('form');
const PROFILE_KEYS = Object.keys(DEFAULT_PROFILE).filter(k => k !== 'zone');
const APP_KEYS = ['resolution', 'fps', 'bitrate', 'delay', 'autoShow', 'autoSpeed', 'autoLoop', 'manualLen', 'maxClips'];
const NUMERIC = ['fps', 'autoSpeed'];

const profSels = document.querySelectorAll('.profsel'); // in der Kopfzeile und in den Einstellungen
function renderProfiles() {
  const html = Object.keys(settings.profiles).map(n => `<option ${n === settings.profile ? 'selected' : ''}>${n}</option>`).join('');
  profSels.forEach(sel => { sel.innerHTML = html; });
  $('#profName').textContent = settings.profile;
  updateZoneUi();
}
profSels.forEach(sel => sel.onchange = e => {
  settings.profile = e.target.value;
  tracker.reset();
  fillForm(); // Felder der Einstellungen auf das gewählte Profil umstellen
  drawOverlay(detector.last, profile());
  toast('Profil: ' + settings.profile);
});

function fillForm() {
  const p = profile();
  for (const k of APP_KEYS) setField(k, settings[k]);
  for (const k of PROFILE_KEYS) setField(k, p[k]);
  updateVals();
  renderProfiles();
}
function setField(k, v) {
  const el = form.elements[k];
  if (!el) return;
  if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
}
function updateVals() {
  form.querySelectorAll('.val').forEach(s => {
    s.textContent = Math.round(+form.elements[s.dataset.for].value * 100) + ' %';
  });
}

async function openSettings() {
  const sel = form.elements.deviceId;
  let cams = [], current = '';
  if (mode === 'phone') {
    cams = phone?.cams || [];
    current = phone?.deviceId || settings.phoneCam;
    $('#camLabel').textContent = 'Kamera am Handy (z. B. Weitwinkel)';
    $('#srcInfo').textContent = phone ? `Handy verbunden: ${phone.label || 'Kamera'}` : 'Handy als Kamera – noch nicht verbunden';
  } else {
    cams = await listCameras().catch(() => []);
    current = settings.deviceId;
    $('#camLabel').textContent = 'Kamera';
    $('#srcInfo').textContent = mode === 'local' ? 'Kamera an diesem Gerät' : mode === 'file' ? 'Videodatei' : 'Noch keine Kamera gewählt';
  }
  sel.innerHTML = '<option value="">Standard</option>' + cams.map(c => `<option value="${c.id}">${c.label}</option>`).join('');
  sel.value = current;
  if (sel.selectedIndex < 0) sel.value = '';
  fillForm();
  const est = await navigator.storage?.estimate?.().catch(() => null);
  $('#storageInfo').textContent = `${clips.length} Szenen gespeichert` +
    (est?.quota ? ` · belegt ${(est.usage / 1e9).toFixed(1).replace('.', ',')} GB von ${(est.quota / 1e9).toFixed(0)} GB` : '');
  $('#linkInfo').textContent = link?.relayBase ? 'Vermittlung zum Koppeln: ' + link.relayBase.replace(/^https?:\/\//, '') : '';
  dlg.before = JSON.stringify(camWish()) + settings.deviceId + settings.delay;
  dlg.showModal();
}
$('#settingsBtn').onclick = openSettings;
$('#helpBtn').onclick = () => $('#helpDlg').showModal();
$('#srcChange').onclick = () => { dlg.close(); stopSource(); settings.source = ''; showBox('start'); };

form.addEventListener('input', e => {
  const el = e.target, k = el.name;
  if (!k) return;
  const v = el.type === 'checkbox' ? el.checked : el.type === 'number' || el.type === 'range' ? +el.value : el.value;
  if (k === 'deviceId') settings[mode === 'phone' ? 'phoneCam' : 'deviceId'] = v;
  else if (PROFILE_KEYS.includes(k)) updateProfile({ [k]: v });
  else if (APP_KEYS.includes(k)) settings[k] = NUMERIC.includes(k) ? +v : v;
  updateVals();
});

dlg.addEventListener('close', () => {
  const now = JSON.stringify(camWish()) + settings.deviceId + settings.delay;
  if (now === dlg.before) return;
  if (mode === 'phone') link?.sendJSON(camWish());
  else if (mode === 'local') startLocal();
  setDelay(delayOn);
});

$('#profNew').onclick = () => {
  const name = prompt('Name für das neue Profil (z. B. „Fußball Schuss“):')?.trim();
  if (!name || settings.profiles[name]) return;
  settings.profiles = { ...settings.profiles, [name]: { ...profile(), zone: null } };
  settings.profile = name;
  fillForm();
};
$('#profDel').onclick = () => {
  const names = Object.keys(settings.profiles);
  if (names.length < 2) return toast('Das letzte Profil kann nicht gelöscht werden');
  if (!confirm(`Profil „${settings.profile}“ löschen?`)) return;
  const { [settings.profile]: _, ...rest } = settings.profiles;
  settings.profiles = rest;
  settings.profile = Object.keys(rest)[0];
  fillForm();
};

// ---------- Start ----------
(async function init() {
  if (params.get('profile') && settings.profiles[params.get('profile')]) settings.profile = params.get('profile');
  if (params.get('code')) settings.code = params.get('code');
  if (params.get('rot')) settings.rotate = +params.get('rot') || 0; // nur für Tests
  renderProfiles();
  setLayout(settings.layout || 'live-clip');
  setDelay(false);
  showBox('start');
  clips = await allClips().catch(() => []);
  renderClips();
  detector.init();
  navigator.storage?.persist?.().catch(() => {});
  window.addEventListener('resize', () => drawOverlay(detector.last, profile()));
  save();

  if (!supported) return;
  if (settings.source !== 'phone') Encoder.warmUp(); // im Hintergrund, bis jemand "Kamera" tippt
  const src = params.get('src'); // nur für Tests: #src=phone oder #src=file:test/bewegung.mp4
  if (src?.startsWith('file:')) startFile(await fetch(src.slice(5)).then(r => r.blob()));
  else if (src === 'phone' || (!src && settings.source === 'phone')) startPhone();
  else if (settings.source === 'local') {
    // Wenn die Kamera schon einmal erlaubt wurde: direkt starten
    const perm = await navigator.permissions?.query({ name: 'camera' }).catch(() => null);
    if (perm?.state === 'granted') startLocal();
  }
})();

// Offline-Speicher für die App-Dateien (nur über https)
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

// Bildschirm anlassen, solange aufgenommen wird
let wake = null;
async function keepAwake() {
  if (!('wakeLock' in navigator) || wake || document.hidden || !mode) return;
  try { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } catch {}
}
setInterval(keepAwake, 5000);
document.addEventListener('visibilitychange', keepAwake);

// zum Testen in der Konsole
window.__app = { buffer, encoder, detector, tracker, players, liveView, delayView, get link() { return link; }, get clips() { return clips; }, get mode() { return mode; }, get phone() { return phone; } };
if (params.get('report')) {
  // Test-Tab beendet sich selbst
  setTimeout(() => { stopSource(); players.forEach(p => p.unload()); document.body.innerHTML = '<p style="padding:40px;font-size:20px">Test beendet – dieser Tab kann geschlossen werden.</p>'; }, 75000);
  window.addEventListener('error', e => fetch('api/testlog', { method: 'POST', body: JSON.stringify({ page: 'view', jsError: String(e.message), at: `${e.filename}:${e.lineno}` }) }));
  window.addEventListener('unhandledrejection', e => fetch('api/testlog', { method: 'POST', body: JSON.stringify({ page: 'view', rejection: String(e.reason?.message || e.reason) }) }));
  setInterval(() => fetch('api/testlog', { method: 'POST', body: JSON.stringify({
    page: 'view', ua: navigator.userAgent.match(/(Chrome|Version)\/[\d.]+/)?.[0], mode, link: link?.state,
    chunks: buffer.chunks.length, cfg: buffer.config && `${buffer.config.codec} ${buffer.config.width}x${buffer.config.height}`,
    liveTs: liveView.lastTs, lag: Math.round((buffer.now() - liveView.lastTs) / 1000), det: detector.last && { present: detector.last.present, mode: detector.last.mode },
    ai: detector.aiStatus, restarts: encoder.restarts, encCodec: encoder.codec, clips: clips.map(c => ({ dur: +c.duration.toFixed(2), fps: +c.fps.toFixed(1) })),
    player: players[0].clip && { t: +players[0].video.currentTime.toFixed(2), dur: +(players[0].video.duration || 0).toFixed(2), w: players[0].video.videoWidth, paused: players[0].video.paused, err: players[0].video.error?.message },
    err: $('#pairErr').textContent + $('#startErr').textContent,
    layout: (() => { // Maße der Oberfläche: Fensterbreite / Höhe der Leiste, Symbol sichtbar?
      const w = e => Math.round(e.getBoundingClientRect().width), h = e => Math.round(e.getBoundingClientRect().height);
      const rows = bar => new Set([...bar.querySelectorAll('button')].filter(b => b.getClientRects().length).map(b => Math.round(b.getBoundingClientRect().top / 10))).size;
      return { vis: document.visibilityState, vp: [innerWidth, innerHeight], header: h($('header')), live: [w(livePane), h($('.lbar')), rows($('.lbar'))], p1: [w($('#p1')), h($('#p1 .pbar')), rows($('#p1 .pbar'))],
        aside: [w($('aside')), h($('aside'))], icon: [w($('#p1 [data-a="play"] .ic')), w($('#p1 [data-a="play"] use'))], lbl: getComputedStyle($('#p1 .g-clip .lbl')).display, ovX: document.documentElement.scrollWidth - innerWidth };
    })(),
  }) }).catch(() => {}), 2000);
}
