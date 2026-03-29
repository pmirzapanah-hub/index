import { estimateRoom }                           from './estimator.js';
import { readPlanFile, computeTakeoff, takeoffToEstimatorItems } from './ai-reader.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_DOOR_WIDTH = 450;

const APPLIANCE_DEFAULTS = {
  dishwasher: { label: 'Dishwasher',     defaultWidth: 600 },
  oven:       { label: 'Oven',           defaultWidth: 600 },
  fridge:     { label: 'Fridge',         defaultWidth: 900 },
  blind:      { label: 'Blind Cabinet',  defaultWidth: 300 },
  other:      { label: 'Other Appliance',defaultWidth: 600 }
};

// ─── State ────────────────────────────────────────────────────────────────────

let itemCount = 0;
let aiResult  = null;  // stores last AI reading { description, extracted, takeoff }
let currentFile = null;

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  await loadTheme();
  addItem();
  document.getElementById('addItemBtn').addEventListener('click', addItem);
  document.getElementById('estimateBtn').addEventListener('click', handleEstimate);
}

async function loadTheme() {
  try {
    const res   = await fetch('/index/config/theme.json');
    const theme = await res.json();
    document.body.style.backgroundColor = theme.secondaryColor;
    document.title = theme.brandName;
  } catch (e) {
    console.warn('Theme load failed', e);
  }
}

// ─── AI Reader ────────────────────────────────────────────────────────────────

window.handleFileSelect = function(file) {
  if (!file) return;
  currentFile = file;

  const loadedEl = document.getElementById('fileLoaded');
  loadedEl.textContent = `📎 ${file.name} (${(file.size / 1024).toFixed(0)} KB)`;
  loadedEl.style.display = 'block';

  document.getElementById('readPlanBtn').disabled = false;
  document.getElementById('aiTakeoff').style.display = 'none';
  document.getElementById('aiStatus').style.display = 'none';
  aiResult = null;
};

window.runAIReader = async function() {
  if (!currentFile) return;

  const statusEl  = document.getElementById('aiStatus');
  const takeoffEl = document.getElementById('aiTakeoff');
  const btn       = document.getElementById('readPlanBtn');

  btn.disabled = true;
  takeoffEl.style.display = 'none';
  statusEl.className = 'ai-status';
  statusEl.style.display = 'block';

  try {
    aiResult = await readPlanFile(currentFile, (msg) => {
      statusEl.textContent = msg;
    });

    statusEl.textContent = '✅ Plan read successfully!';
    // Store BEFORE rendering so print reports always have the data
    const t = aiResult.takeoff;
    window._lastEstimateResult = {
      items:      [],
      grandTotal: 0,
      pooled: {
        carcassSheets: t.hmrSheets || 0,
        faceSheets:    t.mdfSheets || 0,
        totalSheets:   (t.hmrSheets || 0) + (t.mdfSheets || 0)
      },
      _aiTakeoff: t
    };
    console.log('Stored for print:', window._lastEstimateResult.pooled);

    renderTakeoff(t, aiResult.description, aiResult.isPhotoMode);

  } catch (err) {
    console.error(err);
    statusEl.className = 'ai-status error';
    statusEl.textContent = `❌ ${err.message}`;
  } finally {
    btn.disabled = false;
  }
};

function renderTakeoff(t, description, isPhotoMode = false) {
  const takeoffEl = document.getElementById('aiTakeoff');
  const gridEl    = document.getElementById('takeoffGrid');
  const descEl    = document.getElementById('aiDescription');

  // Show photo mode warning banner
  const existingBanner = document.getElementById('photoModeBanner');
  if (existingBanner) existingBanner.remove();
  if (isPhotoMode) {
    const banner = document.createElement('div');
    banner.id = 'photoModeBanner';
    banner.style.cssText = 'background:#3a2a10;border:1px solid #ffa000;border-radius:7px;padding:10px 14px;margin-bottom:12px;font-size:13px;color:#ffb74d;';
    banner.innerHTML = '📷 <strong>Photo mode</strong> — Cabinet counts are estimated visually. Dimensions are standard estimates. Click <strong>Import Cabinets</strong> to review and adjust before pricing.';
    takeoffEl.insertBefore(banner, takeoffEl.firstChild);
  }

  const cards = [
    { label: 'HMR Sheets',     value: t.hmrSheets,   unit: 'White HMR 16mm' },
    { label: 'MDF Sheets',     value: t.mdfSheets,   unit: 'MDF 18mm' },
    { label: 'Hinges',         value: t.totalHinges, unit: 'soft-close' },
    { label: 'Drawer Slides',  value: t.totalSlides, unit: 'pairs' },
    { label: 'Handles',        value: t.totalHandles,unit: 'total' },
    { label: 'Shelf Pins',     value: t.totalPins,   unit: 'total' },
    { label: 'Adj. Legs',      value: t.totalLegs,   unit: 'total' },
    { label: 'Total Doors',    value: t.totalDoors,  unit: 'doors' },
    { label: 'Total Drawers',  value: t.totalDrawers,unit: 'drawers' },
    { label: 'Total Shelves',  value: t.totalShelves,unit: 'shelves' },
  ];

  gridEl.innerHTML = cards.map(c => `
    <div class="takeoff-card">
      <div class="tc-label">${c.label}</div>
      <div class="tc-value">${c.value}</div>
      <div class="tc-unit">${c.unit}</div>
    </div>
  `).join('');

  if (t.scope) {
    gridEl.insertAdjacentHTML('beforebegin',
      `<div style="color:#90caf9;font-size:13px;margin-bottom:12px">📐 ${t.scope}</div>`);
  }

  if (t.notes) {
    gridEl.insertAdjacentHTML('afterend',
      `<div class="gap-warning" style="margin-bottom:12px">${t.notes}</div>`);
  }

  if (description) {
    descEl.textContent = description;
    descEl.style.display = 'block';
  }

  takeoffEl.style.display = 'block';
}

