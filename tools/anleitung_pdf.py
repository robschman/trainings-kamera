# Erzeugt die Druck-Anleitung:  python3 tools/anleitung_pdf.py Anleitung-Trainings-Kamera.pdf
# Braucht das Python-Paket "reportlab" und die Schrift Arial (auf dem Mac vorhanden).
import sys
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

F = '/System/Library/Fonts/Supplemental/'
pdfmetrics.registerFont(TTFont('Reg', F + 'Arial Unicode.ttf'))   # enthält auch die Symbole
pdfmetrics.registerFont(TTFont('Bold', F + 'Arial Bold.ttf'))
pdfmetrics.registerFontFamily('Reg', normal='Reg', bold='Bold', italic='Reg', boldItalic='Bold')

ACCENT = colors.HexColor('#E89400')
DARK = colors.HexColor('#1B2430')
GREY = colors.HexColor('#5D6B7A')
LIGHT = colors.HexColor('#F3F5F8')
GREEN = colors.HexColor('#1F9D5B')

h1 = ParagraphStyle('h1', fontName='Bold', fontSize=24, leading=29, textColor=DARK, spaceAfter=4)
sub = ParagraphStyle('sub', fontName='Reg', fontSize=11.5, leading=16, textColor=GREY, spaceAfter=8)
h2 = ParagraphStyle('h2', fontName='Bold', fontSize=15, leading=19, textColor=DARK, spaceBefore=11, spaceAfter=6)
body = ParagraphStyle('body', fontName='Reg', fontSize=10.5, leading=15, textColor=DARK)
small = ParagraphStyle('small', parent=body, fontSize=9.5, leading=13, textColor=GREY)
cell = ParagraphStyle('cell', parent=body, leading=14)
cellb = ParagraphStyle('cellb', parent=cell, fontName='Bold')
num = ParagraphStyle('num', fontName='Bold', fontSize=13, leading=16, textColor=colors.white, alignment=1)
big_key = ParagraphStyle('bk', fontName='Reg', fontSize=14.5, leading=18, textColor=DARK)
big_txt = ParagraphStyle('bt', fontName='Reg', fontSize=14.5, leading=18, textColor=DARK)
bul = ParagraphStyle('bul', parent=body, leftIndent=12, bulletIndent=0, spaceAfter=3)

W = A4[0] - 36 * mm
SYM = lambda ch: '<font name="Reg">%s</font>' % ch  # Symbole gibt es nur in der normalen Schrift


def steps(items):
    rows = [[Paragraph(str(i + 1), num), Paragraph(t, body)] for i, t in enumerate(items)]
    t = Table(rows, colWidths=[9 * mm, W - 9 * mm])
    st = [('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 0),
          ('BOTTOMPADDING', (0, 0), (-1, -1), 6), ('LEFTPADDING', (1, 0), (1, -1), 8)]
    for i in range(len(rows)):
        st += [('BACKGROUND', (0, i), (0, i), ACCENT), ('TOPPADDING', (0, i), (0, i), 2), ('BOTTOMPADDING', (0, i), (0, i), 3)]
    t.setStyle(TableStyle(st))
    return t


def bullets(items):
    return [Paragraph(t, bul, bulletText='•') for t in items]


def box(text, border):
    t = Table([[Paragraph(text, body)]], colWidths=[W])
    t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), LIGHT), ('LEFTPADDING', (0, 0), (-1, -1), 10),
                           ('RIGHTPADDING', (0, 0), (-1, -1), 10), ('TOPPADDING', (0, 0), (-1, -1), 7),
                           ('BOTTOMPADDING', (0, 0), (-1, -1), 8), ('LINEBEFORE', (0, 0), (0, -1), 3, border)]))
    return t


def table(rows, widths, key_style=cellb, txt_style=cell, pad=5):
    t = Table([[Paragraph(a, key_style), Paragraph(b, txt_style)] for a, b in rows], colWidths=widths)
    t.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('LINEBELOW', (0, 0), (-1, -1), 0.5, colors.HexColor('#D5DBE2')),
                           ('TOPPADDING', (0, 0), (-1, -1), pad), ('BOTTOMPADDING', (0, 0), (-1, -1), pad),
                           ('ROWBACKGROUNDS', (0, 0), (-1, -1), [colors.white, LIGHT])]))
    return t


