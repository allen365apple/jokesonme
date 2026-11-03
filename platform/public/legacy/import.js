// ============================================================
// 看我笑話工作室 — 應援金流匯入（原 js/import.js，2026-10-03 搬進新平台）
// 2026-10-03 搬家時只改了：
//   1. 不再呼叫 checkAuth()/renderNav()（新平台的頁面已處理登入與導覽）
//   2. 按鈕文字「匯入到 Google Sheets」→「匯入到平台」
// 2026-11 財務審查後（_review/claude_review.md 1、2、3、8）改了匯入的產出，配對邏輯不變：
//   3. 一筆 Oen 金流一列（不再每專案加總成一列），每列帶來源鍵 oen:<金流編號>[#拆分列]:<income|fee|refund>，
//      伺服器用它擋重複匯入（同鍵略過）
//   4. 日期用該筆的撥款日；還沒撥款就用付款日；不再用匯入當天
//   5. 「撥款後退款」不再跳過：售票列照匯，另外產生一列負數「退款」；退款金額大於 0 的其他金流也一樣
//   6. 沒付款（尚未付款／已失效／沒有付款時間）的金流不匯入
//   7. 參與成員（誰分票房）由伺服器依專案推測，匯入前在明細表顯示、匯入後列在結果裡
// API.getShows / API.batchImportTransactions 由 /legacy/import-shim.js 改接新平台的 /api/finance/import。
// ============================================================



// ---- State ----

let cashflowFiles = [];     // [{ name, rows: [] }]
let orderFiles = [];         // [{ name, orderType: 'ticket'|'merchandise', rows: [] }]
let activityFiles = [];      // [{ name, eventName, rows: [] }]
let matchResults = null;
let showsList = [];

// ---- Init ----

(async function init() {
  const res = await API.getShows();
  if (res.success) showsList = res.data;
  setupUploadZones();
})();

// ---- Upload Zones ----

function setupUploadZones() {
  const cfZone = document.getElementById('cashflow-zone');
  const cfInput = document.getElementById('cashflow-input');
  const orderZone = document.getElementById('order-zone');
  const orderInput = document.getElementById('order-input');
  const actZone = document.getElementById('activity-zone');
  const actInput = document.getElementById('activity-input');

  cfZone.addEventListener('click', () => cfInput.click());
  cfZone.addEventListener('dragover', e => { e.preventDefault(); cfZone.style.borderColor = 'var(--brand-deep)'; });
  cfZone.addEventListener('dragleave', () => { cfZone.style.borderColor = ''; });
  cfZone.addEventListener('drop', e => {
    e.preventDefault();
    cfZone.style.borderColor = '';
    Array.from(e.dataTransfer.files).forEach(f => {
      if (f.name.endsWith('.xlsx')) handleCashflowFile(f);
    });
  });
  cfInput.addEventListener('change', () => {
    Array.from(cfInput.files).forEach(f => handleCashflowFile(f));
    cfInput.value = '';
  });

  orderZone.addEventListener('click', () => orderInput.click());
  orderZone.addEventListener('dragover', e => { e.preventDefault(); orderZone.style.borderColor = 'var(--brand-deep)'; });
  orderZone.addEventListener('dragleave', () => { orderZone.style.borderColor = ''; });
  orderZone.addEventListener('drop', e => {
    e.preventDefault();
    orderZone.style.borderColor = '';
    Array.from(e.dataTransfer.files).forEach(f => {
      if (f.name.endsWith('.csv')) handleOrderFile(f);
    });
  });
  orderInput.addEventListener('change', () => {
    Array.from(orderInput.files).forEach(f => handleOrderFile(f));
    orderInput.value = '';
  });

  actZone.addEventListener('click', () => actInput.click());
  actZone.addEventListener('dragover', e => { e.preventDefault(); actZone.style.borderColor = 'var(--brand-deep)'; });
  actZone.addEventListener('dragleave', () => { actZone.style.borderColor = ''; });
  actZone.addEventListener('drop', e => {
    e.preventDefault();
    actZone.style.borderColor = '';
    Array.from(e.dataTransfer.files).forEach(f => {
      if (f.name.endsWith('.xlsx')) handleActivityFile(f);
    });
  });
  actInput.addEventListener('change', () => {
    Array.from(actInput.files).forEach(f => handleActivityFile(f));
    actInput.value = '';
  });
}

// ---- File Parsing ----

function parseXlsx(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { raw: false });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function parseCsv(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'string' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { raw: false });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

// ---- Order Type / Event Name Detection ----

function detectOrderType(filename) {
  if (filename.includes('票券訂單')) return 'ticket';
  if (filename.includes('應援訂單')) return 'merchandise';
  return 'ticket';
}