window.importToManual = function() {
  if (!aiResult?.extracted) return;

  const newItems = takeoffToEstimatorItems(aiResult.extracted);
  if (!newItems.length) {
    alert('No cabinets found to import.');
    return;
  }

  // Clear existing manual items
  document.getElementById('itemsContainer').innerHTML = '';
  itemCount = 0;

  // Add each AI-extracted cabinet as a manual card
  newItems.forEach(item => {
    addItem(item);
  });

  // Switch to manual tab
  document.querySelector('.tab-btn').click();

  // Scroll to manual section
  document.getElementById('tab-manual').scrollIntoView({ behavior: 'smooth' });
};

// ─── Manual Entry ─────────────────────────────────────────────────────────────

function addItem(prefill = null) {
  itemCount++;
  const id = Date.now() + Math.random(); // unique even when adding many at once

  const container = document.getElementById('itemsContainer');
  const card      = document.createElement('div');
  card.className  = 'cabinet-card';
  card.dataset.id = id;
  card.innerHTML  = buildCardHTML(id, itemCount);
  container.appendChild(card);

  // Prefill from AI import
  if (prefill) {
    const set = (field, val) => {
      const el = card.querySelector(`[data-field="${field}"]`);
      if (el && val !== undefined) el.value = val;
    };
    set('type',         prefill.type);
    set('label',        prefill.label);
    set('width',        prefill.width);
    set('height',       prefill.height);
    set('depth',        prefill.depth);
    set('shelves',      prefill.shelves);
    set('doors',        prefill.doors);
    set('faceMaterial', prefill.faceMaterial || 'mdf_18');

    // Add drawer units
    if (prefill.drawerUnits?.length) {
      prefill.drawerUnits.forEach(u => {
        addDrawerUnitToCard(card, id, u.width, u.count);
      });
    }
  }

  // Live validate on input
  ['width', 'doors'].forEach(field => {
    card.querySelector(`[data-field="${field}"]`)
      ?.addEventListener('input', () => liveValidate(card));
  });

  card.querySelector('[data-field="type"]')
    ?.addEventListener('change', e => applyTypeDefaults(card, e.target.value));

  updateCardTitles();
}

function addDrawerUnitToCard(card, cardId, width = 600, count = 3) {
  const list   = card.querySelector('[data-section="drawerUnitsList"]');
  const unitId = Date.now() + Math.random();
  const num    = list.children.length + 1;

  const row = document.createElement('div');
  row.className      = 'drawer-unit-row';
  row.dataset.unitId = unitId;
  row.innerHTML = `
    <div class="drawer-unit-inner">
      <div class="form-group">
        <label>Unit ${num} width (mm)</label>
        <input type="number" class="field" data-unit-field="width"
               value="${width}" min="450" max="900"
               oninput="liveValidate(this.closest('.cabinet-card'))">
      </div>
      <div class="form-group">
        <label>Drawers in this unit</label>
        <input type="number" class="field" data-unit-field="count"
               value="${count}" min="1" max="8">
      </div>
      <button class="btn-remove-unit" onclick="removeDrawerUnit(this, '${cardId}')">✕</button>
    </div>
  `;
  list.appendChild(row);
  liveValidate(card);
}