def footer(c, doc):
    c.saveState()
    c.setFont('Reg', 8.5)
    c.setFillColor(GREY)
    c.drawString(18 * mm, 10 * mm, 'Trainings-Kamera – Anleitung')
    c.drawRightString(A4[0] - 18 * mm, 10 * mm, f'Seite {doc.page}')
    c.setStrokeColor(ACCENT)
    c.setLineWidth(2)
    c.line(18 * mm, A4[1] - 12 * mm, A4[0] - 18 * mm, A4[1] - 12 * mm)
    c.restoreState()


story = [
    Paragraph('Trainings-Kamera', h1),
    Paragraph('Das Handy filmt, das Tablet zeigt die Szenen. Kommt ein Spieler nah genug ins Bild, schneidet die App '
              'die Szene automatisch aus – 2 Sekunden vorher bis 1,5 Sekunden danach – und spielt sie sofort in '
              'Zeitlupe ab. Das Video geht direkt vom Handy zum Tablet, nicht ins Internet.', sub),

    Paragraph('Handy + Tablet verbinden', h2),
    steps([
        'Handy und Tablet ins <b>selbe WLAN</b> bringen. Kein WLAN in der Halle? Am Handy den <b>Hotspot</b> '
        'einschalten und das Tablet damit verbinden.',
        'Am <b>Tablet</b> in Safari diese Adresse öffnen:<br/><font size="13"><b>robschman.github.io/trainings-kamera</b></font><br/>'
        '<font color="#5D6B7A">Die Adresse springt auf beautyroutine.app/trainings-kamera um. Das ist richtig so.</font>',
        'Am Tablet <b>„Handy als Kamera“</b> tippen. Es erscheint ein QR-Code.',
        'Den Code mit der Kamera-App des <b>Handys</b> scannen und den Link öffnen.',
        'Am Handy <b>„Kamera starten“</b> tippen und den Kamera-Zugriff erlauben. Nach ein paar Sekunden erscheint '
        'das Bild am Tablet.',
    ]),
    Spacer(1, 2),
    box('<b>Internet:</b> Zum Öffnen der App und zum Verbinden brauchen beide Geräte Internet. Beim ersten Öffnen lädt '
        'das Tablet einmal bis zu 20 MB. Das Video selbst läuft direkt vom Handy zum Tablet.', ACCENT),
    Spacer(1, 6),
    box('<b>Tipp:</b> Am Tablet in Safari auf <b>Teilen</b> und dann <b>„Zum Home-Bildschirm“</b> tippen. '
        'Dann startet die Trainings-Kamera wie eine normale App.', GREEN),

    Paragraph('Das Handy aufstellen', h2),
    *bullets([
        '<b>Quer</b> halten und fest aufstellen (Stativ), etwa 1–2 Meter vom Spieler entfernt.',
        'Die Seite muss <b>offen und im Vordergrund</b> bleiben. Wird das Handy gesperrt, stoppt die Kamera. '
        'Der Bildschirm bleibt von selbst an.',
        'Ans <b>Ladegerät oder eine Powerbank</b> hängen – Filmen und Senden brauchen viel Strom.',
        '<b>„Abdunkeln“</b> macht den Bildschirm fast schwarz und spart Akku. Die Kamera läuft weiter.',
        'Die <b>Linse</b> (z. B. Weitwinkel) wählt man am Handy unten links oder am Tablet in den Einstellungen.',
    ]),
    Spacer(1, 6),
    box('<b>Verbindung weg?</b> Das Tablet zeigt wieder den QR-Code und wartet. Sobald das Handy die Seite wieder '
        'offen hat, verbinden sich beide von selbst. Der Code bleibt gleich.', GREEN),
    Spacer(1, 6),
    box('<b>Ohne Internet (zu Hause):</b> Mac, Handy und Tablet ins selbe WLAN. Am Mac <b>Start-Mac.command</b> '
        'doppelklicken und dem QR-Code folgen. Safari warnt dabei einmal: <b>Details einblenden</b>, dann '
        '<b>diese Website öffnen</b>.', GREY),

    PageBreak(),
    Paragraph('Die Erkennung einstellen', h2),
    Paragraph('Im Live-Bild sieht man, was die App erkennt:', body), Spacer(1, 4),
    *bullets([
        '<font color="#1F9D5B"><b>Grüner Rahmen „Spieler“</b></font> – diese Person löst eine Szene aus.',
        '<font color="#5D6B7A"><b>Grauer Rahmen „zu weit weg“</b></font> – Leute im Hintergrund werden ignoriert.',
        'Der <font color="#E89400"><b>gelbe Balken</b></font> links im Bild zeigt die <b>Mindestgröße</b>: Nur wer '
        'mindestens so groß im Bild ist, zählt. Standard: 40 % der Bildhöhe.',
        '<b>„' + SYM('▭') + ' Bereich“</b>: mit dem Finger einen Rahmen um den Spielbereich ziehen. Dann zählt nur, wer darin steht.',
        'Für andere Sportarten in den Einstellungen ein <b>neues Profil</b> anlegen (z. B. „Fußball Schuss“).',
    ]),

    Paragraph('Die Ansichten', h2),
    table([
        ('Live | Szene', 'Links das Kamerabild, rechts die Szene.'),
        ('Szene | Szene', 'Zwei Szenen nebeneinander. Mit <b>' + SYM('⇄') + ' Synchron</b> laufen beide gemeinsam.'),
        ('Nur Szene', 'Die Szene groß über den ganzen Bildschirm.'),
        ('Verzögert', 'Das Live-Bild läuft 5 Sekunden später – der Spieler sieht sich selbst.'),
    ], [38 * mm, W - 38 * mm]),

    Paragraph('Szenen speichern', h2),
    *bullets([
        'Szenen bleiben am Tablet gespeichert. Behalten werden die letzten 150.',
        'Szenen mit <b>Stern ' + SYM('★') + '</b> werden nie automatisch gelöscht.',
        'Der <b>Pfeil-nach-unten-Knopf</b> öffnet am Tablet das Teilen-Menü (in „Fotos“ sichern, weiterschicken).',
        '<b>„Szene markieren“</b> speichert sofort die letzten 8 Sekunden.',
    ]),

    Paragraph('Wenn etwas nicht geht', h2),
    table([
        ('Tablet wartet auf das Handy', 'Sind beide im selben WLAN? Am Handy die Seite neu laden und „Kamera starten“ tippen.'),
        ('„Vermittlung nicht erreichbar“', 'Hat das Gerät Internet? Zum Verbinden ist es kurz nötig.'),
        ('Geräte finden sich nicht', 'Manche Gäste-WLANs trennen die Geräte. Dann das Tablet mit dem Hotspot des Handys verbinden.'),
        ('„WLAN zu langsam!“', 'Näher zusammenrücken oder in den Einstellungen die Qualität auf 4 Mbit/s senken.'),
        ('Bild bleibt stehen', 'Handy gesperrt oder Seite im Hintergrund? Seite wieder nach vorn holen.'),
        ('Zu viele Szenen', 'Mindestgröße <b>erhöhen</b> oder einen Bereich zeichnen.'),
        ('Szenen fehlen', 'Mindestgröße <b>senken</b>.'),
    ], [50 * mm, W - 50 * mm]),

    # Seite 3: Bedienkarte zum Aufhängen
    PageBreak(),
    Paragraph('Bedienkarte', h1),
    Paragraph('Am Tablet mit dem Finger', sub),
    table([
        ('Ins Bild tippen', 'Abspielen / Pause'),
        ('Über das Bild wischen', 'Vor- und zurückspulen'),
        ('Knöpfe links und rechts von ' + SYM('▶'), 'Ein Bild zurück / vor'),
        ('0,1× bis 2×', 'Tempo wählen'),
        ('Doppelt tippen', 'Hineinzoomen (Ball, Hand, Fuß)'),
        ('Zwei Finger spreizen', 'Stufenlos zoomen'),
        ('A  /  B  /  ' + SYM('✕'), 'Schleife: Anfang / Ende / löschen'),
        ('Szene lange drücken', 'Im zweiten Player öffnen (Vergleich)'),
        ('Stern ' + SYM('★'), 'Szene behalten'),
        ('Pfeil nach unten', 'Szene teilen oder sichern'),
        ('Szene markieren', 'Die letzten 8 Sekunden speichern'),
    ], [70 * mm, W - 70 * mm], key_style=big_key, txt_style=big_txt, pad=7),
    Spacer(1, 10),
    Paragraph('Am PC mit Tastatur: Leertaste = Abspielen/Pause · Pfeiltasten = Bild für Bild · 1–5 = Tempo · '
              'M = Szene markieren · S = Stern · D = Live/verzögert', small),
]

doc = BaseDocTemplate(sys.argv[1] if len(sys.argv) > 1 else 'Anleitung-Trainings-Kamera.pdf', pagesize=A4,
                      leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
                      title='Trainings-Kamera – Anleitung')
doc.addPageTemplates([PageTemplate(frames=[Frame(18 * mm, 16 * mm, W, A4[1] - 34 * mm, id='f')], onPage=footer)])
doc.build(story)
print('ok')
