import { estimateRoom } from './estimator.js';

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

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  await loadTheme();
  addItem();
  bindEvents();
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

function bindEvents() {
  document.getElementById('addItemBtn').addEventListener('click', addItem);
  document.getElementById('estimateBtn').addEventListener('click', handleEstimate);
}

// ─── Add Cabinet Card ─────────────────────────────────────────────────────────

function addItem() {
  itemCount++;
  const id = Date.now();

  const container = document.getElementById('itemsContainer');
  const card      = document.createElement('div');
  card.className  = 'cabinet-card';
  card.dataset.id = id;
  card.innerHTML  = buildCardHTML(id, itemCount);
  container.appendChild(card);

  // Live validate when width or doors change
  ['width', 'doors'].forEach(field => {
    card.querySelector(`[data-field="${field}"]`)
      .addEventListener('input', () => liveValidate(card));
  });

  card.querySelector('[data-field="type"]')
    .addEventListener('change', e => applyTypeDefaults(card, e.target.value));

  updateCardTitles();
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

    <!-- Drawer Units -->
    <div class="section-label" style="margin-top:4px">Drawer Units</div>
    <div class="drawer-units-list" data-section="drawerUnitsList"></div>
    <button class="btn-add-drawer" onclick="addDrawerUnit(${id})">+ Add Drawer Unit</button>

    <!-- Width summary / gap info -->
    <div class="gap-info" data-section="gapInfo" style="display:none"></div>

    <!-- Appliances (shown when gap > 0) -->
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

    <!-- End boards -->
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
        <label>Door / Drawer / End Board Face Material</label>
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
  const card     = document.querySelector(`.cabinet-card[data-id="${cardId}"]`);
  const list     = card.querySelector('[data-section="drawerUnitsList"]');
  const unitId   = Date.now();
  const unitNum  = list.children.length + 1;

  const row = document.createElement('div');
  row.className       = 'drawer-unit-row';
  row.dataset.unitId  = unitId;
  row.innerHTML = `
    <div class="drawer-unit-inner">
      <div class="form-group">
        <label>Unit ${unitNum} width (mm)</label>
        <input type="number" class="field" data-unit-field="width"
               value="600" min="450" max="900"
               oninput="liveValidate(this.closest('.cabinet-card'))">
      </div>
      <div class="form-group">
        <label>Drawers in this unit</label>
        <input type="number" class="field" data-unit-field="count"
               value="3" min="1" max="8">
      </div>
      <button class="btn-remove-unit" onclick="removeDrawerUnit(this, '${cardId}')">✕</button>
    </div>
  `;
  list.appendChild(row);
  liveValidate(card);
};

window.removeDrawerUnit = function(btn, cardId) {
  btn.closest('.drawer-unit-row').remove();
  const card = document.querySelector(`.cabinet-card[data-id="${cardId}"]`);
  // Re-number unit labels
  card.querySelectorAll('.drawer-unit-row').forEach((row, i) => {
    row.querySelector('label').textContent = `Unit ${i + 1} width (mm)`;
  });
  liveValidate(card);
};

// ─── Live Width Validation ────────────────────────────────────────────────────

window.liveValidate = function(card) {
  const width = parseInt(card.querySelector('[data-field="width"]').value) || 0;
  const doors = parseInt(card.querySelector('[data-field="doors"]').value) || 0;

  // Collect drawer units
  const drawerUnits = readDrawerUnits(card);
  const usedByDrawers = drawerUnits.reduce((s, u) => s + u.width, 0);
  const doorWidth     = doors > 0 ? Math.floor(width / doors) : 0;
  const usedByDoors   = doors * Math.min(doorWidth, MAX_DOOR_WIDTH);
  const usedWidth     = usedByDoors + usedByDrawers;
  const gap           = Math.max(0, width - usedWidth);

  const warnings = [];
  if (doors > 0 && doorWidth > MAX_DOOR_WIDTH) {
    warnings.push(`Each door would be ${doorWidth}mm — max is ${MAX_DOOR_WIDTH}mm. Consider adding more doors.`);
  }
  drawerUnits.forEach((u, i) => {
    if (u.width > 900) warnings.push(`Drawer unit ${i + 1} width (${u.width}mm) exceeds 900mm max.`);
    if (u.width < 450) warnings.push(`Drawer unit ${i + 1} width (${u.width}mm) is below 450mm min.`);
  });

  const gapSection  = card.querySelector('[data-section="gapInfo"]');
  const appSection  = card.querySelector('[data-section="applianceSection"]');

  // Build summary
  let html = '';

  // Width breakdown summary
  const parts = [];
  if (doors > 0)           parts.push(`${doors} door${doors > 1 ? 's' : ''} × ${Math.min(doorWidth, MAX_DOOR_WIDTH)}mm = ${usedByDoors}mm`);
  if (drawerUnits.length)  parts.push(`${drawerUnits.length} drawer unit${drawerUnits.length > 1 ? 's' : ''} = ${usedByDrawers}mm`);
  if (parts.length) {
    html += `<div class="gap-note">📐 Used: ${parts.join(' + ')} = <strong>${usedWidth}mm</strong> of ${width}mm`;
    if (gap > 0) html += ` — <span style="color:#ffb74d"><strong>${gap}mm gap</strong></span>`;
    else         html += ` — <span style="color:#81c784">✓ full width covered</span>`;
    html += `</div>`;
  }

  warnings.forEach(w => {
    html += `<div class="gap-warning">⚠️ ${w}</div>`;
  });

  if (html) {
    gapSection.innerHTML     = html;
    gapSection.style.display = 'block';
  } else {
    gapSection.style.display = 'none';
  }

  appSection.style.display = gap > 0 ? 'block' : 'none';
};

