// Kamera öffnen – am Handy (Rückkamera) oder am PC (USB-Kamera, Webcam-App)

export async function listCameras() {
  // Gerätenamen gibt der Browser erst nach einer Kamera-Freigabe heraus
  const devs = await navigator.mediaDevices.enumerateDevices();
  return devs.filter(d => d.kind === 'videoinput').map((d, i) => ({ id: d.deviceId, label: d.label || 'Kamera ' + (i + 1) }));
}

export async function openCamera({ deviceId, resolution, fps, facing }) {
  const h = resolution === '1080' ? 1080 : 720;
  const video = { width: { ideal: Math.round(h * 16 / 9) }, height: { ideal: h }, frameRate: { ideal: fps } };
  if (deviceId) video.deviceId = { exact: deviceId };
  else if (facing) video.facingMode = { ideal: facing };
  try {
    return await navigator.mediaDevices.getUserMedia({ video, audio: false });
  } catch (e) {
    // gemerkte Kamera gibt es nicht mehr: mit der Standard-Kamera versuchen
    if (deviceId && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError')) {
      return openCamera({ resolution, fps, facing });
    }
    throw e;
  }
}

export function stopStream(stream) {
  stream?.getTracks().forEach(t => t.stop());
}

export function trackInfo(stream) {
  const t = stream.getVideoTracks()[0], s = t?.getSettings() || {};
  return { width: s.width, height: s.height, fps: s.frameRate, label: t?.label, deviceId: s.deviceId };
}

export function cameraError(e) {
  return e.name === 'NotAllowedError' ? 'Der Kamera-Zugriff wurde nicht erlaubt. Seite neu laden und „Erlauben“ wählen.'
    : e.name === 'NotFoundError' || e.name === 'OverconstrainedError' ? 'Keine Kamera gefunden.'
    : e.name === 'NotReadableError' ? 'Die Kamera wird gerade von einer anderen App verwendet.'
    : 'Fehler: ' + (e.message || e.name);
}
