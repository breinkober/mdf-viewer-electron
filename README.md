# MDF Viewer für macOS auf Basis von Electron

Diese App öffnet Microsoft SQL Server MDF-Dateien auf dem Mac, indem sie die Datei in einen lokalen SQL-Server-Docker-Container kopiert und dort anhängt.

## Voraussetzungen

- macOS
- Docker Desktop installiert und gestartet
- Node.js 20 oder neuer

## Start

```bash
npm install
npm start
```

## Funktionen

- MDF-Datei auswählen
- optionale LDF-Datei auswählen
- SQL Server automatisch in Docker starten
- MDF per FOR ATTACH oder ATTACH_REBUILD_LOG laden
- Tabellen anzeigen
- Tabellenvorschau laden
- eigene SQL-Abfragen ausführen
- Ergebnis als CSV exportieren

## macOS Paket bauen

```bash
npm install
npm run package-mac
```

## Wichtige Hinweise

- Beim ersten Start muss das SQL-Server-Image eventuell erst von Docker geladen werden.
- Die App nutzt standardmäßig den Container `mdfviewer-sqlserver` und Port `14333`.
- Die SQL-SA-Zugangsdaten sind im Prototypen fest im Code hinterlegt und sollten für den produktiven Einsatz konfigurierbar gemacht werden.
- Nicht jede MDF-Datei lässt sich ohne passende Umgebung oder ohne LDF direkt anhängen. In diesen Fällen kann `ATTACH_REBUILD_LOG` helfen, aber nicht immer.