// ─── Appliance Toggle ─────────────────────────────────────────────────────────

window.toggleAppliance = function(checkbox, cardId) {
  const card        = document.querySelector(`.cabinet-card[data-id="${cardId}"]`);
  const widthsDiv   = card.querySelector('[data-section="applianceWidths"]');
  const type        = checkbox.dataset.appl;
  const appl        = APPLIANCE_DEFAULTS[type];
  const existingRow = widthsDiv.querySelector(`[data-appl-row="${type}"]`);

  if (checkbox.checked) {
    const row = document.createElement('div');
    row.className       = 'form-row appl-width-row';
    row.dataset.applRow = type;
    row.innerHTML = `
      <div class="form-group">
        <label>${appl.label} width (mm)</label>
        <input type="number" class="field" data-appl-width="${type}"
               value="${appl.defaultWidth}" min="100">
      </div>
    `;
    widthsDiv.appendChild(row);
  } else if (existingRow) {
    existingRow.remove();
  }
};

// ─── Type Defaults ────────────────────────────────────────────────────────────

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

// ─── Remove Cabinet ───────────────────────────────────────────────────────────

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

// ─── Read Helpers ─────────────────────────────────────────────────────────────

function readDrawerUnits(card) {
  return Array.from(card.querySelectorAll('.drawer-unit-row')).map(row => ({
    width: parseInt(row.querySelector('[data-unit-field="width"]')?.value) || 600,
    count: parseInt(row.querySelector('[data-unit-field="count"]')?.value) || 1
  }));
}

function readItems() {
  return Array.from(document.querySelectorAll('.cabinet-card')).map(card => {
    const get     = f => card.querySelector(`[data-field="${f}"]`)?.value;
    const checked = f => card.querySelector(`[data-field="${f}"]`)?.checked || false;

    const appliances = [];
    card.querySelectorAll('[data-appl]:checked').forEach(cb => {
      const type       = cb.dataset.appl;
      const widthInput = card.querySelector(`[data-appl-width="${type}"]`);
      appliances.push({
        type,
        width: widthInput ? parseInt(widthInput.value) : APPLIANCE_DEFAULTS[type]?.defaultWidth
      });
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

// ─── Handle Estimate ──────────────────────────────────────────────────────────

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

// ─── Render Results ───────────────────────────────────────────────────────────

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
          `<div class="breakdown-row">
            <span>Drawer unit ${j + 1} — ${u.width}mm wide, ${u.count} drawer${u.count > 1 ? 's' : ''}</span>
            <span>${u.count} × runner set</span>
          </div>`
        ).join('')
      : '';

    const appliancesHTML = item.appliances?.length
      ? `<div class="breakdown-row section-header"><span>Gap / Appliances</span></div>` +
        item.appliances.map(a =>
          `<div class="breakdown-row">
            <span>${APPLIANCE_DEFAULTS[a.type]?.label || a.type} (${a.width}mm)</span>
            <span>gap only</span>
          </div>`
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
          ${drawerUnitsHTML}
          ` : ''}

          ${appliancesHTML}

          <div class="breakdown-row section-header"><span>Hardware</span></div>
          ${item.doors > 0
            ? `<div class="breakdown-row"><span>Hinges (${item.doors} door${item.doors > 1 ? 's' : ''} × 2)</span><span>${fmt(b.hingeCost)}</span></div>`
            : ''}
          ${item.totalDrawers > 0
            ? `<div class="breakdown-row"><span>Drawer hardware (${item.totalDrawers} drawers)</span><span>${fmt(b.drawerHwCost)}</span></div>`
            : ''}

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
  ` : '';

  outputEl.innerHTML = `<h2 class="results-heading">Estimate Results</h2>${itemsHTML}${grandHTML}`;
  outputEl.classList.add('visible');
}

// ─── Start ────────────────────────────────────────────────────────────────────

init();