function buildCardHTML(id, num) {
  return `
    <div class="card-header">
      <span class="card-title">Cabinet ${num}</span>
      <button class="remove-btn" onclick="removeItem(${id})">✕ Remove</button>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Cabinet Type</label>
        <select class="field" data-field="type">
          <option value="base">Base Cabinet</option>
          <option value="wall">Wall Cabinet</option>
          <option value="tall">Tall Cabinet</option>
          <option value="tower">Tower / Pantry</option>
        </select>
      </div>
      <div class="form-group">
        <label>Label (optional)</label>
        <input type="text" class="field" data-field="label"
               placeholder="e.g. Kitchen Left" oninput="updateCardTitles()">
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Width (mm)</label>
        <input type="number" class="field" data-field="width" value="900" min="100">
      </div>
      <div class="form-group">
        <label>Height (mm)</label>
        <input type="number" class="field" data-field="height" value="720" min="100">
      </div>
      <div class="form-group">
        <label>Depth (mm)</label>
        <input type="number" class="field" data-field="depth" value="560" min="100">
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Shelves</label>
        <input type="number" class="field" data-field="shelves" value="1" min="0">
      </div>
      <div class="form-group">
        <label>Doors</label>
        <input type="number" class="field" data-field="doors" value="1" min="0">
      </div>
    </div>

    <div class="section-label" style="margin-top:4px">Drawer Units</div>
    <div class="drawer-units-list" data-section="drawerUnitsList"></div>
    <button class="btn-add-drawer" onclick="addDrawerUnit(${id})">+ Add Drawer Unit</button>

    <div class="gap-info" data-section="gapInfo" style="display:none"></div>

    <div class="appliance-section" data-section="applianceSection" style="display:none">
      <div class="section-label">Gap Allocation — Appliances</div>
      <div class="appliance-grid">
        ${Object.entries(APPLIANCE_DEFAULTS).map(([key, a]) => `
          <label class="appl-check">
            <input type="checkbox" data-appl="${key}"
                   onchange="toggleAppliance(this, ${id})">
            ${a.label}
          </label>
        `).join('')}
      </div>
      <div class="appliance-widths" data-section="applianceWidths"></div>
    </div>

    <div class="section-label" style="margin-top:12px">End Boards (face material)</div>
    <div class="form-row checkbox-row">
      <label class="check-label">
        <input type="checkbox" class="field" data-field="endBoardLeft">
        Left end board
      </label>
      <label class="check-label">
        <input type="checkbox" class="field" data-field="endBoardRight">
        Right end board
      </label>
    </div>

    <div class="form-row" style="margin-top:4px">
      <div class="form-group">
        <label>Face Material (doors / drawers / end boards)</label>
        <select class="field" data-field="faceMaterial">
          <option value="mdf_18">MDF 18mm (recommended)</option>
          <option value="mdf_16">MDF 16mm</option>
        </select>
      </div>
    </div>
  `;
}

// ─── Drawer Units ─────────────────────────────────────────────────────────────

window.addDrawerUnit = function(cardId) {
  const card = document.querySelector(`.cabinet-card[data-id="${cardId}"]`);
  if (!card) return;
  addDrawerUnitToCard(card, cardId);
};

window.removeDrawerUnit = function(btn, cardId) {
  btn.closest('.drawer-unit-row').remove();
  const card = document.querySelector(`.cabinet-card[data-id="${cardId}"]`);
  card?.querySelectorAll('.drawer-unit-row').forEach((row, i) => {
    const lbl = row.querySelector('label');
    if (lbl) lbl.textContent = `Unit ${i + 1} width (mm)`;
  });
  liveValidate(card);
};

// ─── Live Validation ──────────────────────────────────────────────────────────

window.liveValidate = function(card) {
  const width = parseInt(card.querySelector('[data-field="width"]')?.value) || 0;
  const doors = parseInt(card.querySelector('[data-field="doors"]')?.value) || 0;

  const drawerUnits   = readDrawerUnits(card);
  const usedByDrawers = drawerUnits.reduce((s, u) => s + u.width, 0);
  const doorWidth     = doors > 0 ? Math.floor(width / doors) : 0;
  const usedByDoors   = doors * Math.min(doorWidth, MAX_DOOR_WIDTH);
  const usedWidth     = usedByDoors + usedByDrawers;
  const gap           = Math.max(0, width - usedWidth);

  const warnings = [];
  if (doors > 0 && doorWidth > MAX_DOOR_WIDTH)
    warnings.push(`Each door would be ${doorWidth}mm — max is ${MAX_DOOR_WIDTH}mm. Consider adding more doors.`);
  drawerUnits.forEach((u, i) => {
    if (u.width > 900) warnings.push(`Drawer unit ${i + 1} width (${u.width}mm) exceeds 900mm max.`);
    if (u.width < 450) warnings.push(`Drawer unit ${i + 1} width (${u.width}mm) is below 450mm min.`);
  });

  const gapEl = card.querySelector('[data-section="gapInfo"]');
  const appEl = card.querySelector('[data-section="applianceSection"]');

  let html = '';
  const parts = [];
  if (doors > 0)          parts.push(`${doors} door${doors > 1 ? 's' : ''} × ${Math.min(doorWidth, MAX_DOOR_WIDTH)}mm = ${usedByDoors}mm`);
  if (drawerUnits.length) parts.push(`${drawerUnits.length} drawer unit${drawerUnits.length > 1 ? 's' : ''} = ${usedByDrawers}mm`);

  if (parts.length) {
    html += `<div class="gap-note">📐 Used: ${parts.join(' + ')} = <strong>${usedWidth}mm</strong> of ${width}mm`;
    if (gap > 0)   html += ` — <span style="color:#ffb74d"><strong>${gap}mm gap</strong></span>`;
    else           html += ` — <span style="color:#81c784">✓ full width covered</span>`;
    html += `</div>`;
  }
  warnings.forEach(w => { html += `<div class="gap-warning">⚠️ ${w}</div>`; });

  gapEl.innerHTML     = html;
  gapEl.style.display = html ? 'block' : 'none';
  appEl.style.display = gap > 0 ? 'block' : 'none';
};

// ─── Appliance toggle ─────────────────────────────────────────────────────────

