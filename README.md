# Aktien-Übersicht

Übersicht meiner Aktien mit antizyklischer ±10 %-Regel (Schwelle einstellbar). Keine Anlageberatung.

- `index.html` – die App
- `stocks.json` – Aktienliste mit Yahoo-Tickern und Startkursen (24.11.2026)
- `prices.json` – aktuelle Kurse in EUR, von der GitHub Action alle 15 Min. (Mo–Fr) aktualisiert
- `.github/workflows/prices.yml` – die Action, manuell startbar unter Actions → „Kurse aktualisieren“

Neue Aktie mit automatischem Kurs: in `stocks.json` eintragen (Yahoo-Ticker, z. B. `SAP.DE`, `7203.T`, `AAPL`).
