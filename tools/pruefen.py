#!/usr/bin/env python3
# Prüft die Oberfläche der Trainings-Kamera in einem ferngesteuerten Chrome (ohne Fenster).
#
#   python3 tools/pruefen.py                 alles gegen einen eigenen lokalen Server
#   python3 tools/pruefen.py layout          nur die Maße in allen Bildschirmgrößen (schnell, ohne Kamera)
#   python3 tools/pruefen.py pause regler drehen handy   einzelne Abläufe mit dem Test-Video
#   python3 tools/pruefen.py alles https://…  gegen eine andere Adresse
#   BILDER=<Ordner>                          dort Bildschirmfotos ablegen
#
# Braucht Google Chrome und das Python-Paket "playwright" (ohne eigene Browser: Chrome wird direkt gestartet
# und über --remote-debugging-port gesteuert; ein von Playwright gestarteter Chrome liefert hier keine Kamerabilder).
import json, os, shutil, socket, subprocess, sys, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
args = [a for a in sys.argv[1:] if not a.startswith('http')]
BASE = next((a.rstrip('/') for a in sys.argv[1:] if a.startswith('http')), None)
WHAT = set(args) or {'alles'}
SHOTS = os.environ.get('BILDER')
FILE = '/#src=file:test/bewegung.mp4&profile=Nur%20Bewegung'
MUSTER = '/#src=file:test/muster.mp4&profile=Nur%20Bewegung'   # Test-Video mit Muster: daran lässt sich die Bildlage messen
problems = []


def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p


def wait_http(url, tries=80):
    for _ in range(tries):
        try:
            urllib.request.urlopen(url, timeout=1); return
        except Exception:
            time.sleep(0.25)
    raise SystemExit('nicht erreichbar: ' + url)


def bad(where, what):
    problems.append(f'{where}: {what}')


# Stellt einen Zustand ohne Kamera her (Texte der Anzeige, Ansicht, Hoch-/Querbild) und misst alles in einem Zug,
# bevor die App ihn nach einer Sekunde wieder überschreibt.
MEASURE = r"""
([layout, video, state]) => {
  const q = s => document.querySelector(s), main = q('main');
  q('#startBox').hidden = true; q('#pairBox').hidden = true;
  main.dataset.layout = layout; main.dataset.video = video;
  document.querySelectorAll('#layoutSeg button').forEach(b => b.classList.toggle('on', b.dataset.layout === layout));
  const rec = q('#recState'), det = q('#detState'), pb = q('#pauseBtn');
  const paused = state === 'pause';
  rec.className = 'pill ' + (paused ? 'paused' : 'rec');
  rec.innerHTML = paused ? 'PAUSE' : 'AUFNAHME<span class="x"> · 30 s</span>';
  det.className = 'pill ' + (paused ? '' : 'hot'); det.textContent = paused ? 'Erkennung angehalten' : 'Bewegung erkannt';
  pb.disabled = false; pb.classList.toggle('on', paused); pb.querySelector('.lbl').textContent = paused ? 'Weiter' : 'Pause';
  q('#livePane').classList.toggle('paused', paused);
  q('#livePane').classList.toggle('zoning', state === 'bereich');
  // ungünstigster Fall für die Leiste unter dem Live-Bild: „Bereich löschen“ und „Drehen“ sichtbar
  q('#zoneBtn').hidden = true; q('#zoneClear').hidden = false; q('#rotBtn').hidden = false;
  q('#delayBtn').textContent = 'Verzögert 5 s';
  document.querySelectorAll('.player').forEach(p => p.classList.add('has-clip'));

  const vis = e => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(e).visibility !== 'hidden' && +getComputedStyle(e).opacity > 0.1; };
  const box = e => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; };
  const out = { issues: [] };
  const W = innerWidth, H = innerHeight;
  if (document.documentElement.scrollWidth > W + 1) out.issues.push('Seite breiter als der Bildschirm');
  // Kopfzeile
  const head = q('header'), kids = [...head.children].filter(vis);
  const tops = [...new Set(kids.map(k => { const r = k.getBoundingClientRect(); return Math.round((r.top + r.height / 2) / 30); }))];   // Zeilen an der Mitte der Teile erkennen
  out.kopfZeilen = tops.length; out.kopfHoehe = Math.round(head.getBoundingClientRect().height);
  const st = q('.status');
  if (st.scrollWidth > st.clientWidth + 1) out.issues.push(`Anzeige oben abgeschnitten (${st.clientWidth} von ${st.scrollWidth})`);
  for (const p of [rec, det]) if (vis(p) && p.scrollWidth > p.clientWidth + 1) out.issues.push(`„${p.textContent}“ gekürzt (${p.clientWidth} von ${p.scrollWidth})`);
  for (const k of kids) { const r = k.getBoundingClientRect(); if (r.right > W + 0.5 || r.left < -0.5) out.issues.push('Kopfzeile ragt hinaus: ' + (k.id || k.className)); }
  // alle sichtbaren Knöpfe: nichts abgeschnitten, groß genug, keine Überlappung in derselben Leiste
  const coarse = matchMedia('(pointer: coarse)').matches;
  for (const b of document.querySelectorAll('header button, .panes .pane .controls button, .panes .pane .zoomchip')) {
    if (!vis(b)) continue;
    const pane = b.closest('.pane');
    if (pane && !vis(pane)) continue;
    const name = (b.id || b.dataset.a || b.dataset.speed || b.dataset.layout || b.textContent.trim()) + (pane ? '@' + pane.id : '');
    if (b.scrollWidth > b.clientWidth + 1) out.issues.push(`Knopf abgeschnitten: ${name} (${b.clientWidth} von ${b.scrollWidth})`);
    const r = b.getBoundingClientRect();
    if (coarse && (r.width < 40 || r.height < 40)) out.issues.push(`Knopf zu klein für den Finger: ${name} ${Math.round(r.width)}×${Math.round(r.height)}`);
    if (r.right > W + 0.5 || r.bottom > H + 0.5) out.issues.push('Knopf außerhalb: ' + name);
  }
  for (const bar of document.querySelectorAll('header, .controls')) {
    const bs = [...bar.querySelectorAll('button')].filter(vis).map(b => b.getBoundingClientRect());
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i], b = bs[j];
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1.5) { out.issues.push('Knöpfe überlappen in ' + (bar.className || 'Kopfzeile')); i = j = 99; }
    }
  }
  const rows = bar => new Set([...bar.querySelectorAll('button')].filter(vis).map(b => Math.round(b.getBoundingClientRect().top / 10))).size;
  const lp = q('#livePane'), p1 = q('#p1');
  if (vis(lp)) { out.live = box(lp).slice(2); out.liveBild = box(lp.querySelector('.stage')).slice(2); out.liveZeilen = rows(lp.querySelector('.controls')); }
  out.szene = box(p1).slice(2); out.szeneBild = box(p1.querySelector('.stage')).slice(2); out.szeneZeilen = rows(p1.querySelector('.controls'));
  // Bildgrößen nur ab Tablet-Größe bewerten: Am Handy-Bildschirm ist die Anzeige-Seite ein Notbehelf
  if (W >= 740 && H >= 600) {
    if (vis(lp) && state !== 'bereich') {
      const stage = lp.querySelector('.stage').getBoundingClientRect();
      if (stage.height < 90 || stage.width < 150) out.issues.push(`Live-Bild zu klein: ${Math.round(stage.width)}×${Math.round(stage.height)}`);
    }
    const s1 = p1.querySelector('.stage').getBoundingClientRect();
    if (s1.height < 240) out.issues.push(`Szenen-Bild zu niedrig: ${Math.round(s1.width)}×${Math.round(s1.height)}`);
  }
  const badge = q('#pauseBadge'); out.pauseSchild = vis(badge);
  return out;
}
"""