window.toggleAppliance = function(checkbox, cardId) {
  const card      = document.querySelector(`.cabinet-card[data-id="${cardId}"]`);
  const widthsDiv = card.querySelector('[data-section="applianceWidths"]');
  const type      = checkbox.dataset.appl;
  const existing  = widthsDiv.querySelector(`[data-appl-row="${type}"]`);

  if (checkbox.checked) {
    const row = document.createElement('div');
    row.className       = 'form-row appl-width-row';
    row.dataset.applRow = type;
    row.innerHTML = `
      <div class="form-group">
        <label>${APPLIANCE_DEFAULTS[type].label} width (mm)</label>
        <input type="number" class="field" data-appl-width="${type}"
               value="${APPLIANCE_DEFAULTS[type].defaultWidth}" min="100">
      </div>`;
    widthsDiv.appendChild(row);
  } else if (existing) {
    existing.remove();
  }
};

// ─── Type defaults ────────────────────────────────────────────────────────────

window.applyTypeDefaults = function(card, type) {
  const defaults = {
    base:  { height: 720,  depth: 560, doors: 1 },
    wall:  { height: 720,  depth: 320, doors: 1 },
    tall:  { height: 2100, depth: 560, doors: 2 },
    tower: { height: 2400, depth: 600, doors: 2 }
  };
  const d = defaults[type] || {};
  if (d.height !== undefined) card.querySelector('[data-field="height"]').value = d.height;
  if (d.depth  !== undefined) card.querySelector('[data-field="depth"]').value  = d.depth;
  if (d.doors  !== undefined) card.querySelector('[data-field="doors"]').value  = d.doors;
  liveValidate(card);
};

// ─── Remove cabinet ───────────────────────────────────────────────────────────

window.removeItem = function(id) {
  document.querySelector(`.cabinet-card[data-id="${id}"]`)?.remove();
  updateCardTitles();
};

function updateCardTitles() {
  document.querySelectorAll('.cabinet-card').forEach((card, i) => {
    const label = card.querySelector('[data-field="label"]')?.value?.trim();
    card.querySelector('.card-title').textContent = label || `Cabinet ${i + 1}`;
  });
}

// ─── Read helpers ─────────────────────────────────────────────────────────────

function readDrawerUnits(card) {
  return Array.from(card.querySelectorAll('.drawer-unit-row')).map(row => ({
    width: parseInt(row.querySelector('[data-unit-field="width"]')?.value)  || 600,
    count: parseInt(row.querySelector('[data-unit-field="count"]')?.value)  || 1
  }));
}

function readItems() {
  return Array.from(document.querySelectorAll('.cabinet-card')).map(card => {
    const get     = f => card.querySelector(`[data-field="${f}"]`)?.value;
    const checked = f => card.querySelector(`[data-field="${f}"]`)?.checked || false;

    const appliances = [];
    card.querySelectorAll('[data-appl]:checked').forEach(cb => {
      const type = cb.dataset.appl;
      const wEl  = card.querySelector(`[data-appl-width="${type}"]`);
      appliances.push({ type, width: wEl ? parseInt(wEl.value) : APPLIANCE_DEFAULTS[type]?.defaultWidth });
    });

    return {
      type:          get('type'),
      label:         get('label') || '',
      width:         parseInt(get('width'),   10),
      height:        parseInt(get('height'),  10),
      depth:         parseInt(get('depth'),   10),
      shelves:       parseInt(get('shelves'), 10),
      doors:         parseInt(get('doors'),   10),
      drawerUnits:   readDrawerUnits(card),
      faceMaterial:  get('faceMaterial'),
      endBoardLeft:  checked('endBoardLeft'),
      endBoardRight: checked('endBoardRight'),
      appliances
    };
  });
}

// ─── Estimate ─────────────────────────────────────────────────────────────────

async function handleEstimate() {
  const outputEl = document.getElementById('output');
  outputEl.innerHTML = '<p style="color:#aaa;padding:10px">Calculating...</p>';
  outputEl.classList.add('visible');
  try {
    const result = await estimateRoom(readItems());
    renderResult(result);
  } catch (err) {
    console.error(err);
    outputEl.innerHTML = `<div class="error">Error: ${err.message}</div>`;
  }
}

// ─── Render results ───────────────────────────────────────────────────────────