function extractEventName(filename) {
  const base = filename.replace(/\.xlsx$/i, '');
  const match = base.match(/^\d+_(.+?)_活動報名狀態/);
  if (match) return match[1];
  return base.replace(/^\d+_/, '').replace(/_\d+筆$/, '');
}

// ---- Cashflow Deduplication ----

function getMergedCashflowRows() {
  const seen = new Set();
  const merged = [];
  cashflowFiles.forEach(cf => {
    cf.rows.forEach(r => {
      const id = r['金流編號'] || '';
      if (id && seen.has(id)) return;
      if (id) seen.add(id);
      merged.push(r);
    });
  });
  return merged;
}

// ---- File Handlers ----

async function handleCashflowFile(file) {
  if (cashflowFiles.some(f => f.name === file.name)) {
    alert('此檔案已上傳過：' + file.name);
    return;
  }
  try {
    const rows = await parseXlsx(file);
    cashflowFiles.push({ name: file.name, rows });
    document.getElementById('cashflow-zone').classList.add('has-file');
    renderUploadStatus();
    tryRunMatching();
  } catch (err) {
    alert('撥款明細解析失敗：' + err.message);
  }
}

async function handleOrderFile(file) {
  if (orderFiles.some(f => f.name === file.name)) {
    alert('此檔案已上傳過：' + file.name);
    return;
  }
  try {
    const rows = await parseCsv(file);
    const orderType = detectOrderType(file.name);
    orderFiles.push({ name: file.name, orderType, rows });
    document.getElementById('order-zone').classList.add('has-file');
    renderUploadStatus();
    tryRunMatching();
  } catch (err) {
    alert('訂單檔案解析失敗：' + err.message);
  }
}

async function handleActivityFile(file) {
  if (activityFiles.some(f => f.name === file.name)) {
    alert('此檔案已上傳過：' + file.name);
    return;
  }
  try {
    const rows = await parseXlsx(file);
    const eventName = extractEventName(file.name);
    activityFiles.push({ name: file.name, eventName, rows });
    document.getElementById('activity-zone').classList.add('has-file');
    renderUploadStatus();
    tryRunMatching();
  } catch (err) {
    alert('活動報名狀態解析失敗：' + err.message);
  }
}

function removeCashflowFile(idx) {
  cashflowFiles.splice(idx, 1);
  if (cashflowFiles.length === 0) document.getElementById('cashflow-zone').classList.remove('has-file');
  renderUploadStatus();
  tryRunMatching();
}

function removeOrderFile(idx) {
  orderFiles.splice(idx, 1);
  if (orderFiles.length === 0) document.getElementById('order-zone').classList.remove('has-file');
  renderUploadStatus();
  tryRunMatching();
}

function removeActivityFile(idx) {
  activityFiles.splice(idx, 1);
  if (activityFiles.length === 0) document.getElementById('activity-zone').classList.remove('has-file');
  renderUploadStatus();
  tryRunMatching();
}

// ---- Upload Status Display ----

function renderUploadStatus() {
  const container = document.getElementById('upload-status');
  let html = '';

  cashflowFiles.forEach((cf, i) => {
    const dates = cf.rows.map(r => r['建立日期'] || '').filter(Boolean).sort();
    const dateRange = dates.length ? `${dates[0].slice(0, 10)} ~ ${dates[dates.length - 1].slice(0, 10)}` : '';
    html += `<div class="upload-status-item">
      <div class="status-left">${escapeHtml(cf.name)} <span class="status-badge">(${cf.rows.length} 筆 ｜ ${dateRange})</span></div>
      <button class="btn-remove" onclick="removeCashflowFile(${i})">移除</button>
    </div>`;
  });

  if (cashflowFiles.length > 1) {
    const merged = getMergedCashflowRows();
    const total = merged.reduce((s, r) => s + (Number(r['收取金額']) || 0), 0);
    html += `<div class="upload-status-item">
      <div class="status-left">合併後（去重）</div>
      <span class="status-badge">${merged.length} 筆 ｜ $${total.toLocaleString()}</span>
    </div>`;
  } else if (cashflowFiles.length === 1) {
    const cf = cashflowFiles[0];
    const total = cf.rows.reduce((s, r) => s + (Number(r['收取金額']) || 0), 0);
    const dates = cf.rows.map(r => r['建立日期'] || '').filter(Boolean).sort();
    const dateRange = dates.length ? `${dates[0].slice(0, 10)} ~ ${dates[dates.length - 1].slice(0, 10)}` : '';
    html = `<div class="upload-status-item">
      <div class="status-left">${escapeHtml(cf.name)}</div>
      <span class="status-badge">${cf.rows.length} 筆 ｜ ${dateRange} ｜ $${total.toLocaleString()}</span>
    </div>`;
  }

  orderFiles.forEach((of, i) => {
    const label = of.orderType === 'ticket' ? '票券' : '周邊';
    html += `<div class="upload-status-item">
      <div class="status-left">[${label}] ${escapeHtml(of.name)} <span class="status-badge">(${of.rows.length} 筆)</span></div>
      <button class="btn-remove" onclick="removeOrderFile(${i})">移除</button>
    </div>`;
  });

  activityFiles.forEach((af, i) => {
    html += `<div class="upload-status-item">
      <div class="status-left">${escapeHtml(af.eventName)} <span class="status-badge">(${af.rows.length} 筆)</span></div>
      <button class="btn-remove" onclick="removeActivityFile(${i})">移除</button>
    </div>`;
  });

  container.innerHTML = html;
}

