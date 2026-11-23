# Erzeugt die Trainerkarte (eine Seite A5):  python3 tools/trainerkarte_pdf.py [Zielordner]
#   Trainerkarte-A5.pdf              eine Karte im Format A5
#   Trainerkarte-A5-zwei-auf-A4.pdf  zwei Karten auf einem A4-Blatt (quer), in der Mitte durchschneiden
# Braucht das Python-Paket "reportlab" und die Schrift Arial (auf dem Mac vorhanden).
import os
import sys
from reportlab.lib.pagesizes import A4, A5, landscape
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Frame, Paragraph, Spacer, Table, TableStyle, Flowable
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing

ADDR = 'superkamera.schrittfuerschrittfit.at'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICON = os.path.join(ROOT, 'icons', 'icon-512.png')

F = '/System/Library/Fonts/Supplemental/'
pdfmetrics.registerFont(TTFont('Reg', F + 'Arial Unicode.ttf'))   # enthält auch die Symbole
pdfmetrics.registerFont(TTFont('Bold', F + 'Arial Bold.ttf'))
pdfmetrics.registerFontFamily('Reg', normal='Reg', bold='Bold', italic='Reg', boldItalic='Bold')

ACCENT = colors.HexColor('#E89400')
DARK = colors.HexColor('#1B2430')
GREY = colors.HexColor('#5D6B7A')
LIGHT = colors.HexColor('#F3F5F8')
LINE = colors.HexColor('#D5DBE2')

CW, CH = A5                      # eine Karte: 148 × 210 mm
M = 8 * mm                       # Rand: bleibt bei jedem Drucker im druckbaren Bereich
W = CW - 2 * M
HEAD_H = 14.5 * mm                # Kopf mit Symbol und Titel
FOOT_H = 5.5 * mm

body = ParagraphStyle('body', fontName='Reg', fontSize=9, leading=11.4, textColor=DARK)
key = ParagraphStyle('key', parent=body, fontName='Bold')
note = ParagraphStyle('note', parent=body, textColor=GREY, spaceAfter=3)
bul = ParagraphStyle('bul', parent=body, leftIndent=9, bulletIndent=0, spaceAfter=1.5)
cap = ParagraphStyle('cap', fontName='Reg', fontSize=7.6, leading=9.4, textColor=GREY, alignment=1)
SYM = lambda ch: '<font name="Reg">%s</font>' % ch  # Symbole gibt es nur in der normalen Schrift


class Head(Flowable):
    """Abschnitts-Titel mit Linie bis zum rechten Rand."""
    def __init__(self, text):
        super().__init__()
        self.text = text

    def wrap(self, aw, ah):
        self.width, self.height = aw, 16
        return aw, self.height

    def draw(self):
        c = self.canv
        c.setFont('Bold', 11)
        c.setFillColor(DARK)
        c.drawString(0, 3.6, self.text)
        c.setStrokeColor(ACCENT)
        c.setLineWidth(1.2)
        c.line(c.stringWidth(self.text, 'Bold', 11) + 6, 7.4, self.width, 7.4)


class Num(Flowable):
    """Schritt-Nummer im Kreis."""
    def __init__(self, n):
        super().__init__()
        self.n = str(n)

    def wrap(self, aw, ah):
        return 14, 14

    def draw(self):
        c = self.canv
        c.setFillColor(ACCENT)
        c.circle(7, 7, 7, stroke=0, fill=1)
        c.setFillColor(colors.white)
        c.setFont('Bold', 9)
        c.drawCentredString(7, 3.9, self.n)


def qr(size):
    w = QrCodeWidget('https://' + ADDR, barLevel='M', barBorder=2)
    b = w.getBounds()
    s = size / (b[2] - b[0])
    d = Drawing(size, size, transform=[s, 0, 0, s, 0, 0])
    d.add(w)
    return d


