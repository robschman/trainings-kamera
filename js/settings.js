// Einstellungen und Erkennungs-Profile (gespeichert im Browser)

const KEY = 'trainingskamera.settings.v1';

export const DEFAULT_PROFILE = {
  mode: 'person',        // 'person' = KI-Personenerkennung, 'motion' = nur Bewegung
  minHeight: 0.40,       // Person muss mind. so viel der Bildhöhe ausfüllen (filtert Hintergrund)
  minScore: 0.45,        // KI-Sicherheit
  motionLevel: 0.04,     // Anteil bewegter Pixel für Bewegungsmodus
  zone: null,            // {x,y,w,h} normiert 0..1, null = ganzes Bild
  preroll: 2.0,          // Sekunden vor dem Erkennen
  postroll: 1.5,         // Sekunden nach dem Verschwinden
  gap: 0.8,              // so lange darf die Person "fehlen", ohne dass die Szene endet
  minLen: 0.6,           // Person muss mind. so lange erkannt sein (filtert Kurz-Fehlalarme)
  maxLen: 15,            // längere Szenen werden geteilt
};

export const DEFAULTS = {
  source: '',            // '' = fragen, 'phone' = Handy per Funk, 'local' = Kamera an diesem Gerät
  code: '',              // Kopplungs-Code fürs Handy
  relay: '',             // eigene Vermittlungs-Adresse (leer = automatisch)
  phoneCam: '',          // gewählte Kamera/Linse am Handy
  rotate: 0,             // Bild vom Handy drehen (0, 90, 180, 270 Grad), falls es auf der Seite liegt
  deviceId: '',
  resolution: '720',     // '720' | '1080'
  fps: 60,
  bitrate: 6,            // Mbit/s
  delay: 5,              // Live-Verzögerung in Sekunden
  manualLen: 8,          // "Szene markieren" nimmt die letzten X Sekunden
  autoShow: true,        // neue Szenen automatisch abspielen
  autoSpeed: 0.5,
  autoLoop: true,
  maxClips: 150,         // ohne Stern; ältere werden automatisch gelöscht
  layout: 'live-clip',   // 'live-clip' | 'clip-clip' | 'clip'
  profile: 'Volleyball Halle',
  profiles: {
    'Volleyball Halle': { ...DEFAULT_PROFILE },
    'Nur Bewegung': { ...DEFAULT_PROFILE, mode: 'motion' },
  },
};

let state = load();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw) return { ...DEFAULTS, ...raw, profiles: { ...DEFAULTS.profiles, ...raw.profiles } };
  } catch {}
  return structuredClone(DEFAULTS);
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}

export const settings = new Proxy({}, {
  get: (_, k) => state[k],
  set: (_, k, v) => { state[k] = v; save(); return true; },
});

export function profile() {
  return { ...DEFAULT_PROFILE, ...(state.profiles[state.profile] || {}) };
}

export function updateProfile(patch) {
  state.profiles[state.profile] = { ...profile(), ...patch };
  save();
}
