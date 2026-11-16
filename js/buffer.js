// Rückspeicher: hält die letzten ~90 s komprimiertes Video im Arbeitsspeicher.
// Daraus lässt sich jede Szene nachträglich ausschneiden, auch ein paar Sekunden *vor* der Erkennung.
// Die Stücke kommen entweder vom eigenen Encoder (Kamera am Gerät) oder per Funk vom Handy.
// Zeitstempel sind immer die der Kamera-Uhr ("Stream-Zeit").

import { Muxer, ArrayBufferTarget } from '../vendor/mp4-muxer.js';
import { nowUs } from './encoder.js';

export class ClipBuffer extends EventTarget {
  chunks = [];     // {ts, type, data}
  config = null;   // {codec, width, height, description}
  gen = 0;         // erhöht sich bei jedem neuen Stream (Kamera neu gestartet, Handy gedreht …)
  seconds = 90;
  rotation = 0;    // Szenen so gedreht speichern (0, 90, 180, 270 Grad im Uhrzeigersinn)
  #skew = null;    // kleinster beobachteter Abstand eigene Uhr − Kamera-Uhr

  // Neue Stream-Einstellung übernehmen. Ist sie gleich der alten (Encoder nur neu gestartet),
  // bleibt der Speicher erhalten – das nächste Stück ist ohnehin ein Schlüsselbild.
  configure(config) {
    const a = this.config, same = (x, y) => (x?.length ?? -1) === (y?.length ?? -1) && (!x || x.every((v, i) => v === y[i]));
    if (a && a.codec === config.codec && a.width === config.width && a.height === config.height && same(a.description, config.description)) return false;
    this.reset(config);
    return true;
  }

  reset(config) {
    this.gen++;
    this.chunks = [];
    this.config = config;
    this.#skew = null;
    this.dispatchEvent(new Event('reset'));
  }

  push(chunk) {
    if (!this.config) return;
    const list = this.chunks;
    if (list.length && chunk.ts <= list[list.length - 1].ts) {
      // Zeit springt zurück: die Kamera-Seite wurde neu geladen (neue Uhr) – von vorn beginnen
      if (chunk.type !== 'key' || list[list.length - 1].ts - chunk.ts < 2e6) return;
      this.reset(this.config);
      return this.push(chunk);
    }
    if (!list.length && chunk.type !== 'key') return;          // ein Stream muss mit einem Schlüsselbild beginnen
    list.push(chunk);
    const d = nowUs() - chunk.ts;
    // Minimum nachführen, aber langsam wieder steigen lassen (Uhren laufen nie exakt gleich)
    this.#skew = this.#skew == null ? d : Math.min(d, this.#skew + 50);
    if (chunk.type === 'key') this.#prune();
    this.dispatchEvent(new CustomEvent('chunk', { detail: chunk }));
  }

  #prune() {
    const list = this.chunks;
    const cutoff = list[list.length - 1].ts - this.seconds * 1e6;
    let idx = -1;
    for (let i = 0; i < list.length && list[i].ts < cutoff; i++) if (list[i].type === 'key') idx = i;
    if (idx > 0) list.splice(0, idx);
  }

  get latestTs() { return this.chunks.at(-1)?.ts ?? 0; }
  get oldestTs() { return this.chunks[0]?.ts ?? 0; }
  // "Jetzt" in Stream-Zeit, auch wenn gerade kein Stück ankommt
  now() { return this.#skew == null ? this.latestTs : nowUs() - this.#skew; }

  // Index des ersten Stücks mit ts > t
  indexAfter(t) {
    const list = this.chunks;
    let lo = 0, hi = list.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (list[m].ts > t) hi = m; else lo = m + 1; }
    return lo;
  }

  // Ausschnitt [startUs, endUs] als MP4 liefern
  cut(startUs, endUs) {
    const list = this.chunks, cfg = this.config;
    if (!list.length || !cfg) return null;
    let s = -1;
    for (let i = 0; i < list.length; i++) {
      if (list[i].type === 'key' && (list[i].ts <= startUs || s < 0)) s = i;
      if (list[i].ts > startUs) break;
    }
    let e = list.length - 1;
    while (e > s && list[e].ts > endUs) e--;
    if (s < 0 || e - s < 2) return null;

    const vp9 = cfg.codec.startsWith('vp09');
    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: vp9 ? 'vp9' : 'avc', width: cfg.width, height: cfg.height, rotation: this.rotation },
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    });
    const decoderConfig = { codec: cfg.codec, codedWidth: cfg.width, codedHeight: cfg.height };
    if (cfg.description) decoderConfig.description = cfg.description;
    if (vp9) decoderConfig.colorSpace = { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false };
    const seconds = (list[e].ts - list[s].ts) / 1e6;
    const fps = (e - s) / Math.max(0.001, seconds);
    for (let i = s; i <= e; i++) {
      const c = list[i];
      const dur = i < e ? list[i + 1].ts - c.ts : 1e6 / fps;
      muxer.addVideoChunkRaw(c.data, c.type, c.ts, Math.max(1, dur), i === s ? { decoderConfig } : undefined);
    }
    muxer.finalize();
    return {
      data: muxer.target.buffer,
      start: list[s].ts, end: list[e].ts,
      duration: seconds, fps,
      width: this.rotation % 180 ? cfg.height : cfg.width, height: this.rotation % 180 ? cfg.width : cfg.height,
    };
  }
}
