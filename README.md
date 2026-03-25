# MDF Viewer for macOS

> Open and browse Microsoft SQL Server `.mdf` database files on macOS — no Windows, no SQL Server installation required.

This Electron app lets you read MDF files directly on your Mac by spinning up a SQL Server instance inside Docker and attaching the database there. Select your MDF file, load your tables, run SQL queries, and export results as CSV — all from a native macOS desktop app.

## Why this tool?

MDF files are the native database format of Microsoft SQL Server. They are typically only readable on Windows with SQL Server installed. This tool removes that constraint: as long as you have Docker Desktop on your Mac, you can open any MDF file within seconds.

**Common use cases:**
- Recovering data from a SQL Server backup on macOS
- Inspecting an MDF file without a Windows machine
- Migrating data from a legacy SQL Server database
- Quickly querying a database file shared by a colleague

## Prerequisites

- macOS (Intel or Apple Silicon)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- Node.js 20 or newer

## Getting Started

```bash
npm install
npm start
```

## Features

- Open any Microsoft SQL Server `.mdf` file on macOS
- Optionally attach a matching `.ldf` log file
- Auto-starts a SQL Server Docker container on demand
- Attaches the database using `FOR ATTACH` or `ATTACH_REBUILD_LOG`
- Lists all tables with row counts
- Table search and preview
- Run custom SQL queries against the database
- Export query results as CSV

## Build macOS App Package

```bash
npm install
npm run package-mac
```

Produces a standalone `.app` bundle for both Intel (`x64`) and Apple Silicon (`arm64`).

## How it works

1. You select an `.mdf` file (and optionally an `.ldf` file)
2. The app starts a `mcr.microsoft.com/mssql/server` Docker container
3. The MDF file is copied into the container
4. SQL Server attaches the database via T-SQL
5. You can now browse tables and run queries from the GUI

## Notes

- On first launch, Docker may need to pull the SQL Server image (~1.5 GB) — this can take a moment.
- The app uses container name `mdfviewer-sqlserver` and port `14333` by default.
- SQL SA credentials are hardcoded in this prototype — make them configurable before any production use.
- Not every MDF file can be attached without a matching LDF. In those cases, `ATTACH_REBUILD_LOG` may help, but is not guaranteed to work.
