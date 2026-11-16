// Kamera-Seite fürs Handy: filmt, komprimiert und sendet jedes Bild per WLAN direkt ans Tablet.
// Erkennung, Szenen und Bedienung laufen am Tablet – das Handy muss nur aufgestellt werden.

import { openCamera, listCameras, stopStream, trackInfo, cameraError } from './camera.js';
import { Encoder } from './encoder.js';
import { Link, cleanCode, formatCode, LOW_WATER } from './link.js';

const $ = s => document.querySelector(s);
const cam = $('#cam');
const params = new URLSearchParams(location.hash.slice(1));
const store = {
  get(k) { try { return localStorage.getItem('tk.' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('tk.' + k, v); } catch {} },
};

let code = cleanCode(params.get('c')) || cleanCode(store.get('code'));
// Was das Tablet zuletzt gewünscht hat (Auflösung, Bildrate, Qualität, Linse)
let wish = { resolution: '720', fps: 60, bitrate: 6, deviceId: '' };
try { wish = { ...wish, ...JSON.parse(store.get('wish') || '{}') }; } catch {}

const encoder = new Encoder();
let link = null, stream = null, config = null, cams = [];
let running = false, dropUntilKey = true, dropped = 0, shownFps = 0;

function setState(text, cls) {
  const s = $('#state');
  s.textContent = text;
  s.className = 'pill ' + cls;
}

// ---------- Code ----------
function showCode() {
  $('#codeBox').hidden = !!code;
  $('#codeShown').hidden = !code;
  if (code) $('#codeText').textContent = formatCode(code);
}
$('#codeChange').onclick = e => { e.preventDefault(); code = null; showCode(); $('#codeInput').focus(); };
showCode();

if (!('VideoEncoder' in window)) {
  $('#err').textContent = window.isSecureContext
    ? 'Dieser Browser ist zu alt. Bitte Safari ab iOS 16.4 oder Chrome verwenden.'
    : 'Die Seite muss über https:// geöffnet werden, sonst gibt das Handy die Kamera nicht frei.';
  $('#startBtn').disabled = true;
}

// ---------- Kamera ----------
async function openCam() {
  encoder.stop();
  stopStream(stream); stream = null;
  await Encoder.warmUp(); // erst den Encoder aufwärmen, dann die Kamera öffnen
  const test = params.get('src'); // nur für Tests: Videodatei statt Kamera
  if (test) {
    cam.src = test; cam.loop = true;
    await cam.play();
    await encoder.start({ video: cam, bitrate: wish.bitrate, fps: 30 });
  } else {
    stream = await openCamera({ ...wish, facing: 'environment' });
    cam.srcObject = stream;
    await cam.play();
    const track = stream.getVideoTracks()[0];
    await encoder.start({ video: cam, track, bitrate: wish.bitrate, fps: Math.round(trackInfo(stream).fps || wish.fps) });
    track.addEventListener('ended', () => { if (running && stream?.getVideoTracks()[0] === track) reopenSoon(); });
    cams = await listCameras().catch(() => []);
    const sel = $('#camSel');
    sel.innerHTML = cams.map(c => `<option value="${c.id}">${c.label}</option>`).join('');
    sel.value = trackInfo(stream).deviceId || '';
    sel.hidden = cams.length < 2;
  }
  encoder.hold = link?.state !== 'connected';
  encoder.forceKey();
  dropUntilKey = true;
}

let reopenTimer;
function reopenSoon() {
  clearTimeout(reopenTimer);
  reopenTimer = setTimeout(() => { if (running && !document.hidden) openCam().catch(showError); }, 500);
}

function showError(e) {
  const msg = e?.name ? cameraError(e) : String(e?.message || e);
  setState('Fehler', 'bad');
  $('#info').textContent = msg;
  link?.sendJSON({ t: 'error', message: msg });
}

encoder.addEventListener('config', e => { config = e.detail; sendConfig(); });
encoder.addEventListener('error', e => showError(e.detail));
encoder.addEventListener('stalled', () => { if (running) openCam().catch(showError); }); // Kamera-Kette hängt: neu öffnen
Encoder.warmUp();
encoder.addEventListener('chunk', e => {
  const c = e.detail;
  if (link?.state !== 'connected') return;
  if (dropUntilKey) { if (c.type !== 'key') return; dropUntilKey = false; }
  if (!link.sendChunk(c)) {
    // Funkstrecke kommt nicht nach: aussetzen, bis der Sendepuffer wieder leer ist
    dropUntilKey = true;
    encoder.hold = true;
    dropped++;
  }
});
setInterval(() => {
  if (encoder.hold && link?.state === 'connected' && link.buffered < LOW_WATER) { encoder.hold = false; encoder.forceKey(); }
}, 100);

function sendConfig() {
  if (!config || link?.state !== 'connected') return;
  let description = null;
  if (config.description) { let s = ''; for (const b of config.description) s += String.fromCharCode(b); description = btoa(s); }
  link.sendJSON({ t: 'config', codec: config.codec, width: config.width, height: config.height, description });
  dropUntilKey = true;
  encoder.forceKey();
}

// ---------- Verbindung zum Tablet ----------
function connect() {
  link?.stop();
  link = new Link({ role: 'cam', code, relay: params.get('s') || '' });
  link.addEventListener('state', updateState);
  link.addEventListener('open', () => { encoder.hold = false; sendConfig(); sendInfo(); });
  link.addEventListener('close', () => { encoder.hold = true; });
  link.addEventListener('error', e => { $('#info').textContent = e.detail?.message || String(e.detail); });
  link.addEventListener('message', e => {
    const m = e.detail;
    if (m.t !== 'set') return;
    const next = { resolution: m.resolution, fps: m.fps, bitrate: m.bitrate, deviceId: m.deviceId || '' };
    if (JSON.stringify(next) === JSON.stringify(wish)) return;
    wish = next;
    store.set('wish', JSON.stringify(wish));
    openCam().catch(showError);
  });
  link.start();
}

function updateState() {
  if (!running) return;
  const s = link?.state;
  if (s === 'connected') setState('● Sendet an das Tablet', 'on');
  else if (s === 'connecting') setState('Verbinde …', 'wait');
  else setState('Warte auf das Tablet …', 'wait');
}

let lastFrames = 0, lastDropped = 0;
function sendInfo() {
  shownFps = Math.round((encoder.frames - lastFrames) / 2);
  lastFrames = encoder.frames;
  const slow = dropped > lastDropped;
  lastDropped = dropped;
  if (running && encoder.width) {
    const format = encoder.height > encoder.width ? 'Hochformat' : 'Querformat';
    $('#info').textContent = `${format} · ${encoder.width}×${encoder.height}` + (link?.state === 'connected' ? ` · ${shownFps} fps` : '') + (slow ? ' · WLAN zu langsam!' : '');
  }
  link?.sendJSON({
    t: 'info', label: stream ? trackInfo(stream).label : 'Testvideo', deviceId: stream ? trackInfo(stream).deviceId : '',
    width: encoder.width, height: encoder.height, fps: shownFps, cams, dropped: slow,
  });
}
setInterval(sendInfo, 2000);

// ---------- Start ----------
async function start() {
  $('#err').textContent = '';
  if (!code) {
    code = cleanCode($('#codeInput').value);
    if (!code) { $('#err').textContent = 'Der Code hat 8 Zeichen und steht am Tablet unter dem QR-Code.'; return; }
  }
  store.set('code', code);
  showCode();
  try {
    await openCam();
  } catch (e) {
    $('#err').textContent = cameraError(e);
    return;
  }
  running = true;
  $('#stopNote').hidden = true;
  $('#cover').hidden = true;
  $('#bottom').hidden = false;
  connect();
  updateState();
  keepAwake();
}
$('#startBtn').onclick = start;
$('#codeInput').addEventListener('keydown', e => { if (e.key === 'Enter') start(); });

$('#camSel').onchange = e => {
  wish.deviceId = e.target.value;
  store.set('wish', JSON.stringify(wish));
  openCam().catch(showError);
};
$('#dimBtn').onclick = () => { $('#dim').hidden = false; };

// Übertragung beenden: Kamera aus, Verbindung zu, zurück zum Startbild
function stop() {
  if (!running) return;
  running = false;
  clearTimeout(reopenTimer);
  link?.sendJSON({ t: 'bye' }); // das Tablet soll wissen, dass das Absicht war
  encoder.stop();
  stopStream(stream); stream = null;
  cam.pause(); cam.srcObject = null; cam.removeAttribute('src');
  const l = link; link = null;
  setTimeout(() => l?.stop(), 300); // kurz warten, damit die Abmeldung noch hinausgeht
  wake?.release().catch(() => {});
  $('#dim').hidden = true;
  $('#bottom').hidden = true;
  $('#cover').hidden = false;
  $('#stopNote').hidden = false;
  $('#info').textContent = '';
  setState('Beendet', 'wait');
}
$('#stopBtn').onclick = stop;
$('#dim').onclick = () => { $('#dim').hidden = true; };

// Bildschirm anlassen – sonst stoppt das Handy die Kamera
let wake = null;
async function keepAwake() {
  if (!('wakeLock' in navigator) || wake || document.hidden || !running) return;
  try { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } catch {}
}
setInterval(keepAwake, 5000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !running) return;
  keepAwake();
  // Nach dem Zurückkehren ist die Kamera manchmal beendet: neu öffnen
  const t = stream?.getVideoTracks()[0];
  if (stream && (!t || t.readyState === 'ended')) reopenSoon();
});