function renderResult(result) {
  const outputEl = document.getElementById('output');
  const fmt = n => `$${n.toFixed(2)}`;

  const itemsHTML = result.items.map((item, i) => {
    const b = item.breakdown;

    const warningsHTML = item.warnings?.length
      ? item.warnings.map(w => `<div class="result-warning">⚠️ ${w}</div>`).join('')
      : '';

    const drawerUnitsHTML = item.drawerUnits?.length
      ? item.drawerUnits.map((u, j) =>
          `<div class="breakdown-row"><span>Drawer unit ${j+1} — ${u.width}mm × ${u.count} drawer${u.count > 1 ? 's' : ''}</span><span>${u.count} × set</span></div>`
        ).join('')
      : '';

    const appliancesHTML = item.appliances?.length
      ? `<div class="breakdown-row section-header"><span>Gap / Appliances</span></div>` +
        item.appliances.map(a =>
          `<div class="breakdown-row"><span>${APPLIANCE_DEFAULTS[a.type]?.label || a.type} (${a.width}mm)</span><span>gap only</span></div>`
        ).join('')
      : '';

    const hasFaces = item.doors > 0 || item.totalDrawers > 0 || item.endBoardCount > 0 || item.applianceFaceCount > 0;

    return `
      <div class="result-card">
        <div class="result-card-header">
          <span>${item.label || `Cabinet ${i + 1}`}</span>
          <span class="result-type">${item.cabinetType} — ${item.dimensions.width}×${item.dimensions.height}×${item.dimensions.depth}mm</span>
        </div>
        ${warningsHTML}
        <div class="breakdown">
          <div class="breakdown-row section-header"><span>Carcass — ${item.carcassSheets} sheet${item.carcassSheets !== 1 ? 's' : ''}</span></div>
          <div class="breakdown-row"><span>Board cost</span><span>${fmt(b.carcassBoardCost)}</span></div>

          ${hasFaces ? `
          <div class="breakdown-row section-header"><span>Face Boards — ${item.faceMaterial} (${item.faceSheets} sheet${item.faceSheets !== 1 ? 's' : ''})</span></div>
          <div class="breakdown-row"><span>Face board cost</span><span>${fmt(b.faceBoardCost)}</span></div>
          ${item.endBoardCount > 0 ? `<div class="breakdown-row"><span>End boards (${item.endBoardCount})</span><span>included above</span></div>` : ''}
          ${item.applianceFaceCount > 0 ? `<div class="breakdown-row"><span>Appliance reveal panels (${item.applianceFaceCount})</span><span>included above</span></div>` : ''}
          ` : ''}

          ${item.drawerUnits?.length ? `
          <div class="breakdown-row section-header"><span>Drawer Units</span></div>
          ${drawerUnitsHTML}` : ''}

          ${appliancesHTML}

          <div class="breakdown-row section-header"><span>Hardware</span></div>
          ${item.doors > 0       ? `<div class="breakdown-row"><span>Hinges (${item.doors} door${item.doors > 1 ? 's' : ''} × 2)</span><span>${fmt(b.hingeCost)}</span></div>` : ''}
          ${item.totalDrawers > 0 ? `<div class="breakdown-row"><span>Drawer hardware (${item.totalDrawers} drawers)</span><span>${fmt(b.drawerHwCost)}</span></div>` : ''}

          <div class="breakdown-row section-header"><span>Labour</span></div>
          <div class="breakdown-row"><span>Cutting / Machining</span><span>${fmt(b.cuttingCost)}</span></div>
          <div class="breakdown-row"><span>Assembly</span><span>${fmt(b.assemblyCost)}</span></div>
          <div class="breakdown-row"><span>Installation</span><span>${fmt(b.installationCost)}</span></div>

          <div class="breakdown-row section-header"><span>Subtotals (with markup)</span></div>
          <div class="breakdown-row"><span>Materials</span><span>${fmt(b.materialTotal)}</span></div>
          ${b.faceTotal     > 0 ? `<div class="breakdown-row"><span>Face material</span><span>${fmt(b.faceTotal)}</span></div>` : ''}
          ${b.drawerHwTotal > 0 ? `<div class="breakdown-row"><span>Drawer hardware</span><span>${fmt(b.drawerHwTotal)}</span></div>` : ''}
          <div class="breakdown-row"><span>Labour</span><span>${fmt(b.labourTotal)}</span></div>
        </div>
        <div class="total-row">
          <span>Cabinet Total</span>
          <span>${fmt(item.total)} AUD</span>
        </div>
      </div>
    `;
  }).join('');

  const grandHTML = result.items.length > 1 ? `
    <div class="grand-total-row">
      <span>Grand Total — ${result.items.length} cabinet${result.items.length > 1 ? 's' : ''}</span>
      <span>${fmt(result.grandTotal)} AUD</span>
    </div>
    ${result.pooled ? `
    <div class="pooled-sheets-row">
      <div class="pooled-title">📦 Actual Sheets to Order (all cabinets pooled together)</div>
      <div class="pooled-grid">
        <div class="pooled-item">
          <span class="pooled-label">HMR 16mm (Carcass)</span>
          <span class="pooled-value">${result.pooled.carcassSheets} sheets</span>
        </div>
        <div class="pooled-item">
          <span class="pooled-label">MDF 18mm (Faces)</span>
          <span class="pooled-value">${result.pooled.faceSheets} sheets</span>
        </div>
        <div class="pooled-item">
          <span class="pooled-label">Total Sheets</span>
          <span class="pooled-value" style="color:#2A7FFF;font-weight:bold">${result.pooled.totalSheets} sheets</span>
        </div>
      </div>
      <div style="font-size:11px;color:#666;margin-top:6px">
        ✓ Parts from all cabinets are nested together — partial sheets are shared, not wasted.
      </div>
    </div>` : ''}
  ` : '';

  // Store result globally for print reports
  window._lastEstimateResult = result;

  outputEl.innerHTML = `
    <h2 class="results-heading">Estimate Results</h2>
    <div class="print-bar">
      <span style="font-size:13px;color:#888">Print / Export:</span>
      <button class="btn-print" onclick="printReport('summary')">📋 Summary</button>
      <button class="btn-print" onclick="printReport('detail')">📄 Detail Report</button>
      <button class="btn-print" onclick="printReport('materials')">🔧 Material List</button>
    </div>
    ${itemsHTML}${grandHTML}
  `;
  outputEl.classList.add('visible');
}

