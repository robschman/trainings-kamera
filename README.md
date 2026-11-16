# Trainings-Kamera

Das Handy filmt, das Tablet zeigt die Szenen: Sobald ein Spieler ins Bild kommt, schneidet die App die Szene aus und spielt sie sofort in Zeitlupe ab.

**Öffnen:** https://robschman.github.io/trainings-kamera/ (leitet auf https://beautyroutine.app/trainings-kamera/ weiter)

- Am Tablet die Adresse öffnen und „Handy als Kamera“ wählen.
- Den QR-Code mit dem Handy scannen und „Kamera starten“ tippen.
- Beide Geräte müssen im selben WLAN sein (oder das Tablet im Hotspot des Handys).

Das Video läuft direkt vom Handy zum Tablet und wird nicht ins Internet übertragen. Zum gegenseitigen Finden tauschen die Geräte einige kurze, verschlüsselte Nachrichten über ntfy.sh aus. Szenen werden nur auf dem Tablet gespeichert.

Die ganze Anleitung steht in [ANLEITUNG.md](ANLEITUNG.md) und als PDF in [Anleitung-Trainings-Kamera.pdf](Anleitung-Trainings-Kamera.pdf).

## Technik

Reine Browser-App ohne Build-Schritt (HTML, CSS, JavaScript-Module). Aufnahme und Schnitt mit WebCodecs, Übertragung über einen WebRTC-Datenkanal, Personen-Erkennung mit MediaPipe im Browser. Mitgelieferte Bibliotheken und ihre Lizenzen: [vendor/LIZENZEN.md](vendor/LIZENZEN.md).

Lokal starten: `python3 tools/server.py` (am Mac auch per Doppelklick auf `Start-Mac.command`).