// ---- Price Table & Event Mapping from Activity Registration ----

function buildPriceTable(activityFiles) {
  const priceTable = new Map();     // ticketFullName → price
  const eventMapping = new Map();   // ticketFullName → [{ eventName, saleStart, saleEnd }]

  activityFiles.forEach(af => {
    const dates = af.rows.map(r => r['報名日期'] || '').filter(Boolean).sort();
    const saleStart = dates[0] || '';
    const saleEnd = dates[dates.length - 1] || '';

    af.rows.forEach(r => {
      const tName = (r['票券名稱'] || '').trim();
      const spec = (r['規格名稱'] || '').trim();
      const price = Number(r['票券金額']) || 0;
      const fullName = spec ? `${tName} ${spec}` : tName;
      if (!fullName) return;

      priceTable.set(fullName, price);

      if (!eventMapping.has(fullName)) eventMapping.set(fullName, []);
      const events = eventMapping.get(fullName);
      if (!events.some(e => e.eventName === af.eventName)) {
        events.push({ eventName: af.eventName, saleStart, saleEnd });
      }
    });
  });

  return { priceTable, eventMapping };
}

// ---- Multi-Ticket Splitting ----

function splitMultiTicket(rawField) {
  if (!rawField) return [{ ticketFullName: '未知', quantity: 1 }];
  const trimmed = rawField.trim();
  const xMatches = trimmed.match(/\s+x\s+\d+/gi);
  if (!xMatches || xMatches.length <= 1) {
    return [{ ticketFullName: extractItemName(trimmed), quantity: 1 }];
  }
  // Split by double-space boundaries before each ticket segment
  // Pattern: "AAA x N  BBB x M" — split on double spaces
  const segments = trimmed.split(/\s{2,}/);
  return segments.map(seg => {
    const match = seg.match(/^(.+?)\s+x\s+(\d+)$/i);
    if (match) {
      return { ticketFullName: match[1].trim(), quantity: Number(match[2]) };
    }
    return { ticketFullName: seg.trim().replace(/\s*x\s*\d+$/i, '').trim(), quantity: 1 };
  }).filter(s => s.ticketFullName);
}

// ---- Order Index ----

function extractItemName(rawField) {
  if (!rawField) return '未知';
  return rawField.trim().replace(/\s*x\s*\d+$/i, '').trim();
}

function extractGroupName(itemName) {
  return itemName.replace(/\s+B\d+\s+\S+$/, '').trim();
}

function buildOrderIndex(orderFiles, priceTable) {
  // Returns Map: orderId → single entry OR array of entries (for multi-ticket)
  const index = new Map();
  orderFiles.forEach(of => {
    of.rows.forEach(r => {
      const orderId = (r['訂單編號'] || '').trim();
      if (!orderId) return;

      if (of.orderType === 'ticket') {
        const rawField = r['票券名稱及數量'] || '';
        const tickets = splitMultiTicket(rawField);

        if (tickets.length > 1 && priceTable && priceTable.size > 0) {
          // Multi-ticket: store as array
          const entries = tickets.map(t => ({
            orderType: 'ticket',
            itemName: t.ticketFullName,
            groupName: extractGroupName(t.ticketFullName),
            ticketFullName: t.ticketFullName,
            quantity: t.quantity,
            unitPrice: priceTable.get(t.ticketFullName) || 0
          }));
          index.set(orderId, entries);
        } else {
          // Single ticket
          const itemName = extractItemName(rawField);
          const groupName = extractGroupName(itemName);
          index.set(orderId, { orderType: 'ticket', itemName, groupName, ticketFullName: itemName });
        }
      } else {
        const itemName = extractItemName(r['訂購商品名稱及數量']);
        const groupName = extractGroupName(itemName);
        index.set(orderId, { orderType: 'merchandise', itemName, groupName });
      }
    });
  });
  return index;
}

// ---- Matching Logic ----

function tryRunMatching() {
  if (cashflowFiles.length === 0 || orderFiles.length === 0) {
    matchResults = null;
    document.getElementById('mapping-section').style.display = 'none';
    document.getElementById('dashboard-section').style.display = 'none';
    return;
  }
  runMatching();
}

