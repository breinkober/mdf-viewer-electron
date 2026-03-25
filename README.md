# MDF Viewer for macOS — Electron

This app opens Microsoft SQL Server MDF files on macOS by copying the file into a local SQL Server Docker container and attaching it there.

## Prerequisites

- macOS
- Docker Desktop installed and running
- Node.js 20 or newer

## Getting Started

```bash
npm install
npm start
```

## Features

- Select an MDF file
- Optionally select an LDF file
- Automatically start SQL Server in Docker
- Load MDF via `FOR ATTACH` or `ATTACH_REBUILD_LOG`
- Browse tables
- Preview table data
- Run custom SQL queries
- Export results as CSV

## Build macOS Package

```bash
npm install
npm run package-mac
```

## Notes

- On first launch, Docker may need to pull the SQL Server image — this can take a moment.
- The app uses the container name `mdfviewer-sqlserver` and port `14333` by default.
- The SQL SA credentials are hardcoded in this prototype and should be made configurable for production use.
- Not every MDF file can be attached directly without a matching environment or LDF file. In those cases, `ATTACH_REBUILD_LOG` may help, but not always.