TOUCH = [(1366, 1024), (1280, 800), (1194, 834), (1180, 820), (1133, 744), (1080, 810), (1024, 768), (1024, 1366), (834, 1194),
         (820, 1180), (810, 1080), (768, 1024), (744, 1133), (700, 900), (600, 900), (430, 932), (390, 844), (375, 667), (844, 390)]
MOUSE = [(1920, 1080), (1600, 900), (1440, 900), (1366, 768), (1280, 720), (1180, 700), (1100, 700), (1000, 700), (900, 650), (800, 600)]


def layout(br):
    print('== Maße in allen Bildschirmgrößen')
    n = 0
    for coarse, sizes in ((True, TOUCH), (False, MOUSE)):
        ctx = br.new_context(viewport={'width': 1200, 'height': 800}, has_touch=coarse, is_mobile=coarse)
        page = ctx.new_page()
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto(BASE + '/')
        page.wait_for_selector('#p1 .controls')
        assert page.evaluate("matchMedia('(pointer: coarse)').matches") == coarse
        for w, h in sizes:
            page.set_viewport_size({'width': w, 'height': h})
            line = []
            for lay, video, state in (('live-clip', 'landscape', 'auf'), ('live-clip', 'portrait', 'auf'), ('live-clip', 'landscape', 'pause'),
                                      ('live-clip', 'landscape', 'bereich'), ('clip-clip', 'landscape', 'auf'), ('clip-clip', 'landscape', 'pause'),
                                      ('clip', 'landscape', 'auf')):
                m = page.evaluate(MEASURE, [lay, video, state])
                n += 1
                where = f"{'Finger' if coarse else 'Maus'} {w}×{h} {lay}/{video}/{state}"
                for i in m['issues']:
                    bad(where, i)
                rows_ok = m['kopfZeilen'] == 1 if w >= 740 else m['kopfZeilen'] <= (2 if w >= 390 else 3)
                if not rows_ok:
                    bad(where, f"Kopfzeile hat {m['kopfZeilen']} Zeilen")
                # Leiste unter der Szene: ab 380 px Breite höchstens zwei Zeilen, ab 950 px eine
                soll = 1 if m['szene'][0] >= 950 else 2 if m['szene'][0] >= 380 else 3
                if m['szeneZeilen'] > soll:
                    bad(where, f"Leiste unter der Szene hat {m['szeneZeilen']} Zeilen bei {m['szene'][0]} px Breite (soll {soll})")
                if state == 'pause' and lay == 'live-clip' and not m['pauseSchild']:
                    bad(where, 'Pause-Schild im Live-Bild fehlt')
                if lay == 'live-clip' and state == 'auf':
                    line.append(f"{video[:4]}: Live {m['live'][0]}×{m['live'][1]} (Bild {m['liveBild'][0]}×{m['liveBild'][1]}, {m['liveZeilen']} Z.) | Szene {m['szene'][0]}×{m['szene'][1]} (Bild {m['szeneBild'][0]}×{m['szeneBild'][1]}, {m['szeneZeilen']} Z.)")
                if lay == 'live-clip' and state == 'bereich':
                    line.append(f"beim Bereich-Zeichnen: Live {m['live'][0]}×{m['live'][1]}")
            print(f"  {'Finger' if coarse else 'Maus  '} {w:>4}×{h:<4} Kopf {m['kopfZeilen']} Z./{m['kopfHoehe']} px · " + ' · '.join(line))
            if SHOTS and (w, h) in ((1180, 820), (820, 1180), (1440, 900), (390, 844)):
                for lay, video, state in (('live-clip', 'landscape', 'auf'), ('live-clip', 'portrait', 'pause'), ('clip-clip', 'landscape', 'auf')):
                    page.evaluate(MEASURE, [lay, video, state])
                    page.screenshot(path=os.path.join(SHOTS, f"maße-{'finger' if coarse else 'maus'}-{w}x{h}-{lay}-{video}-{state}.png"))
        for e in errs:
            bad('Seite', 'Fehler: ' + e)
        ctx.close()
    print(f'  {n} Kombinationen gemessen')