// ─── Print / Report System ───────────────────────────────────────────────────

window.showPrintMenu = function() {
  document.getElementById('printMenu').style.display = 'block';
};

window.hidePrintMenu = function() {
  document.getElementById('printMenu').style.display = 'none';
};

window.printReport = function(type) {
  const result = window._lastEstimateResult;
  if (!result) {
    alert('Please calculate an estimate first.');
    return;
  }

  const date = new Date().toLocaleDateString('en-AU', { year:'numeric', month:'long', day:'numeric' });
  let printContent = '';

  if (type === 'summary')   printContent = buildSummaryReport(date);
  else if (type === 'detail')    printContent = buildDetailReport(date);
  else if (type === 'materials') printContent = buildMaterialReport(date);

  // Use iframe to avoid popup blocker
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:800px;height:600px;';
  document.body.appendChild(iframe);
  iframe.contentDocument.open();
  iframe.contentDocument.write(printContent);
  iframe.contentDocument.close();
  setTimeout(() => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => document.body.removeChild(iframe), 2000);
  }, 500);
};

// ── Shared print styles ───────────────────────────────────────────────────────
function printStyles() {
  return `
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; font-size: 12px; color: #111; padding: 20px; }
      h1 { font-size: 20px; margin-bottom: 4px; }
      h2 { font-size: 14px; margin: 16px 0 8px; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
      h3 { font-size: 12px; margin: 12px 0 6px; color: #555; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 2px solid #2A7FFF; padding-bottom: 12px; }
      .header-left h1 { color: #2A7FFF; }
      .header-right { text-align: right; font-size: 11px; color: #666; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      th { background: #2A7FFF; color: #fff; padding: 7px 10px; text-align: left; font-size: 11px; }
      td { padding: 6px 10px; border-bottom: 1px solid #eee; }
      tr:nth-child(even) td { background: #f8f8f8; }
      .total-row td { font-weight: bold; background: #e8f0ff; border-top: 2px solid #2A7FFF; }
      .grand-total { background: #2A7FFF; color: #fff; padding: 12px 16px; border-radius: 6px; display: flex; justify-content: space-between; font-size: 16px; font-weight: bold; margin-top: 16px; }
      .badge { display: inline-block; background: #e8f0ff; color: #2A7FFF; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: bold; }
      .warning { background: #fff8e1; border-left: 3px solid #ffa000; padding: 6px 10px; margin-bottom: 8px; font-size: 11px; }
      .section { margin-bottom: 24px; }
      .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
      @media print {
        body { padding: 10px; }
        .no-print { display: none; }
      }
    </style>
  `;
}

function reportHeader(title, date) {
  return `
    <div class="header">
      <div class="header-left">
        <h1>Cabinet Estimator</h1>
        <div style="color:#666;font-size:11px">${title}</div>
      </div>
      <div class="header-right">
        <div>Date: ${date}</div>
        <div style="margin-top:4px;font-size:10px;color:#999">Generated by Cabinet Estimator</div>
      </div>
    </div>
  `;
}

// ── Get last result from DOM ──────────────────────────────────────────────────
function getLastResult() {
  return window._lastEstimateResult || null;
}

