# Trainings-Kamera – Anleitung

Das Handy filmt, das Tablet (oder ein PC) zeigt die Szenen. Sobald ein Spieler nah genug ins Bild kommt, schneidet die App die Szene automatisch aus: von 2 Sekunden vorher bis 1,5 Sekunden nach dem Verlassen des Bildes. Die Szene läuft sofort in Zeitlupe ab.

Das Video geht direkt vom Handy zum Tablet. Es wird nicht ins Internet übertragen.

Es gibt zwei Wege:

- **Handy + Tablet per WLAN** (iPhone + iPad, später Android + Android): kein Kabel, kein PC am Spielfeld.
- **Handy per USB-Kabel am PC**: wie in der ersten Version, das Handy dient als Webcam.

---

## Weg 1: Handy + Tablet per WLAN

### Was man braucht

- iPhone und iPad mit **iOS / iPadOS 16.4 oder neuer** (Safari). Android: Chrome.
- Beide Geräte im **selben WLAN**. Gibt es in der Halle keines: am Handy den **Hotspot** einschalten und das Tablet damit verbinden (noch nicht an echten Geräten ausprobiert).
- **Internet** zum Öffnen der App und zum Verbinden. Das Video selbst läuft danach direkt vom Handy zum Tablet.

### In der Halle: über die Online-Adresse

1. Am **Tablet** in Safari öffnen: **`superkamera.schrittfuerschrittfit.at`**
2. **„📱 Handy als Kamera“** tippen. Es erscheint ein QR-Code.
3. Den Code mit der Kamera-App des **Handys** scannen und den Link öffnen.
4. Am Handy **„Kamera starten“** tippen und den Kamera-Zugriff erlauben.

Nach ein paar Sekunden erscheint das Bild am Tablet und oben steht „AUFNAHME“.

- Beim ersten Öffnen lädt das Tablet einmal rund 10 MB (die Personen-Erkennung). Danach startet die App schnell.
- Am Tablet die Seite über **Teilen → „Zum Home-Bildschirm“** ablegen. Dann startet sie wie eine normale App.
- Zum gegenseitigen Finden tauschen Handy und Tablet ein paar kurze, verschlüsselte Nachrichten über den Dienst ntfy.sh aus. Bilder und Videos gehen dort nicht durch.

### Ohne Internet: Start über den Mac

1. Am Mac **`Start-Mac.command`** doppelklicken. Es öffnet sich ein Fenster (offen lassen) und eine Seite mit einem QR-Code.
   Fragt der Mac, ob „python3“ Verbindungen annehmen darf: **Erlauben**.
2. Am **Tablet** den QR-Code mit der Kamera-App scannen oder die angezeigte Adresse in Safari eintippen.
3. Safari warnt beim ersten Mal: „Diese Verbindung ist nicht privat“. Hier ist das in Ordnung, weil die Verbindung im eigenen WLAN bleibt: **Details einblenden → diese Website öffnen**.
4. Am Tablet **„📱 Handy als Kamera“** tippen. Es erscheint ein zweiter QR-Code.
5. Diesen Code mit der Kamera-App des **Handys** scannen und den Link öffnen. Auch hier einmal die Warnung bestätigen.
6. Am Handy **„Kamera starten“** tippen und den Kamera-Zugriff erlauben.

Der Mac wird nur zum Öffnen der Seiten gebraucht. Das Video läuft direkt vom Handy zum Tablet.

### Das Handy aufstellen

- **Quer** halten und fest aufstellen (Stativ), etwa 1–2 Meter vom Spieler entfernt.
- Die Seite muss **offen und im Vordergrund** bleiben. Wird das Handy gesperrt oder die App gewechselt, stoppt die Kamera. Der Bildschirm bleibt von selbst an.
- **Ans Ladegerät oder eine Powerbank** hängen, Filmen und Senden brauchen viel Strom.
- **„🌙 Abdunkeln“** macht den Bildschirm fast schwarz und spart Akku. Die Kamera läuft weiter.
- Die **Linse** (z. B. Weitwinkel) lässt sich am Handy unten links wählen oder am Tablet unter ⚙ → „Kamera am Handy“.

### Wenn die Verbindung abbricht

Das Tablet zeigt wieder den QR-Code und wartet. Sobald das Handy die Seite wieder offen hat, verbinden sich beide von selbst (gemessen: etwa 1 Sekunde). Der Code bleibt gleich, neu scannen ist nicht nötig. „↻ Neu verbinden“ stößt den Aufbau von Hand an.

---

## Weg 2: Handy per USB-Kabel am PC (Windows)

