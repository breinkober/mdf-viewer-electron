const state = {
  columns: [],
  rows: [],
  selectedTable: null
};

const mdfPath = document.getElementById('mdfPath');
const ldfPath = document.getElementById('ldfPath');
const statusBox = document.getElementById('status');
const logBox = document.getElementById('log');
const tableList = document.getElementById('tableList');
const tableSearch = document.getElementById('tableSearch');
const queryInput = document.getElementById('queryInput');
const dataTableHead = document.querySelector('#dataTable thead');
const dataTableBody = document.querySelector('#dataTable tbody');

function setStatus(text) {
  statusBox.textContent = text;
}

function addLog(text) {
  const time = new Date().toLocaleTimeString('de-DE');
  logBox.textContent = `[${time}] ${text}\n` + logBox.textContent;
}

function renderTable(columns, rows) {
  state.columns = columns;
  state.rows = rows;

  if (!columns.length) {
    dataTableHead.innerHTML = '';
    dataTableBody.innerHTML = '<tr><td>Keine Daten vorhanden</td></tr>';
    return;
  }

  dataTableHead.innerHTML = `<tr>${columns.map(column => `<th>${escapeHtml(column)}</th>`).join('')}</tr>`;
  dataTableBody.innerHTML = rows.map(row => {
    return `<tr>${columns.map(column => `<td>${escapeHtml(row[column] ?? '')}</td>`).join('')}</tr>`;
  }).join('');
}

let allTables = [];

function filterTableList() {
  const q = tableSearch.value.toLowerCase();
  const filtered = q ? allTables.filter(t => t.name.toLowerCase().includes(q)) : allTables;
  renderTableItems(filtered);
}

function renderTableList(tables) {
  allTables = tables;
  tableSearch.value = '';
  renderTableItems(tables);
}

function renderTableItems(tables) {
  tableList.innerHTML = '';
  for (const { name, rowCount } of tables) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.className = 'table-btn';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'table-btn-name';
    nameSpan.textContent = name;

    const badge = document.createElement('span');
    if (rowCount === 0) {
      badge.className = 'table-badge table-badge--empty';
      badge.textContent = 'leer';
    } else {
      badge.className = 'table-badge table-badge--rows';
      badge.textContent = rowCount.toLocaleString('de-DE');
    }

    button.appendChild(nameSpan);
    button.appendChild(badge);

    button.addEventListener('click', async () => {
      try {
        state.selectedTable = name;
        setStatus(`Lade Vorschau für ${name} …`);
        addLog(`Vorschau wird geladen: ${name}`);
        const result = await window.mdfApi.previewTable(name);
        renderTable(result.columns, result.rows);
        queryInput.value = `SELECT TOP 200 * FROM [${name.replace('.', '].[')}]`;
        setStatus(`Vorschau geladen: ${name}`);
      } catch (error) {
        handleError(error);
      }
    });
    item.appendChild(button);
    tableList.appendChild(item);
  }
}

function handleError(error) {
  const message = error?.message || String(error);
  setStatus(message);
  addLog(`Fehler: ${message}`);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function loadTables() {
  const btn = document.getElementById('loadTablesBtn');
  btn.disabled = true;
  btn.classList.add('loading');
  try {
    setStatus('Lade Tabellen …');
    const tables = await window.mdfApi.listTables();
    renderTableList(tables);
    setStatus(`${tables.length} Tabellen geladen`);
    addLog(`${tables.length} Tabellen geladen`);
  } catch (error) {
    handleError(error);
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
  }
}

document.getElementById('chooseMdf').addEventListener('click', async () => {
  try {
    const result = await window.mdfApi.selectFile('mdf');
    if (result.canceled) return;
    await window.mdfApi.setPath({ kind: 'mdf', path: result.path });
    mdfPath.value = result.path;
    addLog(`MDF ausgewählt: ${result.path}`);
    setStatus('MDF-Datei ausgewählt');
  } catch (error) {
    handleError(error);
  }
});

document.getElementById('chooseLdf').addEventListener('click', async () => {
  try {
    const result = await window.mdfApi.selectFile('ldf');
    if (result.canceled) return;
    await window.mdfApi.setPath({ kind: 'ldf', path: result.path });
    ldfPath.value = result.path;
    addLog(`LDF ausgewählt: ${result.path}`);
    setStatus('LDF-Datei ausgewählt');
  } catch (error) {
    handleError(error);
  }
});

document.getElementById('attachBtn').addEventListener('click', async () => {
  const btn = document.getElementById('attachBtn');
  btn.disabled = true;
  btn.classList.add('loading');
  try {
    setStatus('Docker und SQL Server werden vorbereitet. Das kann beim ersten Start etwas dauern.');
    addLog('Starte SQL-Container und binde Datenbank ein');
    const result = await window.mdfApi.attachDatabase();
    setStatus(`Datenbank eingebunden: ${result.database}`);
    addLog(`Datenbank eingebunden: ${result.database}`);
    await loadTables();
  } catch (error) {
    handleError(error);
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
  }
});

document.getElementById('loadTablesBtn').addEventListener('click', loadTables);

document.getElementById('runQueryBtn').addEventListener('click', async () => {
  try {
    const query = queryInput.value.trim();
    if (!query) {
      setStatus('Bitte eine SQL-Abfrage eingeben.');
      return;
    }
    setStatus('Führe SQL-Abfrage aus …');
    addLog(`SQL-Abfrage: ${query}`);
    const result = await window.mdfApi.runQuery(query);
    renderTable(result.columns, result.rows);
    setStatus('SQL-Abfrage abgeschlossen');
  } catch (error) {
    handleError(error);
  }
});

document.getElementById('exportBtn').addEventListener('click', async () => {
  try {
    if (!state.columns.length) {
      setStatus('Es gibt aktuell keine Daten zum Exportieren.');
      return;
    }
    const exportName = state.selectedTable ? state.selectedTable.replaceAll('.', '_') : 'query_export';
    const result = await window.mdfApi.exportCsv({
      filename: exportName,
      columns: state.columns,
      rows: state.rows
    });
    if (!result.canceled) {
      setStatus(`CSV exportiert nach: ${result.path}`);
      addLog(`CSV exportiert: ${result.path}`);
    }
  } catch (error) {
    handleError(error);
  }
});

tableSearch.addEventListener('input', filterTableList);

(async function init() {
  const currentState = await window.mdfApi.getState();
  mdfPath.value = currentState.mdfPath || '';
  ldfPath.value = currentState.ldfPath || '';
  renderTable([], []);
})();