// ---- 每筆金流的日期／金額／來源鍵 ----

// Oen 的日期格式像「2026/11/02 15:36」；也接受 2026-11-02
function toIsoDate(value) {
  const m = String(value || '').match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null;
}
// 撥款日欄位名稱依報表版本不同（撥款日期／撥款日／撥款時間…），找第一個名字含「撥款」又有日期值的欄位
function payoutDateOf(r) {
  for (const k of Object.keys(r)) {
    if (/撥款/.test(k) && /(日|時間|date)/i.test(k)) {
      const d = toIsoDate(r[k]);
      if (d) return d;
    }
  }
  return null;
}
const paidDateOf = r => toIsoDate(r['付款時間']) || toIsoDate(r['付款日期']) || toIsoDate(r['付款日']);
// 收支日期：撥款日 > 付款日；都沒有 → null（匯入前擋下，絕不用今天）
const txDateOf = r => payoutDateOf(r) || paidDateOf(r);
const chargeNoOf = r => String(r['金流編號'] || '').trim();
const oenKeyOf = (r, part) => `oen:${chargeNoOf(r)}${r._lineNo ? `#${r._lineNo}` : ''}:${part}`;
const refundOf = r => Number(r['退款金額']) || 0;
// 沒付款的金流（尚未付款／已失效／取消，或沒有付款時間）不匯入
function isPaid(r) {
  const status = String(r['金流狀態'] || '');
  if (/尚未付款|已失效|取消|付款失敗/.test(status)) return false;
  return !!paidDateOf(r);
}

function runMatching() {
  const rows = getMergedCashflowRows();
  const membership = [];
  const refunds = [];
  const purchases = [];
  const unpaid = [];

  rows.forEach(r => {
    if (!isPaid(r)) {
      unpaid.push(r);
      return;
    }
    // 撥款後退款：售票列照匯（錢已撥），退款另外產生一列負數，所以這裡不再跳過
    if (refundOf(r) > 0 || r['金流狀態'] === '撥款後退款') refunds.push(r);
    if (/會費/.test(String(r['金流類型'] || ''))) {
      membership.push(r);
    } else if (r['金流類型'] === '單筆購買') {
      purchases.push(r);
    }
  });

  const { priceTable, eventMapping } = buildPriceTable(activityFiles);
  const orderIndex = buildOrderIndex(orderFiles, priceTable);
  const byName = {};
  const unmatched = [];

  purchases.forEach(cfRow => {
    const orderId = (cfRow['訂單編號'] || '').trim();
    const match = orderIndex.get(orderId);
    if (!match) {
      unmatched.push(cfRow);
      return;
    }

    if (Array.isArray(match)) {
      // Multi-ticket order: split amount proportionally
      const totalPrice = match.reduce((s, e) => s + e.unitPrice * e.quantity, 0);
      const cfAmount = Number(cfRow['收取金額']) || 0;
      const cfFee = Number(cfRow['手續費']) || 0;
      const cfNet = Number(cfRow['實際收取金額']) || 0;

      const cfRefund = refundOf(cfRow);

      match.forEach((entry, idx) => {
        const entryTotal = entry.unitPrice * entry.quantity;
        const ratio = totalPrice > 0 ? entryTotal / totalPrice : 1 / match.length;
        const splitRow = {
          ...cfRow,
          '收取金額': Math.round(cfAmount * ratio),
          '手續費': Math.round(cfFee * ratio),
          '實際收取金額': Math.round(cfNet * ratio),
          '退款金額': Math.round(cfRefund * ratio),
          _splitFrom: orderId,
          _lineNo: idx + 1,            // 拆分列號：來源鍵 oen:<金流編號>#<列號>
          _item: entry.ticketFullName,
        };
        const name = entry.groupName;
        if (!byName[name]) byName[name] = { orderType: entry.orderType, rows: [], ticketFullNames: new Set() };
        byName[name].rows.push(splitRow);
        byName[name].ticketFullNames.add(entry.ticketFullName);
      });
    } else {
      const name = match.groupName;
      if (!byName[name]) byName[name] = { orderType: match.orderType, rows: [], ticketFullNames: new Set() };
      byName[name].rows.push({ ...cfRow, _item: match.ticketFullName || match.itemName });
      if (match.ticketFullName) byName[name].ticketFullNames.add(match.ticketFullName);
    }
  });

  // Convert ticketFullNames sets to arrays for easier use
  Object.values(byName).forEach(v => { v.ticketFullNames = [...v.ticketFullNames]; });

  matchResults = { membership, byName, unmatched, refunds, unpaid, eventMapping };
  renderMappingSection();
  renderDashboard();
}

