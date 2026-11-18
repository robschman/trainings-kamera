// Spieler-Erkennung: KI-Personenerkennung (MediaPipe, läuft lokal) oder einfache Bewegungserkennung.
// Daraus entscheidet der SceneTracker, wann eine Szene beginnt und endet.

const TICK_MS = 110; // ~9 Prüfungen pro Sekunde

// Größe einer Person: Höhe ihres Rahmens im Verhältnis zur LANGEN Bildseite. So steht derselbe Wert hochkant und
// quer für denselben Abstand zum Handy. (Quer ist das Bild nur 9/16 so hoch; auf die Bildhöhe bezogen wäre dieselbe
// Person dort fast doppelt so "groß", und jemand in 5–6 m Entfernung käme über die Schwelle.)
export const personSize = (hPx, W, H) => hPx / Math.max(W, H);
// Die Mindestgröße als Anteil der Bildhöhe, so wie sie im aktuellen Bild gilt. Höchstens 90 %: Quer füllt auch
// eine sehr nahe Person nur die Bildhöhe, mehr kann niemand erreichen.
export const minOnScreen = (minHeight, W, H) => Math.min(0.9, minHeight * Math.max(W, H) / H);

export class Detector extends EventTarget {
  od = null;
  aiStatus = 'lädt …';
  last = null;

  async init() {
    try {
      const { FilesetResolver, ObjectDetector } = await import('../vendor/mediapipe/vision_bundle.js');
      const files = await FilesetResolver.forVisionTasks(new URL('../vendor/mediapipe/wasm', import.meta.url).href);
      const opts = delegate => ({
        baseOptions: { modelAssetPath: new URL('../vendor/models/efficientdet_lite0.tflite', import.meta.url).href, delegate },
        runningMode: 'VIDEO', scoreThreshold: 0.3, maxResults: 8, categoryAllowlist: ['person'],
      });
      try { this.od = await ObjectDetector.createFromOptions(files, opts('GPU')); this.aiStatus = 'KI bereit (GPU)'; }
      catch { this.od = await ObjectDetector.createFromOptions(files, opts('CPU')); this.aiStatus = 'KI bereit (CPU)'; }
    } catch (e) {
      console.error(e);
      this.aiStatus = 'KI nicht verfügbar – nutze Bewegung';
    }
    this.dispatchEvent(new Event('status'));
  }

  // getFrame() liefert das aktuelle Live-Bild: {el, w, h, t} – el ist ein Video oder eine Zeichenfläche,
  // t der Zeitstempel dieses Bildes in Stream-Zeit
  start(getFrame, getProfile) {
    this.stop();
    this.getFrame = getFrame;
    this.getProfile = getProfile;
    this.canvas = new OffscreenCanvas(160, 90);
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.prev = null;
    this.timer = setInterval(() => this.#tick(), TICK_MS);
  }

  stop() { clearInterval(this.timer); }

  #tick() {
    const f = this.getFrame();
    if (!f || !f.w || f.t === this.last?.t) return; // kein (neues) Bild
    const v = f.el, t = f.t;
    const p = this.getProfile();
    const zone = p.zone || { x: 0, y: 0, w: 1, h: 1 };
    let boxes = [], present = false, motion = 0, best = null;

    if (p.mode === 'person' && this.od) {
      let res;
      try { res = this.od.detectForVideo(v, performance.now()); } catch { return; }
      const W = f.w, H = f.h;
      const need = minOnScreen(p.minHeight, W, H);
      for (const d of res.detections) {
        const b = d.boundingBox, score = d.categories[0]?.score ?? 0;
        const box = { x: b.originX / W, y: b.originY / H, w: b.width / W, h: b.height / H, score, size: personSize(b.height, W, H) };
        const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
        const inZone = cx >= zone.x && cx <= zone.x + zone.w && cy >= zone.y && cy <= zone.y + zone.h;
        box.counted = score >= p.minScore && box.h >= need && inZone;
        box.reason = box.counted ? '' : score < p.minScore ? 'unsicher' : box.h < need ? 'zu weit weg' : 'außerhalb';
        boxes.push(box);
        if (box.counted) { present = true; if (!best || box.h > best.h) best = box; }
      }
    } else {
      motion = this.#motion(v, zone);
      present = motion >= p.motionLevel;
    }

    this.last = { t, boxes, motion, present, best, mode: p.mode === 'person' && this.od ? 'person' : 'motion' };
    this.dispatchEvent(new CustomEvent('result', { detail: this.last }));
  }