def with_clips(br, w, h, coarse, url=None):
    ctx = br.new_context(viewport={'width': w, 'height': h}, has_touch=coarse, is_mobile=coarse, device_scale_factor=2)
    page = ctx.new_page()
    errs = []
    page.on('console', lambda m: errs.append(m.text) if m.type == 'error' and '404' not in m.text else None)
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto(BASE + (url or FILE))
    page.wait_for_function("document.querySelectorAll('#clips .clip').length >= 2 && document.querySelector('#p1').classList.contains('has-clip')", timeout=120000)
    page.wait_for_function("document.querySelector('#p1 video').readyState >= 2 && document.querySelector('#p1 video').duration > 1", timeout=20000)
    return ctx, page, errs


STATE = """() => { const q = s => document.querySelector(s), v = q('#p1 video'), r = e => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; };
  const v2 = q('#p2 video');
  return { t: v.currentTime, d: v.duration, paused: v.paused, rail: r(q('#p1 .rail')), tl: r(q('#p1 .timeline')), head: r(q('#p1 .timeline .head')),
           clips: document.querySelectorAll('#clips .clip').length, rec: q('#recState').textContent, recCls: q('#recState').className, det: q('#detState').textContent,
           btn: q('#pauseBtn').textContent.trim(), btnOn: q('#pauseBtn').classList.contains('on'), mark: q('#markBtn').disabled,
           badge: getComputedStyle(q('#pauseBadge')).display, live: r(q('#livePane')), p1: r(q('#p1')), toast: q('#toast').textContent,
           t2: v2 && v2.currentTime, zoneBtn: !q('#zoneBtn').hidden }; }"""


