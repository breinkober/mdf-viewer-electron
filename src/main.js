const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');

let mainWindow;
const state = {
  mdfPath: '',
  ldfPath: '',
  attachedDatabase: '',
  containerName: 'mdfviewer-sqlserver',
  saPassword: 'YourStrong!Passw0rd'
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'MDF Viewer'
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 20 * 1024 * 1024, ...options }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || stdout || error.message));
        return;
      }
      resolve((stdout || '').trim());
    });
  });
}

function sanitizeDbName(name) {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

function escapeSqlPath(filePath) {
  return filePath.replace(/'/g, "''");
}

async function detectDocker() {
  try {
    await runCommand('docker', ['--version']);
    return true;
  } catch {
    return false;
  }
}

async function ensureSqlContainer() {
  const existsOutput = await runCommand('docker', ['ps', '-a', '--filter', `name=${state.containerName}`, '--format', '{{.Names}}']);
  const exists = existsOutput.split('\n').includes(state.containerName);

  let needsWait = false;

  if (!exists) {
    await runCommand('docker', [
      'run', '-d',
      '--name', state.containerName,
      '-e', 'ACCEPT_EULA=Y',
      '-e', `MSSQL_SA_PASSWORD=${state.saPassword}`,
      '-p', '14333:1433',
      'mcr.microsoft.com/mssql/server:2022-latest'
    ]);
    needsWait = true;
  } else {
    const runningOutput = await runCommand('docker', ['ps', '--filter', `name=${state.containerName}`, '--format', '{{.Names}}']);
    const running = runningOutput.split('\n').includes(state.containerName);
    if (!running) {
      await runCommand('docker', ['start', state.containerName]);
      needsWait = true;
    }
  }

  if (needsWait) {
    await new Promise(resolve => setTimeout(resolve, 12000));
  }
}

async function dockerCopy(localPath, remotePath) {
  await runCommand('docker', ['cp', localPath, `${state.containerName}:${remotePath}`]);
  // docker cp copies as root; SQL Server (mssql user) needs rw access
  await runCommand('docker', ['exec', '--user', 'root', state.containerName, 'chown', 'mssql:mssql', remotePath]);
  await runCommand('docker', ['exec', '--user', 'root', state.containerName, 'chmod', '660', remotePath]);
}

async function execSql(sql, { ignoreErrors = false } = {}) {
  const args = [
    'exec', state.containerName,
    '/opt/mssql-tools18/bin/sqlcmd',
    '-S', 'localhost',
    '-U', 'sa',
    '-P', state.saPassword,
    '-C',
    '-b',  // exit non-zero on SQL errors so failures are never silent
    '-W',
    '-s', '\t',
    '-Q', sql
  ];
  if (ignoreErrors) {
    return runCommand('docker', args).catch(() => '');
  }
  return runCommand('docker', args);
}

// Drop all user databases to avoid stale recovery warnings from orphaned databases.
// Each database is dropped individually so one failure doesn't block the rest.
async function dropAllUserDatabases() {
  const listSql = `SELECT name FROM sys.databases WHERE database_id > 4;`;
  const output = await execSql(listSql, { ignoreErrors: true });
  const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
  const sepIdx = lines.findIndex(l => /^\-+$/.test(l));
  const names = sepIdx >= 0
    ? lines.slice(sepIdx + 1).filter(l => !/rows affected/i.test(l) && l.length > 0)
    : [];

  for (const name of names) {
    const drop = `BEGIN TRY ALTER DATABASE [${name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; END TRY BEGIN CATCH END CATCH; DROP DATABASE IF EXISTS [${name}];`;
    await execSql(drop, { ignoreErrors: true });
  }
}

function quoteName(schemaAndTable) {
  const parts = schemaAndTable.split('.');
  if (parts.length === 2) {
    return `[${parts[0]}].[${parts[1]}]`;
  }
  return `[${schemaAndTable}]`;
}

ipcMain.handle('select-file', async (_event, extension) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: extension.toUpperCase(), extensions: [extension] }]
  });

  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true };
  }

  return { canceled: false, path: result.filePaths[0] };
});

