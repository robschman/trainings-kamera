// Zeigt den Rückspeicher als laufendes Bild auf einer Zeichenfläche:
// ohne Verzögerung = Live-Bild vom Handy, mit Verzögerung = "Spieler sieht sich X Sekunden später".

export class StreamView {
  lastTs = 0;     // Zeitstempel des zuletzt gezeigten Bildes
  onFrame = null; // wird nach jedem gezeigten Bild aufgerufen
  onError = null;
  #errors = 0;

  constructor(canvas, buffer) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.buf = buffer;
    this.on = false;
    this.onChunk = () => { if (this.on && !this.delay) this.#pump(); };
  }

  start(seconds = 0) {
    this.stop();
    this.on = true;
    this.delay = seconds * 1e6;
    this.next = null; // Zeitstempel des zuletzt dekodierten Stücks
    this.gen = -1;
    this.#errors = 0;
    // Timer statt requestAnimationFrame: läuft auch weiter, wenn das Fenster verdeckt ist
    this.timer = setInterval(() => this.#pump(), 15);
    this.buf.addEventListener('chunk', this.onChunk);
  }

  stop() {
    this.on = false;
    clearInterval(this.timer);
    this.buf.removeEventListener('chunk', this.onChunk);
    try { this.dec?.close(); } catch {}
    this.dec = null;
  }

  #setup() {
    try { this.dec?.close(); } catch {}
    const cfg = this.buf.config;
    const dec = new VideoDecoder({
      output: f => {
        if (dec !== this.dec) { f.close(); return; }
        const c = this.canvas;
        if (c.width !== f.displayWidth || c.height !== f.displayHeight) { c.width = f.displayWidth; c.height = f.displayHeight; }
        this.ctx.drawImage(f, 0, 0);
        this.lastTs = f.timestamp;
        f.close();
        this.#errors = 0;
        this.onFrame?.(this.lastTs);
      },
      error: e => {
        if (dec !== this.dec) return;
        this.dec = null;
        if (++this.#errors >= 5) { this.stop(); this.onError?.(e); }
      },
    });
    const c = { codec: cfg.codec, codedWidth: cfg.width, codedHeight: cfg.height, optimizeForLatency: true };
    if (cfg.description) c.description = cfg.description;
    try { dec.configure(c); } catch (e) { this.stop(); this.onError?.(e); return; }
    this.dec = dec;
    this.gen = this.buf.gen;
    this.next = null;
  }

  #pump() {
    const buf = this.buf, list = buf.chunks;
    if (!this.on || !buf.config || !list.length) return;
    if (!this.dec || this.gen !== buf.gen || this.dec.state !== 'configured') { this.#setup(); if (!this.dec) return; }
    const target = this.delay ? buf.now() - this.delay : Infinity;
    // Live-Bild hängt zu weit hinterher (z. B. nach einer Funk-Pause): zum neuesten Schlüsselbild springen
    if (!this.delay && this.next != null && buf.latestTs - this.next > 1.5e6) this.next = null;
    let i;
    if (this.next == null) {
      // Einstieg beim letzten Schlüsselbild vor dem Zielzeitpunkt
      i = -1;
      for (let k = list.length - 1; k >= 0; k--) if (list[k].type === 'key' && list[k].ts <= target) { i = k; break; }
      if (i < 0) return; // noch nicht genug aufgenommen
    } else {
      i = buf.indexAfter(this.next);
    }
    // nie mehr als ein paar Bilder vorausschieben, sonst staut sich der Decoder
    for (; i < list.length && list[i].ts <= target && this.dec.decodeQueueSize < 10; i++) {
      const c = list[i];
      try { this.dec.decode(new EncodedVideoChunk({ type: c.type, timestamp: c.ts, data: c.data })); }
      catch { this.dec = null; return; }
      this.next = c.ts;
    }
  }
}
