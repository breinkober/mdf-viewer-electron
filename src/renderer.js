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
  const time = new Date().toLocaleTimeString('en-US');
  logBox.textContent = `[${time}] ${text}\n` + logBox.textContent;
}

function renderTable(columns, rows) {
  state.columns = columns;
  state.rows = rows;

  if (!columns.length) {
    dataTableHead.innerHTML = '';
    dataTableBody.innerHTML = '<tr><td>No data available</td></tr>';
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
      badge.textContent = 'empty';
    } else {
      badge.className = 'table-badge table-badge--rows';
      badge.textContent = rowCount.toLocaleString('en-US');
    }

    button.appendChild(nameSpan);
    button.appendChild(badge);

    button.addEventListener('click', async () => {
      try {
        state.selectedTable = name;
        setStatus(`Loading preview for ${name} …`);
        addLog(`Loading preview: ${name}`);
        const result = await window.mdfApi.previewTable(name);
        renderTable(result.columns, result.rows);
        queryInput.value = `SELECT TOP 200 * FROM [${name.replace('.', '].[')}]`;
        setStatus(`Preview loaded: ${name}`);
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
  addLog(`Error: ${message}`);
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
    setStatus('Loading tables …');
    const tables = await window.mdfApi.listTables();
    renderTableList(tables);
    setStatus(`${tables.length} tables loaded`);
    addLog(`${tables.length} tables loaded`);
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
    addLog(`MDF selected: ${result.path}`);
    setStatus('MDF file selected');
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
    addLog(`LDF selected: ${result.path}`);
    setStatus('LDF file selected');
  } catch (error) {
    handleError(error);
  }
});

document.getElementById('attachBtn').addEventListener('click', async () => {
  const btn = document.getElementById('attachBtn');
  btn.disabled = true;
  btn.classList.add('loading');
  try {
    setStatus('Preparing Docker and SQL Server. This may take a moment on first launch.');
    addLog('Starting SQL container and attaching database');
    const result = await window.mdfApi.attachDatabase();
    setStatus(`Database attached: ${result.database}`);
    addLog(`Database attached: ${result.database}`);
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
      setStatus('Please enter a SQL query.');
      return;
    }
    setStatus('Running SQL query …');
    addLog(`SQL query: ${query}`);
    const result = await window.mdfApi.runQuery(query);
    renderTable(result.columns, result.rows);
    setStatus('SQL query completed');
  } catch (error) {
    handleError(error);
  }
});

document.getElementById('exportBtn').addEventListener('click', async () => {
  try {
    if (!state.columns.length) {
      setStatus('No data available to export.');
      return;
    }
    const exportName = state.selectedTable ? state.selectedTable.replaceAll('.', '_') : 'query_export';
    const result = await window.mdfApi.exportCsv({
      filename: exportName,
      columns: state.columns,
      rows: state.rows
    });
    if (!result.canceled) {
      setStatus(`CSV exported to: ${result.path}`);
      addLog(`CSV exported: ${result.path}`);
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