// ── Summary Report ────────────────────────────────────────────────────────────
function buildSummaryReport(date) {
  const result = getLastResult();
  if (!result) return '<p>No estimate data.</p>';
  const fmt = n => `$${n.toFixed(2)}`;

  const rows = result.items.map((item, i) => `
    <tr>
      <td>${item.label || 'Cabinet ' + (i+1)}</td>
      <td>${item.cabinetType}</td>
      <td>${item.dimensions.width}×${item.dimensions.height}×${item.dimensions.depth}</td>
      <td>${item.doors}</td>
      <td>${item.totalDrawers || 0}</td>
      <td>${item.carcassSheets}</td>
      <td>${item.faceSheets}</td>
      <td style="text-align:right;font-weight:bold">${fmt(item.total)}</td>
    </tr>
  `).join('');

  // Totals
  const ai = result._aiTakeoff;
  const totalCarcass = ai?.hmrSheets  || result.pooled?.carcassSheets || result.items.reduce((s, i) => s + i.carcassSheets, 0);
  const totalFace    = ai?.mdfSheets  || result.pooled?.faceSheets    || result.items.reduce((s, i) => s + i.faceSheets, 0);
  const totalDoors   = ai?.totalDoors   ?? result.items.reduce((s, i) => s + i.doors, 0);
  const totalDrawers = ai?.totalDrawers ?? result.items.reduce((s, i) => s + (i.totalDrawers || 0), 0);
  const totalHinges  = ai?.totalHinges  ?? totalDoors * 2;
  const totalSlides  = ai?.totalSlides  ?? totalDrawers;

  return `<!DOCTYPE html><html><head>${printStyles()}<title>Summary Report</title></head><body>
    ${reportHeader('Summary Report', date)}

    <table>
      <thead><tr>
        <th>Cabinet</th><th>Type</th><th>Dimensions (mm)</th>
        <th>Doors</th><th>Drawers</th><th>HMR Sheets</th><th>MDF Sheets</th><th>Total</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr class="total-row">
        <td colspan="4"><strong>TOTALS</strong></td>
        <td>${totalDoors} doors / ${totalDrawers} drawers</td>
        <td>${totalCarcass} sheets</td>
        <td>${totalFace} sheets</td>
        <td style="text-align:right">${fmt(result.grandTotal || result.items.reduce((s,i)=>s+i.total,0))}</td>
      </tr></tfoot>
    </table>

    <div class="two-col" style="margin-bottom:16px">
      <div>
        <h2>Hardware Summary</h2>
        <table>
          <tr><td>Hinges (soft-close)</td><td><strong>${totalHinges}</strong></td></tr>
          <tr><td>Drawer runner sets</td><td><strong>${totalSlides}</strong></td></tr>
        </table>
      </div>
      <div>
        <h2>Board Summary</h2>
        <table>
          <tr><td>HMR 16mm (carcass)</td><td><strong>${totalCarcass} sheets</strong></td></tr>
          <tr><td>MDF 18mm (faces)</td><td><strong>${totalFace} sheets</strong></td></tr>
        </table>
      </div>
    </div>

    <div class="grand-total">
      <span>Grand Total (${result.items.length} cabinet${result.items.length>1?'s':''})</span>
      <span>${fmt(result.grandTotal || result.items.reduce((s,i)=>s+i.total,0))} AUD</span>
    </div>
  </body></html>`;
}

// ── Detail Report ─────────────────────────────────────────────────────────────
function buildDetailReport(date) {
  const result = getLastResult();
  if (!result) return '<p>No estimate data.</p>';
  const fmt = n => `$${n.toFixed(2)}`;

  const cabinetSections = result.items.map((item, i) => {
    const b = item.breakdown;
    const warnings = item.warnings?.length
      ? item.warnings.map(w => `<div class="warning">${w}</div>`).join('') : '';

    return `
      <div class="section">
        <h2>${item.label || 'Cabinet ' + (i+1)}
          <span class="badge">${item.cabinetType}</span>
          <span style="font-weight:normal;color:#666;font-size:11px;margin-left:8px">
            ${item.dimensions.width}×${item.dimensions.height}×${item.dimensions.depth}mm
          </span>
        </h2>
        ${warnings}
        <table>
          <thead><tr><th>Item</th><th>Detail</th><th style="text-align:right">Cost</th></tr></thead>
          <tbody>
            <tr><td>Carcass board</td><td>${item.carcassSheets} sheet${item.carcassSheets!==1?'s':''} HMR 16mm</td><td style="text-align:right">${fmt(b.carcassBoardCost)}</td></tr>
            ${b.faceBoardCost > 0 ? `<tr><td>Face board</td><td>${item.faceSheets} sheet${item.faceSheets!==1?'s':''} ${item.faceMaterial}</td><td style="text-align:right">${fmt(b.faceBoardCost)}</td></tr>` : ''}
            ${b.hingeCost > 0 ? `<tr><td>Hinges</td><td>${item.doors} door${item.doors>1?'s':''} × 2</td><td style="text-align:right">${fmt(b.hingeCost)}</td></tr>` : ''}
            ${b.drawerHwCost > 0 ? `<tr><td>Drawer hardware</td><td>${item.totalDrawers} set${item.totalDrawers>1?'s':''}</td><td style="text-align:right">${fmt(b.drawerHwCost)}</td></tr>` : ''}
            <tr><td>Cutting</td><td>Machine time</td><td style="text-align:right">${fmt(b.cuttingCost)}</td></tr>
            <tr><td>Assembly</td><td>Labour</td><td style="text-align:right">${fmt(b.assemblyCost)}</td></tr>
            <tr><td>Installation</td><td>Labour</td><td style="text-align:right">${fmt(b.installationCost)}</td></tr>
            <tr><td colspan="2" style="color:#666;font-size:11px">Materials subtotal (with markup)</td><td style="text-align:right">${fmt(b.materialTotal)}</td></tr>
            ${b.faceTotal > 0 ? `<tr><td colspan="2" style="color:#666;font-size:11px">Face material (with markup)</td><td style="text-align:right">${fmt(b.faceTotal)}</td></tr>` : ''}
            <tr><td colspan="2" style="color:#666;font-size:11px">Labour subtotal (with markup)</td><td style="text-align:right">${fmt(b.labourTotal)}</td></tr>
          </tbody>
          <tfoot><tr class="total-row">
            <td colspan="2"><strong>Cabinet Total</strong></td>
            <td style="text-align:right"><strong>${fmt(item.total)} AUD</strong></td>
          </tr></tfoot>
        </table>
      </div>
    `;
  }).join('');

  const grandTotal = result.grandTotal || result.items.reduce((s,i)=>s+i.total,0);

  return `<!DOCTYPE html><html><head>${printStyles()}<title>Detail Report</title></head><body>
    ${reportHeader('Detailed Estimate Report', date)}
    ${cabinetSections}
    <div class="grand-total">
      <span>Grand Total — ${result.items.length} cabinet${result.items.length>1?'s':''}</span>
      <span>${fmt(grandTotal)} AUD</span>
    </div>
  </body></html>`;
}

