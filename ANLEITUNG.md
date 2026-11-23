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
- **Laptop statt Tablet:** Die Anzeige läuft genauso auf einem Windows-Laptop oder Mac. Dort dieselbe Adresse in **Chrome oder Edge** öffnen, „Handy als Kamera“ klicken und den QR-Code mit dem Handy scannen. Es braucht kein Kabel und keine Installation. (Auf Windows noch nicht ausprobiert.)
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

- Fest aufstellen (Stativ), etwa 1–2 Meter vom Spieler entfernt.
- **Hochkant oder quer:** So wie das Handy steht, wird gefilmt. Hochkant passt für die Schlagbewegung aus der Nähe, quer für den Anlauf. Das Handy kann auch im laufenden Betrieb gedreht werden.
- Die App stellt das Bild von selbst richtig herum. Liegt es am Tablet trotzdem auf der Seite, dort unter dem Bild **„Drehen“** tippen, bis es stimmt (siehe „Drehen“ weiter unten). Das kann passieren, wenn am iPhone die Ausrichtungssperre eingeschaltet ist.
- Die Seite muss **offen und im Vordergrund** bleiben. Wird das Handy gesperrt oder die App gewechselt, stoppt die Kamera. Der Bildschirm bleibt von selbst an.
- **Ans Ladegerät oder eine Powerbank** hängen, Filmen und Senden brauchen viel Strom.
- **„🌙 Abdunkeln“** macht den Bildschirm fast schwarz und spart Akku. Die Kamera läuft weiter.
- Die **Linse** (z. B. Weitwinkel) lässt sich am Handy unten links wählen oder am Tablet unter Einstellungen (Zahnrad) → „Kamera am Handy“.
- **„Beenden“** am Handy schaltet die Kamera aus und beendet die Übertragung. Die Seite einfach zu schließen geht genauso. Zum Weitermachen wieder „Kamera starten“ tippen.

### Wenn die Verbindung abbricht

Das Tablet zeigt wieder den QR-Code und wartet. Sobald das Handy die Seite wieder offen hat, verbinden sich beide von selbst (gemessen: etwa 1 Sekunde). Der Code bleibt gleich, neu scannen ist nicht nötig. „Neu verbinden“ stößt den Aufbau von Hand an.

---

## Weg 2: Handy per USB-Kabel am PC (Windows)

1. Einmalig: eine Webcam-App installieren, die das iPhone über das Kabel zur Webcam macht, **Camo** (reincubate.com/camo) oder **Iriun Webcam** (iriun.com), jeweils am iPhone und am PC. Dazu **iTunes** oder die App **„Apple-Geräte“** aus dem Microsoft Store, sonst erkennt Windows das iPhone nicht.
2. iPhone anstecken, die Webcam-App auf iPhone und PC öffnen.
3. **`Start-Windows.bat`** doppelklicken. Das schwarze Fenster offen lassen.
4. In der App **„🎥 Kamera an diesem Gerät“** wählen und den Kamera-Zugriff erlauben.
   Falsche Kamera? Einstellungen (Zahnrad) → Kamera → „Camo“ bzw. „Iriun“ wählen.

Beim allerersten Start nach dem Öffnen des Browsers kann „Kamera startet …“ einige Sekunden stehen. Das ist normal.

---

## Erkennung einstellen (Volleyball in der Halle)

- **Grüner Rahmen**: Diese Person löst eine Szene aus.
- **Grauer Rahmen**: Diese Person ist zu weit weg (oder außerhalb des Bereichs) und wird ignoriert. An den Rahmen steht kein Text, damit das kleine Live-Bild übersichtlich bleibt.
- Eine Szene löst nur aus, wer die **Mindestgröße** erreicht (Standard: 40 %). Der **gelbe Balken** links im Live-Bild zeigt, wie hoch ein Rahmen dafür sein muss. Der Wert gilt hochkant und quer gleich.
- Ändern: Einstellungen (Zahnrad) → „Mindestgröße der Person“. Direkt darunter steht, wie groß die Personen gerade im Bild sind.
- **Beispiel:** Das Handy steht 1–2 Meter neben dem Netz. Der Angreifer läuft in 2–3 Metern vorbei und soll auslösen, die Aufspielerin steht 5–6 Meter weiter hinten und soll nicht auslösen. Probe vor dem Training: beide an ihren Platz stellen. Ist der Rahmen der Aufspielerin grün, die Mindestgröße erhöhen, bis er grau wird. Ist der Rahmen des Angreifers grau, die Mindestgröße senken.
- **„Bereich“**: mit dem Finger oder der Maus einen Rahmen um den Spielbereich ziehen. Dann zählt nur, wer darin steht. **„Bereich löschen“** entfernt den Rahmen.
- Für andere Sportarten: Einstellungen (Zahnrad oben rechts) → „+ Neues Profil“. Umschalten lässt sich dort unter „Profil“; auf breiten Bildschirmen auch oben in der Kopfzeile.

## Bedienung

**Mit dem Finger (Tablet)**

| Geste | Wirkung |
|---|---|
| Ins Bild tippen | Abspielen / Pause |
| Regler unter dem Bild ziehen | Die Szene von Hand vor- und zurückschieben, so oft man will |
| Über das Bild wischen | Fein vor- und zurückspulen (ganze Bildbreite = 3 Sekunden) |
| Knöpfe links und rechts von ▶ | Ein Bild zurück / vor |
| 0,1× bis 2× | Tempo (0,25× = vierfache Zeitlupe) |
| Doppelt tippen, zwei Finger spreizen | Hineinzoomen (Ball, Hand, Fuß). „Zoom … ✕“ oben links im Bild stellt zurück |
| Schleife: von / bis / ✕ | Nur einen Ausschnitt wiederholen: an der Anfangsstelle „von“ tippen, an der Endstelle „bis“. Das ✕ hebt die Schleife auf |
| Szene lange drücken | Im zweiten Player öffnen (Vergleich) |
| Drehen (runder Pfeil) | Die Szene um eine Vierteldrehung drehen, wenn sie auf der Seite liegt |
| Behalten (Stern) | Szene wird nie von selbst gelöscht |
| Speichern (Pfeil nach unten) | Szene teilen oder in „Fotos“ sichern |