def pause(br):
    print('== Pause-Taste (mit Test-Video)')
    ctx, page, errs = with_clips(br, 1180, 820, True)
    st = lambda: page.evaluate(STATE)
    a = st()
    print(f"  vorher: „{a['rec']}“ · Knopf „{a['btn']}“ · {a['clips']} Szenen · Live {a['live'][2]:.0f} px breit, Szene {a['p1'][2]:.0f} px breit")
    if not a['rec'].startswith('AUFNAHME'): bad('Pause', 'vorher keine AUFNAHME-Anzeige: ' + a['rec'])
    page.click('#pauseBtn')
    page.wait_for_timeout(1500)
    b = st()
    print(f"  Pause:  „{b['rec']}“ ({b['recCls']}) · „{b['det']}“ · Knopf „{b['btn']}“ · Schild {b['badge']} · Markieren gesperrt: {b['mark']} · Hinweis „{b['toast']}“")
    if b['rec'] != 'PAUSE' or b['btn'] != 'Weiter' or b['badge'] != 'block' or not b['mark'] or not b['btnOn']: bad('Pause', 'Anzeige stimmt nicht: ' + json.dumps(b, ensure_ascii=False))
    n0 = b['clips']  # eine laufende Szene wird beim Anhalten noch abgeschlossen
    page.wait_for_timeout(2500)
    n0 = max(n0, st()['clips'])
    page.wait_for_timeout(22000)   # das Test-Video löst sonst etwa alle 10 s eine Szene aus
    c = st()
    print(f"  nach 24 s Pause: {c['clips']} Szenen (beim Anhalten {n0})")
    if c['clips'] != n0: bad('Pause', f"in der Pause sind Szenen entstanden: {n0} -> {c['clips']}")
    if (page.keyboard.press('m'), page.wait_for_timeout(600), st())[2]['clips'] != n0: bad('Pause', 'Taste M hat in der Pause eine Szene gespeichert')
    page.keyboard.press('p')
    page.wait_for_timeout(1500)
    d = st()
    print(f"  Weiter (Taste P): „{d['rec']}“ · Knopf „{d['btn']}“ · Markieren gesperrt: {d['mark']} · Schild {d['badge']}")
    if not d['rec'].startswith('AUFNAHME') or d['btn'] != 'Pause' or d['mark'] or d['badge'] != 'none': bad('Pause', 'nach Weiter stimmt die Anzeige nicht: ' + json.dumps(d, ensure_ascii=False))
    try:
        page.wait_for_function(f"document.querySelectorAll('#clips .clip').length > {n0}", timeout=40000)
        dur = page.evaluate("document.querySelector('#clips .clip .meta, #clips .clip').textContent.replace(/\\s+/g, ' ').trim().slice(0, 40)")
        print(f"  danach entsteht wieder eine Szene: {st()['clips']} Szenen · neueste: {dur}")
    except Exception:
        bad('Pause', 'nach Weiter entsteht keine neue Szene')
    # Bereich zeichnen: Live-Bild wird solange groß
    e0 = st()
    if e0['zoneBtn']:
        page.click('#zoneBtn'); page.wait_for_timeout(300)
        e1 = st()
        page.click('#zoneBtn'); page.wait_for_timeout(300)
        e2 = st()
        print(f"  Bereich zeichnen: Live {e0['live'][2]:.0f} -> {e1['live'][2]:.0f} -> {e2['live'][2]:.0f} px breit")
        if not (e1['live'][2] > e0['live'][2] * 1.6 and abs(e2['live'][2] - e0['live'][2]) < 2): bad('Bereich', 'Live-Bild wird beim Zeichnen nicht groß / danach nicht wieder klein')
    if SHOTS:
        page.click('#pauseBtn'); page.wait_for_timeout(800)
        page.screenshot(path=os.path.join(SHOTS, 'pause-ipad-quer.png'))
        page.click('#pauseBtn'); page.wait_for_timeout(800)
        page.screenshot(path=os.path.join(SHOTS, 'aufnahme-ipad-quer.png'))
    for e in errs: bad('Pause', 'Fehler in der Seite: ' + e)
    ctx.close()


def regler(br):
    print('== Regler unter der Szene (mit Test-Video)')
    for w, h, coarse in ((1180, 820, True), (1440, 900, False)):
        ctx, page, errs = with_clips(br, w, h, coarse)
        st = lambda: page.evaluate(STATE)
        s = st(); x0, _, rw, _ = s['rail']; _, ty, _, th = s['tl']; y = ty + th / 2
        X = lambda f: x0 + rw * f
        page.mouse.move(X(0.1), y); page.mouse.down()
        for i in range(1, 41): page.mouse.move(X(0.1 + 0.8 * i / 40), y); page.wait_for_timeout(8)
        for i in range(1, 31): page.mouse.move(X(0.9 - 0.6 * i / 30), y); page.wait_for_timeout(8)
        page.mouse.up(); page.wait_for_timeout(500)
        a = st()
        cdp = ctx.new_cdp_session(page)
        touch = lambda typ, x=None: cdp.send('Input.dispatchTouchEvent', {'type': typ, 'touchPoints': [] if x is None else [{'x': x, 'y': y, 'id': 1}]})
        touch('touchStart', X(0.2))
        for i in range(1, 31): touch('touchMove', X(0.2 + 0.6 * i / 30)); page.wait_for_timeout(8)
        for i in range(1, 21): touch('touchMove', X(0.8 - 0.2 * i / 20)); page.wait_for_timeout(8)
        touch('touchEnd'); page.wait_for_timeout(500)
        b = st()
        print(f"  {'Finger' if coarse else 'Maus  '} {w}×{h}: Zeile {th:.0f} px, Griff {s['head'][2]:.0f} px · Maus-Ziehen endet bei {a['t'] / a['d']:.2f} (soll 0,30) · Finger-Ziehen bei {b['t'] / b['d']:.2f} (soll 0,60) · angehalten: {b['paused']}")
        if abs(a['t'] / a['d'] - 0.3) > 0.01 or abs(b['t'] / b['d'] - 0.6) > 0.01 or not b['paused']: bad('Regler', f'{w}×{h}: Stelle stimmt nicht')
        for e in errs: bad('Regler', 'Fehler in der Seite: ' + e)
        ctx.close()


