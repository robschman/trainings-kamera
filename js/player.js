// Szenen-Player: Tempo-Stufen, Einzelbild, Wischen/Ziehen zum Spulen, A–B-Schleife, Zoom.
// Bedienbar mit Finger (Tablet) und mit Maus + Tastatur (PC).

export const SPEEDS = [0.1, 0.25, 0.5, 1, 2];
const fmt = s => (Math.max(0, s) || 0).toFixed(2).replace('.', ',');

export class Player extends EventTarget {
  clip = null;
  speed = 1;
  loopA = null; loopB = null;
  zoom = 1; zx = 0.5; zy = 0.5;
  lastInteraction = 0;

  constructor(root, name) {
    super();
    this.root = root;
    this.name = name;
    root.classList.add('player');
    root.innerHTML = `
      <div class="stage">
        <video muted playsinline preload="auto"></video>
        <div class="empty">Szene in der Liste wählen</div>
        <div class="hud"><span class="h-speed">1×</span><span class="h-zoom"></span></div>
        <div class="scrubhint">◀ wischen ▶</div>
      </div>
      <div class="timeline"><div class="loop"></div><div class="played"></div><div class="head"></div></div>
      <div class="controls">
        <button data-a="prev" title="Bild zurück (←)">⏮</button>
        <button data-a="play" class="big" title="Abspielen/Pause (Leertaste)">▶</button>
        <button data-a="next" title="Bild vor (→)">⏭</button>
        <span class="sep"></span>
        ${SPEEDS.map((s, i) => `<button data-speed="${s}" title="Taste ${i + 1}">${String(s).replace('.', ',')}×</button>`).join('')}
        <span class="sep"></span>
        <button data-a="A" title="Schleifen-Anfang (A)">A</button>
        <button data-a="B" title="Schleifen-Ende (B)">B</button>
        <button data-a="clearloop" title="Schleife löschen (L)">✕</button>
        <span class="sep"></span>
        <button data-a="zoomout" title="Zoom zurücksetzen">⤢</button>
        <span class="time">–</span>
        <span class="grow"></span>
        <button data-a="star" title="Mit Stern behalten (S)">☆</button>
        <button data-a="export" title="Als Video speichern (E)">⬇</button>
      </div>`;
    this.video = root.querySelector('video');
    this.stage = root.querySelector('.stage');
    this.tl = root.querySelector('.timeline');
    this.$ = sel => root.querySelector(sel);

    root.querySelector('.controls').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      this.touch();
      if (b.dataset.speed) return this.setSpeed(+b.dataset.speed, true);
      this.action(b.dataset.a, true);
    });

    this.#bindStage();
    this.#bindTimeline();
    const v = this.video;
    v.addEventListener('play', () => this.#updateUI());
    v.addEventListener('pause', () => this.#updateUI());
    v.addEventListener('loadedmetadata', () => { v.playbackRate = this.speed; this.#updateUI(); });
    const tick = () => {
      if (this.loopB != null && v.currentTime >= this.loopB) v.currentTime = this.loopA ?? 0;
      this.#updateTime();
      v.requestVideoFrameCallback(tick);
    };
    v.requestVideoFrameCallback(tick);
    v.addEventListener('seeked', () => this.#updateTime());
    v.addEventListener('timeupdate', () => this.#updateTime());
    v.addEventListener('ended', () => { if (this.loop) { v.currentTime = this.loopA ?? 0; v.play().catch(() => {}); } });
    this.setSpeed(1);
  }

  touch() { this.lastInteraction = performance.now(); }
  get busy() { return performance.now() - this.lastInteraction < 10000; }
  get fps() { return this.clip?.fps || 30; }

  load(clip, blob, { speed, play = true, loop = true } = {}) {
    if (this.url) URL.revokeObjectURL(this.url);
    this.clip = clip;
    this.loop = loop;
    this.loopA = this.loopB = null;
    this.url = URL.createObjectURL(blob);
    this.video.src = this.url;
    this.root.classList.add('has-clip');
    this.resetZoom();
    if (speed) this.setSpeed(speed);
    this.video.playbackRate = this.speed;
    if (play) this.video.play().catch(() => {});
    this.#updateUI();
  }

  unload() {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    this.clip = null;
    this.video.removeAttribute('src');
    this.video.load();
    this.root.classList.remove('has-clip');
    this.#updateUI();
  }

  setSpeed(s, broadcast) {
    this.speed = s;
    this.video.playbackRate = s;
    this.root.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('on', +b.dataset.speed === s));
    this.$('.h-speed').textContent = String(s).replace('.', ',') + '×';
    if (broadcast) this.#emit('speed', s);
  }

  action(a, broadcast) {
    const v = this.video;
    if (!this.clip && a !== 'zoomout') return;
    switch (a) {
      case 'play': v.paused ? v.play().catch(() => {}) : v.pause(); break;
      case 'pause': v.pause(); break;
      case 'resume': v.play().catch(() => {}); break;
      case 'prev': this.step(-1); break;
      case 'next': this.step(1); break;
      case 'A': this.loopA = v.currentTime; if (this.loopB != null && this.loopB <= this.loopA) this.loopB = null; break;
      case 'B': this.loopB = v.currentTime; if (this.loopA != null && this.loopA >= this.loopB) this.loopA = null; this.loopA ??= 0; break;
      case 'clearloop': this.loopA = this.loopB = null; break;
      case 'zoomout': this.resetZoom(); break;
      case 'star': case 'export': this.dispatchEvent(new CustomEvent(a, { detail: this.clip })); broadcast = false; break;
    }
    this.#updateUI();
    if (broadcast) this.#emit(a === 'play' ? (v.paused ? 'pause' : 'resume') : a);
  }

  step(n, broadcast) {
    const v = this.video;
    if (!this.clip) return;
    v.pause();
    v.currentTime = Math.min(Math.max(0, v.currentTime + n / this.fps), v.duration || 0);
    if (broadcast) this.#emit('step', n);
  }

  seekBy(sec, broadcast) {
    const v = this.video;
    if (!this.clip) return;
    v.currentTime = Math.min(Math.max(0, v.currentTime + sec), v.duration || 0);
    if (broadcast) this.#emit('seekBy', sec);
  }

  resetZoom() { this.zoom = 1; this.#applyZoom(); }

  #zoomAt(e, zoom) {
    const r = this.stage.getBoundingClientRect();
    if (this.zoom <= 1) { this.zx = (e.clientX - r.left) / r.width; this.zy = (e.clientY - r.top) / r.height; }
    this.zoom = Math.min(5, Math.max(1, zoom));
    this.#applyZoom();
  }

  #applyZoom() {
    this.video.style.transformOrigin = `${this.zx * 100}% ${this.zy * 100}%`;
    this.video.style.transform = this.zoom > 1 ? `scale(${this.zoom})` : '';
    this.$('.h-zoom').textContent = this.zoom > 1 ? ` · Zoom ${this.zoom.toFixed(1).replace('.', ',')}×` : '';
  }

  #emit(type, value) { this.dispatchEvent(new CustomEvent('sync', { detail: { type, value } })); }

  #bindStage() {
    const st = this.stage, v = this.video;
    const pts = new Map(); // aktive Finger / Mauszeiger
    let drag = null, pinch = null, lastTap = 0;
    const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); };

    st.addEventListener('pointerdown', e => {
      if ((e.pointerType === 'mouse' && e.button !== 0) || !this.clip) return;
      this.touch();
      st.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, e);
      if (pts.size === 2) {
        // zwei Finger: zoomen statt spulen
        const [a, b] = [...pts.values()];
        const mid = { clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 };
        if (this.zoom <= 1) this.#zoomAt(mid, 1.01);
        pinch = { d: dist(), zoom: this.zoom };
        st.classList.remove('scrubbing');
        drag = null;
      } else if (pts.size === 1) {
        drag = { x: e.clientX, t: v.currentTime, moved: false };
      }
    });
    st.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, e);
      if (pinch && pts.size === 2) {
        this.zoom = Math.min(5, Math.max(1, pinch.zoom * dist() / pinch.d));
        this.#applyZoom();
        return;
      }
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) < 6) return;
      if (!drag.moved) { drag.moved = true; v.pause(); st.classList.add('scrubbing'); }
      // Ganze Bildbreite = 3 Sekunden: feines Spulen
      const span = Math.min(3, v.duration || 3);
      const target = Math.min(Math.max(0, drag.t + dx / st.clientWidth * span), v.duration || 0);
      const d = target - v.currentTime;
      v.currentTime = target;
      this.#emit('seekBy', d);
    });
    const end = e => {
      if (!pts.delete(e.pointerId)) return;
      if (pinch) { if (pts.size === 0) pinch = null; return; }
      if (!drag) return;
      st.classList.remove('scrubbing');
      if (!drag.moved && e.type === 'pointerup') {
        // Tippen = Play/Pause, doppelt tippen = Zoom an dieser Stelle (hebt das zweite Play/Pause wieder auf)
        this.action('play', true);
        const now = performance.now();
        if (now - lastTap < 320) { this.zoom > 1 ? this.resetZoom() : this.#zoomAt(e, 2.5); lastTap = 0; }
        else lastTap = now;
      }
      drag = null;
    };
    st.addEventListener('pointerup', end);
    st.addEventListener('pointercancel', end);
    st.addEventListener('wheel', e => {
      if (!this.clip) return;
      e.preventDefault();
      this.touch();
      if (e.ctrlKey || e.metaKey) return this.#zoomAt(e, this.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
      // Touchpads liefern viele kleine Schritte – sammeln
      this.wheelAcc = (this.wheelAcc || 0) + e.deltaY;
      const n = Math.trunc(this.wheelAcc / 40);
      if (n) { this.wheelAcc -= n * 40; this.step(Math.sign(n), true); }
    }, { passive: false });
  }

  #bindTimeline() {
    const tl = this.tl, v = this.video;
    const seek = e => {
      const r = tl.getBoundingClientRect();
      const t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (v.duration || 0);
      const d = t - v.currentTime;
      v.currentTime = t;
      this.#emit('seekBy', d);
    };
    tl.addEventListener('pointerdown', e => {
      if (!this.clip) return;
      this.touch();
      v.pause();
      tl.setPointerCapture(e.pointerId);
      seek(e);
      const stop = () => { tl.removeEventListener('pointermove', seek); tl.removeEventListener('pointerup', stop); tl.removeEventListener('pointercancel', stop); };
      tl.addEventListener('pointermove', seek);
      tl.addEventListener('pointerup', stop);
      tl.addEventListener('pointercancel', stop);
    });
  }

  #updateTime() {
    const v = this.video, d = v.duration || 0, t = v.currentTime;
    this.$('.time').textContent = this.clip ? `${fmt(t)} / ${fmt(d)} s` : '–';
    const p = d ? t / d * 100 : 0;
    this.$('.played').style.width = p + '%';
    this.$('.head').style.left = p + '%';
    const lp = this.$('.loop');
    if (d && (this.loopA != null || this.loopB != null)) {
      const a = (this.loopA ?? 0) / d * 100, b = (this.loopB ?? d) / d * 100;
      lp.style.left = a + '%'; lp.style.width = (b - a) + '%'; lp.style.display = 'block';
    } else lp.style.display = 'none';
  }

  #updateUI() {
    this.$('[data-a="play"]').textContent = this.video.paused ? '▶' : '⏸';
    this.$('[data-a="star"]').textContent = this.clip?.starred ? '★' : '☆';
    this.$('[data-a="star"]').classList.toggle('on', !!this.clip?.starred);
    this.#updateTime();
  }

  refresh() { this.#updateUI(); }

  applySync({ type, value }) {
    if (!this.clip) return;
    if (type === 'speed') this.setSpeed(value);
    else if (type === 'step') this.step(value);
    else if (type === 'seekBy') this.seekBy(value);
    else this.action(type);
  }
}