Die Leiste unter der Szene passt sich der Breite an: Auf schmalen Bildschirmen steht sie in zwei Zeilen und zeigt bei „Drehen“, „Behalten“ und „Speichern“ nur das Zeichen. Alle Zeichen erklärt das **?** oben rechts.

**Mit Maus und Tastatur (PC)**

| Taste / Maus | Wirkung |
|---|---|
| Leertaste / Klick ins Bild | Abspielen / Pause |
| ← → / Mausrad | Ein Bild zurück / vor |
| Shift + ← → | Eine Sekunde zurück / vor |
| Maus gedrückt ziehen | Vor- und zurückspulen (im Bild oder am Regler darunter) |
| 1 – 5 | Tempo 0,1× · 0,25× · 0,5× · 1× · 2× |
| A / B / L | Schleife: von / bis / aufheben |
| Doppelklick, Strg + Mausrad | Hineinzoomen (Z = zurück) |
| ↑ ↓ | Vorherige / nächste Szene |
| M | Szene von Hand speichern (die letzten 8 s) |
| P | Aufnahme anhalten / weiter |
| R | Szene drehen |
| S / E / Entf | Behalten / speichern / löschen |
| D | Live oder verzögertes Bild |
| Shift + Klick auf Szene | Im zweiten Player öffnen |

**Ansichten oben**

- „Live | Szene“: links das Kamerabild, rechts die Szene.
- „Szene | Szene“: zwei Szenen nebeneinander. Mit **Synchron** (zwei Pfeile) laufen beide gemeinsam.
- „Nur Szene“: die Szene groß.
- **„Verzögert“** unter dem Live-Bild: Der Spieler sieht sich 5 Sekunden später selbst.
- Das Live-Bild ist klein gehalten, die Szene bekommt den Platz. Nur beim Einzeichnen des Bereichs wird das Live-Bild kurz groß.

**Drehen**

- **„Drehen“ unter dem Live-Bild** dreht das Live-Bild um eine Vierteldrehung weiter. Neue Szenen kommen dann auch so.
- **„Drehen“ unter der Szene** dreht die Szene, die gerade läuft. Neue Szenen kommen danach genauso, und auch das gesicherte Video ist gedreht.
- Einfach so oft tippen, bis das Bild richtig steht. Das Tablet merkt sich die Einstellung, getrennt für „Handy als Kamera“ und „Kamera an diesem Gerät“.
- Wird das Tablet oder das Handy später anders gehalten und ein Bild liegt wieder falsch: noch einmal „Drehen“ tippen.

**Pause**

- **„Pause“** oben hält die Aufnahme an, zum Beispiel in der Trinkpause: Solange entstehen keine Szenen. Oben steht dann „PAUSE“, im Live-Bild ebenfalls.
- **„Weiter“** (derselbe Knopf, jetzt grün) nimmt wieder auf.
- Das Handy filmt in der Pause weiter und bleibt verbunden. Wer die Kamera ganz ausschalten will, tippt am Handy „Beenden“.

Die Aufnahme läuft in jeder Ansicht weiter.

## Speicher

- Szenen bleiben auf dem Tablet bzw. PC gespeichert, auch nach einem Neustart.
- Behalten werden die letzten 150 Szenen, ältere werden automatisch gelöscht.
- Szenen mit Stern (**„Behalten“**) werden nie automatisch gelöscht.
- Am iPad die Seite über „Teilen → Zum Home-Bildschirm“ ablegen. Safari löscht sonst gespeicherte Szenen von Seiten, die eine Woche nicht benutzt wurden.

## Wenn etwas nicht geht

| Problem | Lösung |
|---|---|
| Tablet zeigt „Warte auf das Handy …“ | Sind beide im selben WLAN? Am Handy die Seite neu laden und „Kamera starten“ tippen. |
| „Die Vermittlung ist nicht erreichbar“ | Hat das Gerät Internet? Über die Online-Adresse ist es zum Verbinden kurz nötig. |
| „Zu viele Verbindungsversuche“ | Eine Minute warten, dann „Neu verbinden“ tippen. |
| „Handy und Tablet finden sich nicht“ | Manche Gäste-WLANs lassen Geräte nicht miteinander reden. Dann das Tablet mit dem Hotspot des Handys verbinden. |
| Am Handy steht „WLAN zu langsam!“ | Näher zusammenrücken oder Einstellungen (Zahnrad) → Qualität auf 4 Mbit/s senken. |
| Bild liegt auf der Seite | Unter dem Bild „Drehen“ tippen, bis es stimmt. Den Knopf gibt es unter dem Live-Bild und unter der Szene. |
| Bild bleibt stehen | Ist das Handy gesperrt oder die Seite im Hintergrund? Seite wieder nach vorn holen. |
| Zu viele Szenen | Mindestgröße erhöhen oder einen Bereich zeichnen. |
| Szenen fehlen | Mindestgröße senken. |
| Ohne Kamera ausprobieren | Am Startbildschirm „Videodatei verwenden“ und ein Trainingsvideo wählen. |