# Zustand rund ums Drehen: Lage von Live-Bild, Szene im Player und gespeicherter Datei
TURN = """async () => {
  const q = s => document.querySelector(s), app = window.__app, v = q('#p1 video'), live = q('#live'), lc = q('#liveCanvas');
  const { mp4Rotation } = await import('/js/mp4rot.js');
  const { getClipData } = await import('/js/storage.js');
  const { measureRotation } = await import('/js/encoder.js');
  const clip = app.players[0].clip, newest = app.clips[0];
  const file = async c => { if (!c) return null; let d = await getClipData(c.id); if (d instanceof Blob) d = await d.arrayBuffer(); return mp4Rotation(d); };
  const img = q(`.clip[data-id="${clip?.id}"] img`);
  const shown = getComputedStyle(lc).display !== 'none' ? lc : live, sw = shown.videoWidth || shown.width, sh = shown.videoHeight || shown.height;
  let same = 'kein Bild';
  try { same = measureRotation(shown, sw, sh, v, v.videoWidth, v.videoHeight); } catch (e) { same = String(e); }
  return { turn: { ...app.turn }, auto: app.buffer.config?.rotation || 0, bufRot: app.buffer.rotation, enc: [app.encoder.width, app.encoder.height, app.encoder.rotation],
    live: [sw, sh], turned: q('#livePane').classList.contains('turned'), format: q('main').dataset.video, info: q('#camInfo').textContent,
    clips: app.clips.length, newest: newest && { id: newest.id, w: newest.width, h: newest.height, file: await file(newest) },
    p1: clip && { id: clip.id, w: clip.width, h: clip.height, vw: v.videoWidth, vh: v.videoHeight, t: v.currentTime, paused: v.paused, speed: v.playbackRate, file: await file(clip),
                  thumb: img && [img.naturalWidth, img.naturalHeight] },
    same, toast: q('#toast').textContent, rotBtn: [!q('#rotBtn').hidden, q('#rotBtn').disabled] };
}"""