def start_box():
    pad, qr_w = 7, 27 * mm
    steps_w = W - 2 * pad - qr_w - 6
    items = [
        'Handy und Tablet ins <b>selbe WLAN</b> bringen. Kein WLAN da? Am Handy den <b>Hotspot</b> einschalten, '
        'Tablet damit verbinden.',
        'Am <b>Tablet</b> in Safari öffnen:<br/><font size="10"><b>%s</b></font>' % ADDR,
        'Am Tablet <b>„Handy als Kamera“</b> tippen.',
        'Den QR-Code, der am Tablet erscheint, mit der Kamera-App des <b>Handys</b> scannen und den Link antippen.',
        'Am Handy <b>„Kamera starten“</b> tippen und die Kamera erlauben. Kurz darauf ist das Bild am Tablet.',
    ]
    steps = Table([[Num(i + 1), Paragraph(t, body)] for i, t in enumerate(items)], colWidths=[19, steps_w - 19])
    steps.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 0),
                               ('RIGHTPADDING', (0, 0), (-1, -1), 0), ('TOPPADDING', (0, 0), (-1, -1), 0),
                               ('TOPPADDING', (1, 0), (1, -1), 0.6), ('BOTTOMPADDING', (0, 0), (-1, -1), 4.5),
                               ('BOTTOMPADDING', (0, -1), (-1, -1), 0)]))
    code = Table([[qr(qr_w - 8)], [Paragraph('Zu Schritt 2: mit dem <b>Tablet</b> scannen statt tippen', cap)]],
                 colWidths=[qr_w])
    code.setStyle(TableStyle([('ALIGN', (0, 0), (-1, -1), 'CENTER'), ('BACKGROUND', (0, 0), (0, 0), colors.white),
                              ('LEFTPADDING', (0, 0), (-1, -1), 4), ('RIGHTPADDING', (0, 0), (-1, -1), 4),
                              ('TOPPADDING', (0, 0), (0, 0), 4), ('BOTTOMPADDING', (0, 0), (0, 0), 4),
                              ('TOPPADDING', (0, 1), (0, 1), 3), ('BOTTOMPADDING', (0, 1), (0, 1), 0)]))
    t = Table([[steps, code]], colWidths=[steps_w + pad + 6, qr_w + pad])
    t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), LIGHT), ('ROUNDEDCORNERS', [6, 6, 6, 6]),
                           ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('TOPPADDING', (0, 0), (-1, -1), pad),
                           ('BOTTOMPADDING', (0, 0), (-1, -1), pad), ('LEFTPADDING', (0, 0), (0, 0), pad),
                           ('RIGHTPADDING', (0, 0), (0, 0), 6), ('LEFTPADDING', (1, 0), (1, 0), 0),
                           ('RIGHTPADDING', (1, 0), (1, 0), pad)]))
    return t


def table(rows, key_w):
    t = Table([[Paragraph(a, key), Paragraph(b, body)] for a, b in rows], colWidths=[key_w, W - key_w])
    t.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LINEBELOW', (0, 0), (-1, -2), 0.5, LINE),
                           ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 4),
                           ('TOPPADDING', (0, 0), (-1, -1), 2), ('BOTTOMPADDING', (0, 0), (-1, -1), 2.6)]))
    return t