  #motion(v, zone) {
    const { ctx } = this;
    ctx.drawImage(v, 0, 0, 160, 90);
    const img = ctx.getImageData(0, 0, 160, 90).data;
    const gray = new Uint8Array(160 * 90);
    let sum = 0;
    for (let i = 0, j = 0; j < gray.length; i += 4, j++) { gray[j] = (img[i] * 3 + img[i + 1] * 6 + img[i + 2]) / 10; sum += gray[j]; }
    // Vergleich mit einem langsam nachgeführten Hintergrundbild:
    // so zählt auch jemand, der ruhig dasteht. Helligkeitsausgleich gegen flackerndes Hallenlicht.
    const mean = sum / gray.length;
    let bg = this.prev;
    if (!bg) { this.prev = Float32Array.from(gray); this.bgMean = mean; return 0; }
    const shift = mean - this.bgMean;
    const x0 = Math.floor(zone.x * 160), x1 = Math.ceil((zone.x + zone.w) * 160);
    const y0 = Math.floor(zone.y * 90), y1 = Math.ceil((zone.y + zone.h) * 90);
    let moved = 0, n = 0;
    for (let y = 0; y < 90; y++) for (let x = 0; x < 160; x++) {
      const k = y * 160 + x;
      const fg = Math.abs(gray[k] - bg[k] - shift) > 28;
      // Vordergrund nur sehr langsam in den Hintergrund übernehmen
      bg[k] += (gray[k] - shift - bg[k]) * (fg ? 0.004 : 0.03);
      if (x >= x0 && x < x1 && y >= y0 && y < y1) { if (fg) moved++; n++; }
    }
    this.bgMean += shift * 0.03;
    return n ? moved / n : 0;
  }
}

// Zustandsautomat: wann beginnt/endet eine Szene?
export class SceneTracker extends EventTarget {
  active = false;
  hits = 0;

  update(present, t, p) {
    if (present) {
      if (!this.active) {
        if (this.hits === 0) this.firstSeen = t;
        this.hits++;
        this.lastSeen = t;
        if (t - this.firstSeen >= p.minLen * 1e6 && this.hits >= 2) {
          this.active = true;
          this.start = this.firstSeen - p.preroll * 1e6;
          this.dispatchEvent(new CustomEvent('start', { detail: { start: this.start } }));
        }
        return;
      }
      this.lastSeen = t;
      if (t - this.start > p.maxLen * 1e6) {
        // Zu lang: hier teilen und direkt eine neue Szene beginnen
        this.#emit(this.start, t);
        this.start = t;
        this.dispatchEvent(new CustomEvent('start', { detail: { start: t } }));
      }
    } else {
      if (!this.active) {
        // kurze Aussetzer beim Ansammeln tolerieren
        if (this.hits && t - this.lastSeen > p.gap * 1e6) this.hits = 0;
        return;
      }
      if (t - this.lastSeen > p.gap * 1e6) {
        this.active = false;
        this.hits = 0;
        this.#emit(this.start, this.lastSeen + p.postroll * 1e6);
      }
    }
  }

  reset() { this.active = false; this.hits = 0; }

  // Laufende Szene sofort abschließen (Kamera weg, Quelle gewechselt)
  flush(p) {
    if (!this.active) return this.reset();
    this.active = false;
    this.hits = 0;
    this.#emit(this.start, this.lastSeen + p.postroll * 1e6);
  }

  #emit(start, end) {
    this.dispatchEvent(new CustomEvent('scene', { detail: { start, end } }));
  }
}