def drehen(br):
    print('== Drehen (mit Test-Video)')
    ctx, page, errs = with_clips(br, 1180, 820, True, MUSTER)
    st = lambda: page.evaluate(TURN)
    fmt = lambda s: f"Live {s['live'][0]}×{s['live'][1]} · Szene im Player {s['p1']['vw']}×{s['p1']['vh']} (Datei {s['p1']['file']}°) · neue Szenen {s['bufRot']}°"
    def newest_into_player(n0, was):
        page.wait_for_function(f"window.__app.clips.length > {n0}", timeout=60000)
        page.wait_for_timeout(300)
        page.click('#clips .clip')       # neueste Szene steht vorn
        page.wait_for_function("(() => { const a = window.__app, v = a.players[0].video; return a.players[0].clip === a.clips[0] && v.readyState >= 2 && v.videoWidth > 0; })()", timeout=20000)
        page.wait_for_timeout(400)
        return st()

    # 1. Die Messung selbst: ein Bild, das um 0/90/180/270 Grad gedreht gezeigt wird, muss genau so erkannt werden
    got = page.evaluate("""async () => {
      const { measureRotation } = await import('/js/encoder.js');
      const v = document.querySelector('#live'), vw = v.videoWidth, vh = v.videoHeight, out = {};
      for (const k of [0, 90, 180, 270]) {
        const w = k % 180 ? vh : vw, h = k % 180 ? vw : vh;
        const c = Object.assign(document.createElement('canvas'), { width: w, height: h }), g = c.getContext('2d');
        g.translate(w / 2, h / 2); g.rotate(k * Math.PI / 180); g.drawImage(v, -vw / 2, -vh / 2);
        out[k] = measureRotation(c, w, h, v, vw, vh);
      }
      const blank = Object.assign(document.createElement('canvas'), { width: vw, height: vh });
      out.leer = measureRotation(blank, vw, vh, blank, vw, vh);
      return out; }""")
    print(f"  Messung der Bildlage: {got}")
    if [got[k] for k in ('0', '90', '180', '270')] != [0, 90, 180, 270] or got['leer'] is not None: bad('Drehen', f'Messung der Bildlage falsch: {got}')

    a = st()
    print(f"  vorher:            {fmt(a)} · Knopf sichtbar/gesperrt: {a['rotBtn']}")
    if a['rotBtn'] != [True, False]: bad('Drehen', 'Knopf „Drehen“ unter dem Live-Bild fehlt oder ist gesperrt')
    if a['enc'][2] != 0 or a['auto'] != 0 or a['turned'] or a['same'] != 0: bad('Drehen', f'ungedrehtes Test-Video wird als gedreht erkannt: {a}')
    if page.locator('#p1 [data-a="rotate"]').count() != 1 or 'Drehen' not in page.locator('#p1 [data-a="rotate"]').inner_text(): bad('Drehen', 'Knopf „Drehen“ unter der Szene fehlt oder hat kein Wort')

    # 2. Live-Bild drehen: Bild steht hochkant, neue Szenen kommen genauso
    page.click('#rotBtn'); page.wait_for_timeout(1300)
    b = st()
    print(f"  Live gedreht:      {fmt(b)} · Format {b['format']} · „{b['toast']}“ · {b['info']}")
    if not (b['turn']['live'] == 90 and b['turned'] and b['live'] == [a['live'][1], a['live'][0]] and b['format'] == 'portrait' and b['bufRot'] == 90):
        bad('Drehen', f'Live-Bild nach „Drehen“ nicht hochkant: {b}')
    if SHOTS: page.screenshot(path=os.path.join(SHOTS, 'drehen-1-live-gedreht.png'))
    c = newest_into_player(b['clips'], b)
    print(f"  neue Szene:        {fmt(c)} · Vergleich Live/Szene: {c['same']} (0 = liegen gleich)")
    if not (c['p1']['file'] == 90 and c['p1']['vh'] > c['p1']['vw'] and c['p1']['h'] > c['p1']['w']): bad('Drehen', f'neue Szene ist nicht mitgedreht: {c}')
    if c['same'] != 0: bad('Drehen', f"neue Szene liegt anders als das Live-Bild: {c['same']}")
    if SHOTS: page.screenshot(path=os.path.join(SHOTS, 'drehen-2-neue-szene.png'))

    # 3. Szene drehen: Datei, Player und Vorschaubild drehen sich, die Stelle bleibt, neue Szenen folgen
    page.evaluate("() => { const p = window.__app.players[0]; p.setSpeed(0.25); p.video.pause(); p.video.currentTime = 1.2; }")
    page.wait_for_timeout(500)
    c = st()
    page.click('#p1 [data-a="rotate"]'); page.wait_for_timeout(1500)
    d = st()
    print(f"  Szene gedreht:     {fmt(d)} · Stelle {c['p1']['t']:.2f} -> {d['p1']['t']:.2f} s · Tempo {d['p1']['speed']} · Vorschaubild {c['p1']['thumb']} -> {d['p1']['thumb']} · „{d['toast']}“")
    if not (d['p1']['file'] == 180 and d['p1']['vw'] > d['p1']['vh'] and d['p1']['w'] > d['p1']['h']): bad('Drehen', f'Szene nach „Drehen“ nicht gedreht: {d}')
    if abs(d['p1']['t'] - c['p1']['t']) > 0.1 or not d['p1']['paused'] or d['p1']['speed'] != 0.25: bad('Drehen', f"Stelle/Tempo nach dem Drehen verloren: {d['p1']}")
    if not (d['p1']['thumb'] and d['p1']['thumb'][0] > d['p1']['thumb'][1]): bad('Drehen', f"Vorschaubild nicht mitgedreht: {d['p1']['thumb']}")
    if not (d['turn']['fix'] == 90 and d['bufRot'] == 180 and 'neue Szenen' in d['toast']): bad('Drehen', f'neue Szenen folgen der gedrehten Szene nicht: {d}')
    if SHOTS: page.screenshot(path=os.path.join(SHOTS, 'drehen-3-szene-gedreht.png'))
    e = newest_into_player(d['clips'], d)
    print(f"  nächste Szene:     {fmt(e)}")
    if not (e['p1']['file'] == 180 and e['p1']['vw'] > e['p1']['vh']): bad('Drehen', f'nächste Szene kommt nicht so wie die gedrehte: {e}')

    # 4. Eine alte Szene (nicht aus diesem Lauf) drehen: nur sie selbst ändert sich. Taste R dreht ebenfalls.
    page.evaluate("() => { delete window.__app.players[0].clip.key; }")
    page.keyboard.press('r'); page.wait_for_timeout(1500)
    f = st()
    print(f"  alte Szene (R):    {fmt(f)} · „{f['toast']}“")
    if not (f['p1']['file'] == 270 and f['bufRot'] == 180 and f['toast'] == 'Szene gedreht'): bad('Drehen', f'alte Szene: Drehen wirkt falsch: {f}')

    # 5. Dreimal weiter am Live-Bild: wieder wie am Anfang
    for _ in range(3): page.click('#rotBtn'); page.wait_for_timeout(250)
    g = st()
    print(f"  Live 3× weiter:    Live {g['live'][0]}×{g['live'][1]} · gedreht-Anzeige {g['turned']} · Format {g['format']}")
    if g['turn']['live'] != 0 or g['turned'] or g['live'] != a['live'] or g['format'] != 'landscape': bad('Drehen', f'Live-Bild kommt nach vier Vierteldrehungen nicht zurück: {g}')

    # 6. Bereich dreht sich mit: Rahmen links oben wandert nach rechts oben
    z = page.evaluate("""async () => { const s = await import('/js/settings.js'); s.updateProfile({ zone: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } });
      document.querySelector('#rotBtn').click(); const z = s.profile().zone; s.updateProfile({ zone: null }); document.querySelector('#rotBtn').click(); document.querySelector('#rotBtn').click(); document.querySelector('#rotBtn').click();
      return [z.x, z.y, z.w, z.h].map(n => Math.round(n * 100) / 100); }""")
    print(f"  Bereich dreht mit: 0,1/0,2/0,3/0,4 -> {z}")
    if z != [0.4, 0.1, 0.4, 0.3]: bad('Drehen', f'Bereich dreht sich nicht richtig mit: {z}')
    for x in errs: bad('Drehen', 'Fehler in der Seite: ' + x)
    ctx.close()

    # 7. Aufnahme liegt anders als der Bildschirm (wie am iPad). Zwei Fälle:
    #    a) ein Video, das nur durch den Dateikopf richtig steht – wie der Browser dessen Bilder weitergibt, ist seine Sache;
    #    b) die Bilder kommen so, als läge der Kamera-Chip quer (rawturn) – das muss die App selbst merken.
    #    In beiden Fällen muss die Szene so stehen wie das Live-Bild, ohne dass jemand „Drehen“ tippt.
    for name, url, soll in (('liegend gespeichert', '/#src=file:test/gedreht.mp4&profile=Nur%20Bewegung', None),
                            ('Chip quer (90°)', MUSTER + '&rawturn=90', 90), ('Chip quer (270°)', MUSTER + '&rawturn=270', 270),
                            ('Chip kopfüber (180°)', MUSTER + '&rawturn=180', 180)):
        ctx, page, errs = with_clips(br, 820, 1180, True, url)
        page.wait_for_timeout(1500)
        h = st()
        i = newest_into_player(h['clips'], h)
        page.click('#delayBtn'); page.wait_for_timeout(6500)
        dl = page.evaluate("""async () => { const { measureRotation } = await import('/js/encoder.js'); const l = document.querySelector('#live'), d = document.querySelector('#delayCanvas');
          return [d.width, d.height, measureRotation(l, l.videoWidth, l.videoHeight, d, d.width, d.height)]; }""")
        print(f"  {name + ':':<22} Bildschirm {i['live'][0]}×{i['live'][1]} · Aufnahme {i['enc'][0]}×{i['enc'][1]}, gemessene Lage {i['enc'][2]}° · Szene {i['p1']['vw']}×{i['p1']['vh']} (Datei {i['p1']['file']}°) · Vergleich Live/Szene: {i['same']} · verzögertes Bild {dl[0]}×{dl[1]}, Vergleich: {dl[2]}")
        if i['same'] != 0 or (i['p1']['vh'] > i['p1']['vw']) != (i['live'][1] > i['live'][0]): bad('Drehen', f'{name}: Szene steht anders als das Live-Bild: {i}')
        if soll is not None and i['enc'][2] != soll: bad('Drehen', f"{name}: Lage falsch gemessen ({i['enc'][2]}° statt {soll}°)")
        if dl[2] != 0: bad('Drehen', f'{name}: verzögertes Bild steht anders als das Live-Bild: {dl}')
        if SHOTS and soll == 90: page.screenshot(path=os.path.join(SHOTS, 'drehen-4-chip-quer.png'))
        for x in errs: bad('Drehen', 'Fehler in der Seite: ' + x)
        ctx.close()