def story():
    return [
        Head('So startest du'),
        Spacer(1, 2),
        start_box(),

        Spacer(1, 5),
        Head('Das Handy aufstellen'),
        Paragraph('Auf ein Stativ, etwa <b>1–2 Meter</b> vom Spieler. Hochkant oder quer, beides geht.', bul, bulletText='•'),
        Paragraph('Handy <b>nicht sperren</b> und die Seite offen lassen, sonst stoppt die Kamera.', bul, bulletText='•'),
        Paragraph('Ans Ladegerät oder eine Powerbank hängen. Am Ende am Handy <b>„Beenden“</b> tippen.', bul, bulletText='•'),

        Spacer(1, 4),
        Head('Am Tablet: das Wichtigste'),
        Paragraph('Kommt ein Spieler nah ins Bild, entsteht von selbst eine Szene. Sie läuft gleich in Zeitlupe.', note),
        table([
            ('Ins Bild tippen', 'Abspielen / Pause'),
            ('Regler unter dem Bild', 'Mit dem Finger vor- und zurückschieben'),
            ('0,1× bis 2×', 'Tempo: 0,25× ist vierfache Zeitlupe'),
            ('Schleife: von / bis', 'Ausschnitt wiederholen, ' + SYM('✕') + ' hebt sie wieder auf'),
            ('Szene lange drücken', 'Zweite Szene daneben öffnen (Vergleich)'),
            ('Behalten (Stern ' + SYM('★') + ')', 'Szene wird nie von selbst gelöscht'),
            ('Speichern (Pfeil ' + SYM('↓') + ')', 'In „Fotos“ sichern oder weiterschicken'),
            ('Szene markieren', 'Die letzten 8 Sekunden von Hand speichern'),
            ('Pause / Weiter (oben)', 'Aufnahme anhalten, z. B. in der Trinkpause'),
        ], 47 * mm),

        Spacer(1, 5),
        Head('Wenn etwas nicht geht'),
        table([
            ('Tablet wartet auf das Handy', 'Selbes WLAN? Am Handy die Seite neu laden und wieder „Kamera starten“ tippen.'),
            ('Bild bleibt stehen', 'Handy gesperrt? Die Seite wieder nach vorn holen.'),
            ('Bild liegt auf der Seite', 'Unter dem Bild „Drehen“ tippen, bis es stimmt.'),
            ('Zu viele / zu wenige Szenen', 'Zahnrad oben rechts: Mindestgröße erhöhen / senken.'),
        ], 47 * mm),
    ]


def card(c, ox=0, oy=0):
    c.saveState()
    c.translate(ox, oy)
    top = CH - M
    ih = 12.5 * mm
    c.drawImage(ICON, M, top - ih, ih, ih, mask='auto')
    tx = M + ih + 3.5 * mm
    c.setFillColor(DARK)
    c.setFont('Bold', 19)
    c.drawString(tx, top - 6.6 * mm, 'Trainings-Kamera')
    c.setFillColor(GREY)
    c.setFont('Reg', 9.2)
    c.drawString(tx, top - 11.4 * mm, 'Kurzanleitung: Das Handy filmt, das Tablet zeigt die Szenen.')

    f = Frame(M, M + FOOT_H, W, CH - 2 * M - HEAD_H - FOOT_H, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    need = sum(x.wrap(W, 9999)[1] + x.getSpaceAfter() for x in story())
    rest = story()
    f.addFromList(rest, c)
    if rest:
        raise SystemExit('Passt nicht auf die Karte: %.1f mm gebraucht, %.1f mm Platz.' % (need / mm, f._aH / mm))
    free = (f._y - (M + FOOT_H)) / mm

    c.setStrokeColor(LINE)
    c.setLineWidth(0.5)
    c.line(M, M + 4.2 * mm, CW - M, M + 4.2 * mm)
    c.setFillColor(GREY)
    c.setFont('Reg', 8)
    c.drawString(M, M, 'Alle Knöpfe erklärt das  ?  oben rechts am Tablet.')
    c.drawRightString(CW - M, M, ADDR)
    c.restoreState()
    return free


out = sys.argv[1] if len(sys.argv) > 1 else ROOT
p1 = os.path.join(out, 'Trainerkarte-A5.pdf')
c = canvas.Canvas(p1, pagesize=A5)
c.setTitle('Trainings-Kamera – Trainerkarte')
free = card(c)
c.save()

p2 = os.path.join(out, 'Trainerkarte-A5-zwei-auf-A4.pdf')
PW, PH = landscape(A4)
c = canvas.Canvas(p2, pagesize=(PW, PH))
c.setTitle('Trainings-Kamera – Trainerkarte (2 × A5)')
half = PW / 2
card(c, (half - CW) / 2, 0)
card(c, half + (half - CW) / 2, 0)
c.setStrokeColor(GREY)
c.setLineWidth(0.5)
c.setDash(3, 3)
c.line(half, 0, half, PH)
c.setDash()
c.setFillColor(GREY)
c.setFont('Reg', 10)
c.saveState()
c.translate(half + 3.4, PH - 16 * mm)
c.rotate(-90)
c.drawString(0, 0, '✂')
c.restoreState()
c.save()
print('ok – frei unten: %.1f mm' % free)