if (params.get('auto')) start();

// zum Testen
window.__phone = { encoder, get link() { return link; }, get wish() { return wish; }, get running() { return running; } };
if (params.get('report')) {
  // Test-Tab beendet sich selbst
  setTimeout(() => { running = false; encoder.stop(); link?.stop(); cam.pause(); document.body.innerHTML = '<p style="padding:40px;font-size:20px;color:#fff">Test beendet – dieser Tab kann geschlossen werden.</p>'; }, 75000);
  window.addEventListener('error', e => fetch('api/testlog', { method: 'POST', body: JSON.stringify({ page: 'cam', jsError: String(e.message), at: `${e.filename}:${e.lineno}` }) }));
  window.addEventListener('unhandledrejection', e => fetch('api/testlog', { method: 'POST', body: JSON.stringify({ page: 'cam', rejection: String(e.reason?.message || e.reason) }) }));
  setInterval(() => fetch('api/testlog', { method: 'POST', body: JSON.stringify({
    page: 'cam', ua: navigator.userAgent.match(/(Chrome|Version)\/[\d.]+/)?.[0], running, link: link?.state,
    enc: `${encoder.codec} ${encoder.width}x${encoder.height}`, frames: encoder.frames, hold: encoder.hold, dropped,
    buffered: link?.buffered, restarts: encoder.restarts, vis: document.visibilityState, bottom: Math.round($('#bottom').getBoundingClientRect().height), stopBtn: Math.round($('#stopBtn').getBoundingClientRect().width), err: $('#err').textContent + ' ' + $('#info').textContent,
  }) }).catch(() => {}), 2000);
}