def handy(br):
    print('== Handy als Kamera: Bildlage kommt mit (zwei Seiten, Test-Video statt Kamera)')
    # Lage des Live-Bilds vom Handy, der Szene und des Musters selbst (Vergleichsbild)
    LAGE = """async () => {
      const q = s => document.querySelector(s), app = window.__app, lc = q('#liveCanvas'), v = q('#p1 video');
      const { measureRotation } = await import('/js/encoder.js'); const { mp4Rotation } = await import('/js/mp4rot.js'); const { getClipData } = await import('/js/storage.js');
      let ref = window.__ref;
      if (!ref) { ref = window.__ref = Object.assign(document.createElement('video'), { muted: true, loop: true, src: 'test/muster.mp4' }); await ref.play(); await new Promise(r => setTimeout(r, 400)); }
      const clip = app.players[0].clip; let d = clip && await getClipData(clip.id); if (d instanceof Blob) d = await d.arrayBuffer();
      return { link: app.link?.state, auto: app.buffer.config?.rotation, raw: app.buffer.config && [app.buffer.config.width, app.buffer.config.height], turn: { ...app.turn }, live: [lc.width, lc.height],
        liveGegenMuster: measureRotation(ref, 1280, 720, lc, lc.width, lc.height), clips: app.clips.length, info: q('#camInfo').textContent,
        szene: clip && [v.videoWidth, v.videoHeight], datei: d ? mp4Rotation(d) : null, szeneGegenMuster: clip && v.videoWidth ? measureRotation(ref, 1280, 720, v, v.videoWidth, v.videoHeight) : null,
        rotBtn: [!q('#rotBtn').hidden, q('#rotBtn').disabled] };
    }"""
    for turn in (0, 90):
        ctx = br.new_context(viewport={'width': 1180, 'height': 820}, has_touch=True, is_mobile=True)
        tab = ctx.new_page(); errs = []
        tab.on('pageerror', lambda e: errs.append(str(e)))
        tab.goto(BASE + '/#src=phone&profile=Nur%20Bewegung')
        tab.wait_for_selector('#pairCode')
        code = tab.evaluate("async () => (await import('/js/settings.js')).settings.code")
        ph = ctx.new_page()
        ph.on('pageerror', lambda e: errs.append('Handy: ' + str(e)))
        ph.goto(BASE + f'/kamera.html#c={code}&src=test/muster.mp4&auto=1' + (f'&rawturn={turn}' if turn else ''))
        try:
            tab.wait_for_function("window.__app.link?.state === 'connected' && window.__app.liveView.lastTs > 0", timeout=60000)
        except Exception:
            bad('Handy', f'keine Verbindung zwischen den beiden Seiten (Chip {turn}°): ' + tab.evaluate("document.querySelector('#pairState').textContent + ' ' + document.querySelector('#pairErr').textContent")); ctx.close(); continue
        tab.wait_for_function("window.__app.clips.length >= 1", timeout=90000)
        tab.wait_for_timeout(500); tab.click('#clips .clip')
        tab.wait_for_function("(() => { const v = window.__app.players[0].video; return v.readyState >= 2 && v.videoWidth > 0; })()", timeout=20000)
        tab.wait_for_timeout(1200)
        a = tab.evaluate(LAGE)
        hinfo = ph.evaluate("document.querySelector('#info').textContent")
        print(f"  Chip {turn:>3}°: Aufnahme {a['raw'][0]}×{a['raw'][1]}, Lage vom Handy gemeldet {a['auto']}° · Live {a['live'][0]}×{a['live'][1]} (gegen Muster: {a['liveGegenMuster']}) · Szene {a['szene'][0]}×{a['szene'][1]}, Datei {a['datei']}° (gegen Muster: {a['szeneGegenMuster']}) · Anzeige „{a['info']}“ · am Handy „{hinfo}“")
        if a['auto'] != turn or a['liveGegenMuster'] != 0 or a['szeneGegenMuster'] != 0 or a['live'] != [1280, 720]: bad('Handy', f'Chip {turn}°: Bild steht am Tablet nicht richtig: {a}')
        if '1280×720' not in a['info'] or 'Querformat · 1280×720' not in hinfo: bad('Handy', f"Chip {turn}°: Größe falsch angezeigt: „{a['info']}“ / „{hinfo}“")
        if a['rotBtn'] != [True, False]: bad('Handy', '„Drehen“ unter dem Live-Bild fehlt')
        # von Hand weiterdrehen: Live-Bild und die nächste Szene stehen danach eine Vierteldrehung weiter
        tab.click('#rotBtn'); tab.wait_for_timeout(1500)
        n = tab.evaluate("window.__app.clips.length")
        tab.wait_for_function(f"window.__app.clips.length > {n}", timeout=60000)
        tab.wait_for_timeout(500); tab.click('#clips .clip')
        tab.wait_for_function("(() => { const a = window.__app, v = a.players[0].video; return a.players[0].clip === a.clips[0] && v.readyState >= 2 && v.videoWidth > 0; })()", timeout=20000)
        tab.wait_for_timeout(1200)
        b = tab.evaluate(LAGE)
        print(f"             nach „Drehen“: Live {b['live'][0]}×{b['live'][1]} (gegen Muster: {b['liveGegenMuster']}) · neue Szene {b['szene'][0]}×{b['szene'][1]}, Datei {b['datei']}° (gegen Muster: {b['szeneGegenMuster']}) · „{b['info']}“")
        # 270 heißt: Das Bild müsste 270° weitergedreht werden, um wieder wie das Muster zu stehen – es steht also 90° gedreht
        if b['liveGegenMuster'] != 270 or b['szeneGegenMuster'] != 270 or b['live'] != [720, 1280] or b['datei'] != (turn + 90) % 360: bad('Handy', f'Chip {turn}°: „Drehen“ wirkt nicht auf Live-Bild und neue Szene: {b}')
        if SHOTS and turn == 90: tab.screenshot(path=os.path.join(SHOTS, 'handy-gedreht.png'))
        for x in errs: bad('Handy', 'Fehler in der Seite: ' + x)
        ctx.close()