// ── Material List ─────────────────────────────────────────────────────────────
function buildMaterialReport(date) {
  const result = getLastResult();
  if (!result) return '<p>No estimate data.</p>';

  const ai = result._aiTakeoff;
  // Priority: AI takeoff → pooled manual → sum of per-cabinet (never 0 if data exists)
  const totalCarcass = ai?.hmrSheets  || result.pooled?.carcassSheets || result.items.reduce((s, i) => s + i.carcassSheets, 0);
  const totalFace    = ai?.mdfSheets  || result.pooled?.faceSheets    || result.items.reduce((s, i) => s + i.faceSheets, 0);
  const totalDoors   = ai?.totalDoors   ?? result.items.reduce((s, i) => s + i.doors, 0);
  const totalDrawers = ai?.totalDrawers ?? result.items.reduce((s, i) => s + (i.totalDrawers || 0), 0);
  const totalHinges  = ai?.totalHinges  ?? totalDoors * 2;
  const totalSlides  = ai?.totalSlides  ?? totalDrawers;
  const totalHandles = ai?.totalHandles ?? totalDoors + totalDrawers;

  const cabinetRows = result.items.length > 0
    ? result.items.map((item, i) => `
      <tr>
        <td>${item.label || 'Cabinet ' + (i+1)}</td>
        <td>${item.cabinetType} ${item.dimensions.width}mm</td>
        <td>${item.carcassSheets}</td>
        <td>${item.faceSheets}</td>
        <td>${item.doors > 0 ? item.doors * 2 : '—'}</td>
        <td>${item.totalDrawers > 0 ? item.totalDrawers : '—'}</td>
        <td>${item.shelves > 0 ? item.shelves : '—'}</td>
      </tr>
    `).join('')
    : `<tr><td colspan="7" style="color:#999;font-style:italic;text-align:center">
        AI plan read — import cabinets to Manual Entry for per-cabinet breakdown
      </td></tr>`;

  return `<!DOCTYPE html><html><head>${printStyles()}<title>Material List</title></head><body>
    ${reportHeader('Material & Hardware Order List', date)}

    <h2>Board Materials</h2>
    <table>
      <thead><tr><th>Material</th><th>Thickness</th><th>Sheet Size</th><th>Qty to Order</th></tr></thead>
      <tbody>
        <tr><td>White HMR Melamine (Carcass)</td><td>16mm</td><td>2420 × 1210mm</td><td><strong>${totalCarcass} sheets</strong></td></tr>
        <tr><td>MDF (Doors / Drawer Faces / End Boards)</td><td>18mm</td><td>2420 × 1210mm</td><td><strong>${totalFace} sheets</strong></td></tr>
      </tbody>
    </table>

    <h2>Hardware</h2>
    <table>
      <thead><tr><th>Item</th><th>Specification</th><th>Qty to Order</th></tr></thead>
      <tbody>
        <tr><td>Soft-Close Hinges</td><td>35mm cup, concealed</td><td><strong>${totalHinges}</strong></td></tr>
        <tr><td>Drawer Runner Sets</td><td>Under-mount soft-close, pair</td><td><strong>${totalSlides}</strong></td></tr>
        <tr><td>Handles / Knobs</td><td>As specified</td><td><strong>${totalHandles}</strong></td></tr>
      </tbody>
    </table>

    <h2>Per Cabinet Breakdown</h2>
    <table>
      <thead><tr>
        <th>Label</th><th>Type</th><th>HMR Sheets</th><th>MDF Sheets</th>
        <th>Hinges</th><th>Drawer Sets</th><th>Shelves</th>
      </tr></thead>
      <tbody>${cabinetRows}</tbody>
      <tfoot><tr class="total-row">
        <td><strong>TOTAL</strong></td><td></td>
        <td><strong>${totalCarcass}</strong></td>
        <td><strong>${totalFace}</strong></td>
        <td><strong>${totalHinges}</strong></td>
        <td><strong>${totalSlides}</strong></td>
        <td></td>
      </tr></tfoot>
    </table>

    <div style="margin-top:20px;padding:12px;background:#f5f5f5;border-radius:6px;font-size:11px;color:#666">
      <strong>Notes:</strong> Sheet counts are <strong>pooled across all cabinets</strong> — parts from 
      different cabinets nest together on the same sheet, so partial sheets are not wasted. 
      Hardware quantities are minimums — order 5–10% extra for breakage. 
      Confirm hinge count for doors taller than 900mm (3 hinges required).
    </div>
  </body></html>`;
}

// ─── Start ────────────────────────────────────────────────────────────────────

init();