// ---- Event Attribution ----

function parseDate(str) {
  if (!str) return null;
  const m = str.match(/(\d{4})\/(\d{2})\/(\d{2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

function resolveEventAttribution(groupName, info, eventMapping, orderRows) {
  if (!eventMapping || eventMapping.size === 0) return null;

  // Collect all events that any ticketFullName in this group maps to
  const eventCandidates = new Map(); // eventName → { saleStart, saleEnd }
  info.ticketFullNames.forEach(fn => {
    const events = eventMapping.get(fn);
    if (events) {
      events.forEach(e => {
        if (!eventCandidates.has(e.eventName)) {
          eventCandidates.set(e.eventName, e);
        }
      });
    }
  });

  if (eventCandidates.size === 0) return null;
  if (eventCandidates.size === 1) return [...eventCandidates.keys()][0];

  // Ambiguous: try date-based resolution using the median order date
  const orderDates = orderRows
    .map(r => parseDate(r['建立日期'] || r['付款時間']))
    .filter(Boolean)
    .sort((a, b) => a - b);
  if (orderDates.length === 0) return null;
  const medianDate = orderDates[Math.floor(orderDates.length / 2)];

  const matching = [];
  eventCandidates.forEach((info, name) => {
    const start = parseDate(info.saleStart);
    const end = parseDate(info.saleEnd);
    if (start && end && medianDate >= start && medianDate <= end) {
      matching.push(name);
    }
  });

  if (matching.length === 1) return matching[0];
  return null; // unresolvable
}

// ---- Ticket/Merchandise → Project Mapping ----

function getNameProjectMap() {
  const map = {};
  if (!matchResults) return map;
  Object.keys(matchResults.byName).forEach(name => {
    const select = document.getElementById(`mapping-${CSS.escape(name)}`);
    map[name] = select ? select.value : '';
  });
  return map;
}

function renderMappingSection() {
  const section = document.getElementById('mapping-section');
  const list = document.getElementById('mapping-list');
  const names = Object.keys(matchResults.byName);
  if (names.length === 0) { section.style.display = 'none'; return; }

  const { eventMapping } = matchResults;

  section.style.display = '';
  list.innerHTML = names.map(name => {
    const info = matchResults.byName[name];
    const label = info.orderType === 'ticket' ? '票券' : '周邊';
    const count = info.rows.length;

    // Attempt auto-attribution
    const autoEvent = resolveEventAttribution(name, info, eventMapping, info.rows);

    // Check if ambiguous (has activity files but couldn't resolve)
    const hasActivityData = eventMapping && eventMapping.size > 0;
    const hasMultipleEvents = info.ticketFullNames.some(fn => {
      const events = eventMapping?.get(fn);
      return events && events.length > 1;
    });
    const isAmbiguous = hasActivityData && hasMultipleEvents && !autoEvent;

    let badge = '';
    if (autoEvent) badge = '<span class="status-badge" style="color:var(--success)">自動對應</span>';
    else if (isAmbiguous) badge = '<span class="status-badge" style="color:var(--warning)">需手動確認</span>';

    const options = showsList.map(s => {
      const selected = autoEvent === s.name ? ' selected' : '';
      return `<option value="${escapeHtml(s.name)}"${selected}>${escapeHtml(s.name)}</option>`;
    }).join('');

    // If auto-attributed to an event name not in showsList, add it as an option
    let extraOption = '';
    if (autoEvent && !showsList.some(s => s.name === autoEvent)) {
      extraOption = `<option value="${escapeHtml(autoEvent)}" selected>${escapeHtml(autoEvent)}</option>`;
    }

    return `<div class="mapping-row">
      <span>[${label}] ${escapeHtml(name)} <span class="status-badge">(${count} 筆)</span> ${badge}</span>
      <span class="mapping-arrow">→</span>
      <select id="mapping-${CSS.escape(name)}" onchange="renderDashboard()">
        <option value="">— 選擇專案 —</option>
        ${extraOption}
        ${options}
      </select>
    </div>`;
  }).join('');
}

// ---- Dashboard ----

// 專案參與成員（伺服器依專案設定／既有票房列／名稱推測；GET /api/finance/import 回傳）
function participantsHtml(projectName) {
  const s = showsList.find(x => x.name === projectName);
  if (!s || !s.participants) return '';
  const who = s.participants.length === MEMBERS.length ? '全員' : s.participants.join('、');
  const flag = s.needsReview ? ' <span style="color:var(--warning)">⚠ 專場尚未設定參與成員，請先到「收支」頁設定</span>' : '';
  return `${escapeHtml(who)} <span class="status-badge">（${escapeHtml(s.sourceLabel || '')}）</span>${flag}`;
}

function renderDashboard() {
  if (!matchResults) return;
  const nameProjectMap = getNameProjectMap();
  const { membership, byName, unmatched, refunds, unpaid } = matchResults;
  document.getElementById('dashboard-section').style.display = '';

  const allRows = getMergedCashflowRows().filter(isPaid);
  const totalRevenue = allRows.reduce((s, r) => s + (Number(r['收取金額']) || 0), 0);
  const totalFees = allRows.reduce((s, r) => s + (Number(r['手續費']) || 0), 0);
  const totalNet = allRows.reduce((s, r) => s + (Number(r['實際收取金額']) || 0), 0);
  const totalRefund = allRows.reduce((s, r) => s + refundOf(r), 0);

  document.getElementById('import-stats').innerHTML = `
    <div class="stat-card"><div class="stat-label">收取金額</div><div class="stat-value positive">$${totalRevenue.toLocaleString()}</div></div>
    <div class="stat-card"><div class="stat-label">平台手續費</div><div class="stat-value negative">-$${totalFees.toLocaleString()}</div></div>
    <div class="stat-card"><div class="stat-label">退款</div><div class="stat-value negative">-$${totalRefund.toLocaleString()}</div></div>
    <div class="stat-card"><div class="stat-label">實際收取</div><div class="stat-value positive">$${(totalNet - totalRefund).toLocaleString()}</div></div>
  `;

  let breakdownHtml = `<table class="import-breakdown-table">
    <thead><tr><th>來源</th><th>筆數</th><th>收取金額</th><th>手續費</th><th>實際收取</th><th>分攤成員</th></tr></thead><tbody>`;
  const groups = [];

  if (membership.length > 0) {
    const mAmt = membership.reduce((s, r) => s + (Number(r['收取金額']) || 0), 0);
    const mFee = membership.reduce((s, r) => s + (Number(r['手續費']) || 0), 0);
    const mNet = membership.reduce((s, r) => s + (Number(r['實際收取金額']) || 0), 0);
    const plan149 = membership.filter(r => Number(r['收取金額']) === 149);
    const plan1699 = membership.filter(r => Number(r['收取金額']) === 1699);
    let detail = [];
    if (plan149.length) detail.push(`149元×${plan149.length}`);
    if (plan1699.length) detail.push(`1,699元×${plan1699.length}`);
    breakdownHtml += `<tr>
      <td>付費會員（${detail.join('、')}）</td><td>${membership.length}</td>
      <td class="amount-positive">$${mAmt.toLocaleString()}</td><td class="amount-negative">-$${mFee.toLocaleString()}</td><td>$${mNet.toLocaleString()}</td>
      <td>${participantsHtml('看我笑話會員')}</td></tr>`;
    groups.push({ showName: '看我笑話會員', category: '付費會員', amount: mAmt, fee: mFee, notes: `應援匯入：${detail.join('、')}` });
  }

  const projectGroups = {};
  Object.entries(byName).forEach(([name, info]) => {
    const projectName = nameProjectMap[name] || name;
    if (!projectName) return;
    if (!projectGroups[projectName]) projectGroups[projectName] = { ticket: [], merchandise: [] };
    if (info.orderType === 'ticket') {
      projectGroups[projectName].ticket.push({ name, rows: info.rows });
    } else {
      projectGroups[projectName].merchandise.push({ name, rows: info.rows });
    }
  });

  Object.entries(projectGroups).forEach(([projectName, pg]) => {
    if (pg.ticket.length > 0) {
      const allTicketRows = pg.ticket.flatMap(t => t.rows);
      const eAmt = allTicketRows.reduce((s, r) => s + (Number(r['收取金額']) || 0), 0);
      const eFee = allTicketRows.reduce((s, r) => s + (Number(r['手續費']) || 0), 0);
      const eNet = allTicketRows.reduce((s, r) => s + (Number(r['實際收取金額']) || 0), 0);
      const typeStr = pg.ticket.map(t => `${t.name}×${t.rows.length}`).join('、');
      breakdownHtml += `<tr>
        <td>${escapeHtml(projectName)}（票券）</td><td>${allTicketRows.length}</td>
        <td class="amount-positive">$${eAmt.toLocaleString()}</td><td class="amount-negative">-$${eFee.toLocaleString()}</td><td>$${eNet.toLocaleString()}</td>
        <td>${participantsHtml(projectName)}</td></tr>`;
      groups.push({ showName: projectName, category: '演出票房', amount: eAmt, fee: eFee, notes: `應援匯入：${typeStr}` });
    }
    if (pg.merchandise.length > 0) {
      const allMerchRows = pg.merchandise.flatMap(m => m.rows);
      const mAmt = allMerchRows.reduce((s, r) => s + (Number(r['收取金額']) || 0), 0);
      const mFee = allMerchRows.reduce((s, r) => s + (Number(r['手續費']) || 0), 0);
      const mNet = allMerchRows.reduce((s, r) => s + (Number(r['實際收取金額']) || 0), 0);
      const typeStr = pg.merchandise.map(m => `${m.name}×${m.rows.length}`).join('、');
      breakdownHtml += `<tr>
        <td>${escapeHtml(projectName)}（周邊）</td><td>${allMerchRows.length}</td>
        <td class="amount-positive">$${mAmt.toLocaleString()}</td><td class="amount-negative">-$${mFee.toLocaleString()}</td><td>$${mNet.toLocaleString()}</td>
        <td>${participantsHtml(projectName)}</td></tr>`;
      groups.push({ showName: projectName, category: '周邊商品', amount: mAmt, fee: mFee, notes: `應援匯入：${typeStr}` });
    }
  });

  if (refunds.length > 0) {
    const rAmt = refunds.reduce((s, r) => s + refundOf(r), 0);
    breakdownHtml += `<tr><td>退款（匯入為負數列，沿用該專案的分攤成員）</td><td>${refunds.length}</td><td colspan="4" class="amount-negative">-$${rAmt.toLocaleString()}</td></tr>`;
  }
  if (unpaid.length > 0) {
    breakdownHtml += `<tr><td>未付款／已失效（不匯入）</td><td>${unpaid.length}</td><td colspan="4"></td></tr>`;
  }

  breakdownHtml += `<tr class="totals-row"><td>合計</td><td>${allRows.length}</td>
    <td class="amount-positive">$${totalRevenue.toLocaleString()}</td><td class="amount-negative">-$${totalFees.toLocaleString()}</td><td>$${(totalNet - totalRefund).toLocaleString()}</td><td></td></tr>`;
  breakdownHtml += '</tbody></table>';
  document.getElementById('breakdown-list').innerHTML = breakdownHtml;
  window._importGroups = groups;
  renderUnmatched(unmatched);
  updateImportButton();
}

// ---- Unmatched Items ----

function renderUnmatched(unmatched) {
  const section = document.getElementById('unmatched-section');
  const list = document.getElementById('unmatched-list');
  if (unmatched.length === 0) { section.style.display = 'none'; return; }

  section.style.display = '';
  const showOptions = showsList.map(s => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`).join('');
  list.innerHTML = unmatched.map((r, i) => {
    const item = r['品項數量'] || '';
    return `<div class="unmatched-row">
      <div class="unmatched-info">${escapeHtml(r['付款人'] || '')} ｜ ${r['付款時間'] || ''} ｜ $${Number(r['收取金額'] || 0).toLocaleString()} ｜ ${escapeHtml(item)}</div>
      <select id="unmatched-${i}" onchange="onUnmatchedAssign()"><option value="">— 選擇專案 —</option>${showOptions}</select>
    </div>`;
  }).join('');
}

function onUnmatchedAssign() { updateImportButton(); }

function getUnmatchedAssignments() {
  if (!matchResults) return [];
  return matchResults.unmatched.map((r, i) => {
    const select = document.getElementById(`unmatched-${i}`);
    return { row: r, showName: select ? select.value : '' };
  });
}

// ---- Import Button ----

function updateImportButton() {
  const actions = document.getElementById('import-actions');
  const btn = document.getElementById('btn-import');
  const hint = document.getElementById('import-hint');
  actions.style.display = '';
  if (!matchResults) { btn.disabled = true; return; }

  const nameProjectMap = getNameProjectMap();
  const unmappedNames = Object.keys(matchResults.byName).filter(name => !nameProjectMap[name]);

  const assignments = getUnmatchedAssignments();
  const unresolved = assignments.filter(a => !a.showName).length;

  if (unmappedNames.length > 0) {
    btn.disabled = true;
    hint.textContent = `還有 ${unmappedNames.length} 個票券／商品名稱需要對應專案`;
  } else if (unresolved > 0) {
    btn.disabled = true;
    hint.textContent = `還有 ${unresolved} 筆未配對項目需要指定專案`;
  } else {
    btn.disabled = false;
    hint.textContent = '';
  }
  btn.onclick = doImport;
}

// ---- Batch Import ----

// 一筆金流 → 收入列（＋手續費列、退款列），每列帶來源鍵與該筆的撥款日／付款日。
// 回傳 { rows, errors }；沒有金流編號或日期的筆數會列在 errors，整批不送。
function buildChargeTransactions(r, showName, category, item, suffix) {
  const rows = [];
  const errors = [];
  const chargeNo = chargeNoOf(r);
  const date = txDateOf(r);
  if (!chargeNo) errors.push(`${showName}：有一筆沒有金流編號（${item || ''}）`);
  if (!date) errors.push(`${showName}：金流 ${chargeNo || '?'} 沒有撥款日也沒有付款日`);
  if (errors.length) return { rows, errors };
  const amount = Number(r['收取金額']) || 0;
  const fee = Number(r['手續費']) || 0;
  const refund = refundOf(r);
  const tag = `${chargeNo}｜${item || '未知'}${suffix || ''}`;
  if (amount > 0) rows.push({ showName, category, notes: `應援匯入 ${tag}`, amount, date, oenKey: oenKeyOf(r, 'income'), recordedBy: '應援匯入' });
  if (fee > 0) rows.push({ showName, category: '平台手續', notes: `應援手續費 ${tag}`, amount: -fee, date, oenKey: oenKeyOf(r, 'fee'), recordedBy: '應援匯入' });
  if (refund > 0) rows.push({ showName, category: '退款', notes: `應援退款 ${tag}`, amount: -refund, date, oenKey: oenKeyOf(r, 'refund'), recordedBy: '應援匯入' });
  return { rows, errors };
}

function collectTransactions() {
  const nameProjectMap = getNameProjectMap();
  const { membership, byName } = matchResults;
  const transactions = [];
  const errors = [];
  const add = res => { transactions.push(...res.rows); errors.push(...res.errors); };

  membership.forEach(r => add(buildChargeTransactions(r, '看我笑話會員', '付費會員', `會費 ${Number(r['收取金額']) || 0} 元`)));

  Object.entries(byName).forEach(([name, info]) => {
    const projectName = nameProjectMap[name] || name;
    if (!projectName) return;
    const category = info.orderType === 'ticket' ? '演出票房' : '周邊商品';
    info.rows.forEach(r => add(buildChargeTransactions(r, projectName, category, r._item || name)));
  });

  getUnmatchedAssignments().forEach(a => {
    if (!a.showName) return;
    add(buildChargeTransactions(a.row, a.showName, '演出票房', a.row['品項數量'] || '未知', '（手動指定）'));
  });

  return { transactions, errors };
}

function renderImportSummary(data, sent) {
  const box = document.getElementById('import-summary');
  const body = document.getElementById('import-summary-body');
  if (!box || !body) return;
  const shows = data.shows || [];
  const flagged = shows.filter(s => s.needsReview);
  let html = `<p>送出 ${sent} 列：新增 <b>${data.inserted}</b> 列、略過 <b>${data.skipped}</b> 列（來源鍵已存在，重複匯入不會算兩次）。</p>`;
  if (shows.length) {
    html += '<table class="import-breakdown-table"><thead><tr><th>專案</th><th>分攤成員</th><th>依據</th></tr></thead><tbody>';
    shows.forEach(s => {
      const who = s.participants.length === MEMBERS.length ? '全員' : s.participants.join('、');
      html += `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(who)}</td><td>${escapeHtml(s.sourceLabel || s.source)}${s.needsReview ? ' <span style="color:var(--warning)">⚠ 需人工確認</span>' : ''}</td></tr>`;
    });
    html += '</tbody></table>';
  }
  if (flagged.length) {
    html += `<p style="color:var(--warning)">以下專場沒有參與成員設定，這次先以全員共同匯入：${flagged.map(s => escapeHtml(s.name)).join('、')}。請到「收支」頁選該專案 → 「設定參與成員」→ 勾「同時套用到現有收支」，稅務預留會跟著重算。</p>`;
  }
  body.innerHTML = html;
  box.style.display = '';
}

async function doImport() {
  const btn = document.getElementById('btn-import');
  btn.disabled = true;
  btn.textContent = '匯入中...';

  const { transactions, errors } = collectTransactions();
  if (errors.length) {
    alert('有資料不完整，整批沒有匯入：\n' + errors.slice(0, 10).join('\n') + (errors.length > 10 ? `\n…共 ${errors.length} 筆` : ''));
    btn.disabled = false;
    btn.textContent = '匯入到平台';
    return;
  }
  if (transactions.length === 0) {
    alert('沒有可匯入的資料');
    btn.disabled = false;
    btn.textContent = '匯入到平台';
    return;
  }

  try {
    const res = await API.batchImportTransactions(transactions);
    if (res.success) {
      btn.textContent = `已匯入 ${res.data.inserted} 列（略過 ${res.data.skipped} 列）`;
      btn.classList.add('btn-secondary');
      btn.classList.remove('btn-primary');
      renderImportSummary(res.data, transactions.length);
    } else {
      alert('匯入失敗（整批都沒有寫入）：' + (res.error || '未知錯誤'));
      btn.disabled = false;
      btn.textContent = '匯入到平台';
    }
  } catch (err) {
    alert('匯入錯誤：' + err.message);
    btn.disabled = false;
    btn.textContent = '匯入到平台';
  }
}