1. Einmalig: eine Webcam-App installieren, die das iPhone über das Kabel zur Webcam macht, **Camo** (reincubate.com/camo) oder **Iriun Webcam** (iriun.com), jeweils am iPhone und am PC. Dazu **iTunes** oder die App **„Apple-Geräte“** aus dem Microsoft Store, sonst erkennt Windows das iPhone nicht.
2. iPhone anstecken, die Webcam-App auf iPhone und PC öffnen.
3. **`Start-Windows.bat`** doppelklicken. Das schwarze Fenster offen lassen.
4. In der App **„🎥 Kamera an diesem Gerät“** wählen und den Kamera-Zugriff erlauben.
   Falsche Kamera? ⚙ → Kamera → „Camo“ bzw. „Iriun“ wählen.

Beim allerersten Start nach dem Öffnen des Browsers kann „Kamera startet …“ einige Sekunden stehen. Das ist normal.

---

## Erkennung einstellen (Volleyball in der Halle)

- **Grüner Rahmen „Spieler“**: Diese Person löst eine Szene aus.
- **Grauer Rahmen „zu weit weg“**: Leute im Hintergrund werden ignoriert.
- Der **gelbe Balken** links im Live-Bild zeigt die Mindestgröße. Ändern: ⚙ → „Mindestgröße der Person“ (Standard: 40 % der Bildhöhe).
- **„▭ Bereich“**: mit dem Finger oder der Maus einen Rahmen um den Spielbereich ziehen. Dann zählt nur, wer darin steht. Das **✕** daneben entfernt den Rahmen.
- Für andere Sportarten: ⚙ → „+ Neues Profil“. Oben lässt sich zwischen den Profilen umschalten.

## Bedienung

**Mit dem Finger (Tablet)**

| Geste | Wirkung |
|---|---|
| Ins Bild tippen | Abspielen / Pause |
| Über das Bild wischen | Vor- und zurückspulen |
| ⏮ ⏭ | Ein Bild zurück / vor |
| Doppelt tippen, zwei Finger spreizen | Hineinzoomen (Ball, Hand, Fuß) |
| Szene lange drücken | Im zweiten Player öffnen (Vergleich) |
| ⬇ | Szene teilen oder in „Fotos“ sichern |

**Mit Maus und Tastatur (PC)**

| Taste / Maus | Wirkung |
|---|---|
| Leertaste / Klick ins Bild | Abspielen / Pause |
| ← → / Mausrad | Ein Bild zurück / vor |
| Shift + ← → | Eine Sekunde zurück / vor |
| Maus gedrückt ziehen | Vor- und zurückspulen |
| 1 – 5 | Tempo 0,1× · 0,25× · 0,5× · 1× · 2× |
| A / B / L | Schleife: Anfang / Ende / löschen |
| Doppelklick, Strg + Mausrad | Hineinzoomen |
| ↑ ↓ | Vorherige / nächste Szene |
| M | Szene von Hand speichern (die letzten 8 s) |
| S / E / Entf | Stern / speichern / löschen |
| D | Live oder verzögertes Bild |
| Shift + Klick auf Szene | Im zweiten Player öffnen |

**Ansichten oben**

- „Live | Szene“: links das Kamerabild, rechts die Szene.
- „Szene | Szene“: zwei Szenen nebeneinander. Mit **⇄ Synchron** laufen beide gemeinsam.
- „Nur Szene“: die Szene groß.
- **„Verzögert“** unter dem Live-Bild: Der Spieler sieht sich 5 Sekunden später selbst.

Die Aufnahme läuft in jeder Ansicht weiter.

## Speicher

- Szenen bleiben auf dem Tablet bzw. PC gespeichert, auch nach einem Neustart.
- Behalten werden die letzten 150 Szenen, ältere werden automatisch gelöscht.
- Szenen mit **★** werden nie automatisch gelöscht.
- Am iPad die Seite über „Teilen → Zum Home-Bildschirm“ ablegen. Safari löscht sonst gespeicherte Szenen von Seiten, die eine Woche nicht benutzt wurden.

## Wenn etwas nicht geht

| Problem | Lösung |
|---|---|
| Tablet zeigt „Warte auf das Handy …“ | Sind beide im selben WLAN? Am Handy die Seite neu laden und „Kamera starten“ tippen. |
| „Die Vermittlung ist nicht erreichbar“ | Hat das Gerät Internet? Über die Online-Adresse ist es zum Verbinden kurz nötig. |
| „Zu viele Verbindungsversuche“ | Eine Minute warten, dann „↻ Neu verbinden“ tippen. |
| „Handy und Tablet finden sich nicht“ | Manche Gäste-WLANs lassen Geräte nicht miteinander reden. Dann das Tablet mit dem Hotspot des Handys verbinden. |
| Am Handy steht „WLAN zu langsam!“ | Näher zusammenrücken oder ⚙ → Qualität auf 4 Mbit/s senken. |
| Bild bleibt stehen | Ist das Handy gesperrt oder die Seite im Hintergrund? Seite wieder nach vorn holen. |
| Zu viele Szenen | Mindestgröße erhöhen oder einen Bereich zeichnen. |
| Szenen fehlen | Mindestgröße senken. |
| Ohne Kamera ausprobieren | Am Startbildschirm „Videodatei verwenden“ und ein Trainingsvideo wählen. |