server = None
if not BASE:
    port = free_port()
    server = subprocess.Popen([sys.executable, os.path.join(ROOT, 'tools', 'server.py'), str(port), '--no-browser'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    BASE = f'http://localhost:{port}'
    wait_http(BASE + '/index.html')
prof = tempfile.mkdtemp(prefix='tk-chrome-')
cport = free_port()
chrome = subprocess.Popen([CHROME, '--headless=new', f'--remote-debugging-port={cport}', f'--user-data-dir={prof}', '--no-first-run',
                           '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', 'about:blank'],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    wait_http(f'http://127.0.0.1:{cport}/json/version')
    with sync_playwright() as pw:
        br = pw.chromium.connect_over_cdp(f'http://127.0.0.1:{cport}')
        for name, fn in (('layout', layout), ('pause', pause), ('regler', regler), ('drehen', drehen), ('handy', handy)):
            if name in WHAT or 'alles' in WHAT:
                try:
                    fn(br)
                except Exception as e:
                    bad(name, 'Abbruch: ' + repr(e)[:400])
        br.close()
finally:
    chrome.terminate()
    if server: server.terminate()
    try: chrome.wait(timeout=5)
    except Exception: chrome.kill()
    shutil.rmtree(prof, ignore_errors=True)
print('\n' + (f'{len(problems)} Auffälligkeiten:\n  ' + '\n  '.join(problems) if problems else 'Keine Auffälligkeiten.'))
sys.exit(1 if problems else 0)