ipcMain.handle('attach-database', async () => {
  if (!state.mdfPath) {
    throw new Error('Bitte zuerst eine MDF-Datei auswählen.');
  }

  const hasDocker = await detectDocker();
  if (!hasDocker) {
    throw new Error('Docker wurde nicht gefunden. Bitte Docker Desktop installieren und starten.');
  }

  await ensureSqlContainer();

  // Clean up all previously attached databases to prevent stale error messages
  await dropAllUserDatabases();

  const dbName = sanitizeDbName(path.basename(state.mdfPath, path.extname(state.mdfPath)));
  const remoteDir = '/var/opt/mssql/data';
  const remoteMdf = `${remoteDir}/${path.basename(state.mdfPath)}`;
  const remoteLdf = state.ldfPath ? `${remoteDir}/${path.basename(state.ldfPath)}` : '';

  // Remove any leftover files from previous sessions to avoid "file already exists" errors.
  // rm -f never fails even if the file doesn't exist.
  const filesToClean = [
    remoteMdf,
    remoteLdf || '',
    `${remoteDir}/${dbName}_log.ldf`,
    `${remoteDir}/${dbName}_log.LDF`,
  ].filter(Boolean);
  await runCommand('docker', ['exec', '--user', 'root', state.containerName, 'rm', '-f', ...filesToClean]);

  await dockerCopy(state.mdfPath, remoteMdf);
  if (state.ldfPath) {
    await dockerCopy(state.ldfPath, remoteLdf);
  }

  const escapedMdf = escapeSqlPath(remoteMdf);
  const escapedLdf = remoteLdf ? escapeSqlPath(remoteLdf) : '';

  let attachSql;
  if (remoteLdf) {
    attachSql = `CREATE DATABASE [${dbName}] ON (FILENAME='${escapedMdf}'), (FILENAME='${escapedLdf}') FOR ATTACH;`;
  } else {
    attachSql = `CREATE DATABASE [${dbName}] ON (FILENAME='${escapedMdf}') FOR ATTACH_REBUILD_LOG;`;
  }

  await execSql(attachSql);
  state.attachedDatabase = dbName;

  // SQL Server may need a moment to recover/upgrade older databases (e.g. from 2008 R2).
  // Poll until the database is ONLINE, up to 30 seconds.
  let online = false;
  for (let i = 0; i < 30; i++) {
    const out = await execSql(
      `SELECT state_desc FROM sys.databases WHERE name = '${dbName}';`,
      { ignoreErrors: true }
    );
    if (out.includes('ONLINE')) { online = true; break; }
    await new Promise(r => setTimeout(r, 1000));
  }

  if (!online) {
    throw new Error(`Datenbank '${dbName}' ist nach dem Einbinden nicht ONLINE. Sie könnte beschädigt sein oder einen inkompatiblen Zustand haben.`);
  }

  return { success: true, database: dbName };
});

ipcMain.handle('set-path', async (_event, payload) => {
  if (payload.kind === 'mdf') state.mdfPath = payload.path || '';
  if (payload.kind === 'ldf') state.ldfPath = payload.path || '';
  return { success: true };
});

ipcMain.handle('get-state', async () => ({ ...state }));

ipcMain.handle('list-tables', async () => {
  if (!state.attachedDatabase) {
    throw new Error('Es ist noch keine Datenbank eingebunden.');
  }

  // sys.partitions gives fast approximate row counts without scanning the tables
  const sql = `USE [${state.attachedDatabase}]; SELECT s.name + '.' + t.name AS full_name, ISNULL(SUM(p.rows), 0) AS row_count FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id LEFT JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0, 1) GROUP BY s.name, t.name ORDER BY s.name, t.name;`;
  const output = await execSql(sql);
  const lines = output.split('\n').map(line => line.trim()).filter(Boolean);

  const sepIdx = lines.findIndex(line => /^[\-\s]+$/.test(line));

  if (sepIdx === -1) {
    // No separator line means no result set at all — likely a SQL error despite -b not triggering.
    // Surface the raw output so the user knows what happened.
    const raw = lines.join(' | ');
    throw new Error(`Tabellenabfrage lieferte kein Ergebnis. SQL-Ausgabe: ${raw}`);
  }

  const tables = lines
    .slice(sepIdx + 1)
    .filter(line => !/rows affected/i.test(line) && line.length > 0)
    .map(line => {
      const parts = line.split('\t');
      return { name: parts[0].trim(), rowCount: parseInt(parts[1], 10) || 0 };
    });

  return tables;
});

ipcMain.handle('preview-table', async (_event, tableName) => {
  if (!state.attachedDatabase) {
    throw new Error('Es ist noch keine Datenbank eingebunden.');
  }

  const sql = `USE [${state.attachedDatabase}]; SELECT TOP 200 * FROM ${quoteName(tableName)};`;
  const output = await execSql(sql);
  return parseTabularOutput(output);
});

ipcMain.handle('run-query', async (_event, query) => {
  if (!state.attachedDatabase) {
    throw new Error('Es ist noch keine Datenbank eingebunden.');
  }

  const sql = `USE [${state.attachedDatabase}]; ${query}`;
  const output = await execSql(sql);
  return parseTabularOutput(output);
});

ipcMain.handle('export-csv', async (_event, payload) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: `${payload.filename || 'export'}.csv`,
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  });

  if (canceled || !filePath) {
    return { canceled: true };
  }

  const csv = toCsv(payload.columns, payload.rows);
  fs.writeFileSync(filePath, csv, 'utf8');
  return { canceled: false, path: filePath };
});


function parseTabularOutput(output) {
  const lines = output
    .split('\n')
    .map(line => line.replace(/\r/g, '').trimEnd());

  // Find the "-----" separator line that sqlcmd always emits between header and data.
  // Everything before it (including the header) is at known positions relative to it.
  const sepIdx = lines.findIndex(line => /^[\-\s]+$/.test(line));
  if (sepIdx < 1) {
    return { columns: [], rows: [] };
  }

  const header = lines[sepIdx - 1];
  const columns = header.split('\t').map(item => item.trim()).filter(Boolean);

  if (columns.length === 0) {
    return { columns: [], rows: [] };
  }

  const rows = lines
    .slice(sepIdx + 1)
    .filter(line => line.trim() && !/rows affected/i.test(line))
    .map(line => line.split('\t'))
    .map(parts => {
      const row = {};
      columns.forEach((column, index) => {
        row[column] = (parts[index] || '').trim();
      });
      return row;
    });

  return { columns, rows };
}

function toCsv(columns, rows) {
  const escape = value => {
    const stringValue = value == null ? '' : String(value);
    return `"${stringValue.replace(/"/g, '""')}"`;
  };

  const header = columns.map(escape).join(',');
  const body = rows.map(row => columns.map(column => escape(row[column])).join(',')).join(os.EOL);
  return [header, body].filter(Boolean).join(os.EOL);
}
