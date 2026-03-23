import { estimateRoom } from './estimator.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_DOOR_WIDTH   = 450;
const MAX_DRAWER_WIDTH = 900;

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

  card.innerHTML = buildCardHTML(id, itemCount);
  container.appendChild(card);

  // bind live-validation on width/doors/drawers fields
  ['width','doors','drawers'].forEach(field => {
    card.querySelector(`[data-field="${field}"]`)
      .addEventListener('input', () => liveValidate(card));
  });

  card.querySelector('[data-field="type"]')
    .addEventListener('change', (e) => applyTypeDefaults(card, e.target.value));

  updateCardTitles();
}

function buildCardHTML(id, num) {
  return `
    <div class="card-header">
      <span class="card-title">Cabinet ${num}</span>
      <button class="remove-btn" onclick="removeItem(${id})">✕ Remove</button>
    </div>

    <!-- Type & Label -->
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
        <input type="text" class="field" data-field="label" placeholder="e.g. Kitchen Left"
               oninput="updateCardTitles()">
      </div>
    </div>

    <!-- Dimensions -->
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

    <!-- Counts -->
    <div class="form-row">
      <div class="form-group">
        <label>Shelves</label>
        <input type="number" class="field" data-field="shelves" value="1" min="0">
      </div>
      <div class="form-group">
        <label>Doors</label>
        <input type="number" class="field" data-field="doors" value="1" min="0">
      </div>
      <div class="form-group">
        <label>Drawers</label>
        <input type="number" class="field" data-field="drawers" value="0" min="0">
      </div>
    </div>

    <!-- Width warning + gap info -->
    <div class="gap-info" data-section="gapInfo" style="display:none"></div>

    <!-- Appliances (shown when gap > 0) -->
    <div class="appliance-section" data-section="applianceSection" style="display:none">
      <div class="section-label">Gap Allocation — Appliances</div>
      <div class="appliance-grid">
        ${Object.entries(APPLIANCE_DEFAULTS).map(([key, appl]) => `
          <label class="appl-check">
            <input type="checkbox" data-appl="${key}"
                   onchange="toggleAppliance(this, ${id})">
            ${appl.label}
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

    <!-- Face material -->
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

// ─── Live Width Validation ────────────────────────────────────────────────────

window.liveValidate = function(card) {
  const width   = parseInt(card.querySelector('[data-field="width"]').value)   || 0;
  const doors   = parseInt(card.querySelector('[data-field="doors"]').value)   || 0;
  const drawers = parseInt(card.querySelector('[data-field="drawers"]').value) || 0;

  const usedByDoors   = doors   * MAX_DOOR_WIDTH;
  const usedByDrawers = drawers * MAX_DRAWER_WIDTH;
  const usedWidth     = usedByDoors + usedByDrawers;
  const gap           = Math.max(0, width - usedWidth);

  const gapSection  = card.querySelector('[data-section="gapInfo"]');
  const appSection  = card.querySelector('[data-section="applianceSection"]');

  const warnings = [];
  if (doors > 0 && doors > 0) {
    const singleDoorW = Math.floor(width / doors);
    if (singleDoorW > MAX_DOOR_WIDTH)
      warnings.push(`Each door would be ${singleDoorW}mm wide — max is ${MAX_DOOR_WIDTH}mm. Consider more doors.`);
  }
  if (drawers > 0 && width > MAX_DRAWER_WIDTH)
    warnings.push(`Cabinet width (${width}mm) exceeds max drawer width of ${MAX_DRAWER_WIDTH}mm.`);

  if (warnings.length > 0 || gap > 0) {
    let html = '';
    warnings.forEach(w => {
      html += `<div class="gap-warning">⚠️ ${w}</div>`;
    });
    if (gap > 0) {
      html += `<div class="gap-note">📐 <strong>${gap}mm gap</strong> remaining after doors/drawers. Assign it below.</div>`;
    }
    gapSection.innerHTML  = html;
    gapSection.style.display = 'block';
    appSection.style.display = gap > 0 ? 'block' : 'none';
  } else {
    gapSection.style.display  = 'none';
    appSection.style.display  = 'none';
  }
};

// ─── Appliance Toggle ─────────────────────────────────────────────────────────

window.toggleAppliance = function(checkbox, cardId) {
  const card         = document.querySelector(`.cabinet-card[data-id="${cardId}"]`);
  const widthsDiv    = card.querySelector('[data-section="applianceWidths"]');
  const type         = checkbox.dataset.appl;
  const appl         = APPLIANCE_DEFAULTS[type];
  const existingRow  = widthsDiv.querySelector(`[data-appl-row="${type}"]`);

  if (checkbox.checked) {
    const row = document.createElement('div');
    row.className = 'appl-width-row form-row';
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
    base:  { height: 720,  depth: 560, doors: 1, drawers: 0 },
    wall:  { height: 720,  depth: 320, doors: 1, drawers: 0 },
    tall:  { height: 2100, depth: 560, doors: 2, drawers: 0 },
    tower: { height: 2400, depth: 600, doors: 2, drawers: 2 }
  };
  const d = defaults[type] || {};
  if (d.height !== undefined) card.querySelector('[data-field="height"]').value = d.height;
  if (d.depth  !== undefined) card.querySelector('[data-field="depth"]').value  = d.depth;
  if (d.doors  !== undefined) card.querySelector('[data-field="doors"]').value  = d.doors;
  if (d.drawers!== undefined) card.querySelector('[data-field="drawers"]').value= d.drawers;
  liveValidate(card);
};

// ─── Remove Item ──────────────────────────────────────────────────────────────

window.removeItem = function(id) {
  const card = document.querySelector(`.cabinet-card[data-id="${id}"]`);
  if (card) card.remove();
  updateCardTitles();
};

function updateCardTitles() {
  document.querySelectorAll('.cabinet-card').forEach((card, i) => {
    const titleEl = card.querySelector('.card-title');
    const label   = card.querySelector('[data-field="label"]')?.value?.trim();
    titleEl.textContent = label || `Cabinet ${i + 1}`;
  });
}

// ─── Read All Items ───────────────────────────────────────────────────────────

function readItems() {
  return Array.from(document.querySelectorAll('.cabinet-card')).map(card => {
    const get     = f => card.querySelector(`[data-field="${f}"]`)?.value;
    const checked = f => card.querySelector(`[data-field="${f}"]`)?.checked || false;

    // Collect checked appliances + their widths
    const appliances = [];
    card.querySelectorAll('[data-appl]:checked').forEach(cb => {
      const type = cb.dataset.appl;
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
      drawers:       parseInt(get('drawers'), 10),
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
    const inputItems = readItems();
    const result     = await estimateRoom(inputItems);
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

    const appliancesHTML = item.appliances?.length
      ? `<div class="breakdown-row section-header"><span>Gap / Appliances</span></div>` +
        item.appliances.map(a =>
          `<div class="breakdown-row"><span>${APPLIANCE_DEFAULTS[a.type]?.label || a.type} (${a.width}mm)</span><span>gap only</span></div>`
        ).join('')
      : '';

    const endBoardHTML = item.endBoardCount > 0
      ? `<div class="breakdown-row"><span>End boards (${item.endBoardCount})</span><span>included in face cost</span></div>`
      : '';

    const appFaceHTML = item.applianceFaceCount > 0
      ? `<div class="breakdown-row"><span>Appliance reveal panels (${item.applianceFaceCount})</span><span>included in face cost</span></div>`
      : '';

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

          ${(item.doors > 0 || item.drawers > 0 || item.endBoardCount > 0 || item.applianceFaceCount > 0) ? `
          <div class="breakdown-row section-header"><span>Face Boards — ${item.faceMaterial} (${item.faceSheets} sheet${item.faceSheets !== 1 ? 's' : ''})</span></div>
          <div class="breakdown-row"><span>Face board cost</span><span>${fmt(b.faceBoardCost)}</span></div>
          ${endBoardHTML}
          ${appFaceHTML}
          ` : ''}

          ${appliancesHTML}

          <div class="breakdown-row section-header"><span>Hardware</span></div>
          ${item.doors   > 0 ? `<div class="breakdown-row"><span>Hinges (${item.doors} door${item.doors > 1 ? 's' : ''} × 2)</span><span>${fmt(b.hingeCost)}</span></div>` : ''}
          ${item.drawers > 0 ? `<div class="breakdown-row"><span>Drawer sets (${item.drawers})</span><span>${fmt(b.drawerHwCost)}</span></div>` : ''}

          <div class="breakdown-row section-header"><span>Labour</span></div>
          <div class="breakdown-row"><span>Cutting / Machining</span><span>${fmt(b.cuttingCost)}</span></div>
          <div class="breakdown-row"><span>Assembly</span><span>${fmt(b.assemblyCost)}</span></div>
          <div class="breakdown-row"><span>Installation</span><span>${fmt(b.installationCost)}</span></div>

          <div class="breakdown-row section-header"><span>Subtotals (with markup)</span></div>
          <div class="breakdown-row"><span>Materials</span><span>${fmt(b.materialTotal)}</span></div>
          ${b.faceTotal    > 0 ? `<div class="breakdown-row"><span>Face material</span><span>${fmt(b.faceTotal)}</span></div>` : ''}
          ${b.drawerHwTotal> 0 ? `<div class="breakdown-row"><span>Drawer hardware</span><span>${fmt(b.drawerHwTotal)}</span></div>` : ''}
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
      <span>Grand Total — ${result.items.length} cabinets</span>
      <span>${fmt(result.grandTotal)} AUD</span>
    </div>
  ` : '';

  outputEl.innerHTML = `<h2 class="results-heading">Estimate Results</h2>${itemsHTML}${grandHTML}`;
  outputEl.classList.add('visible');
}

// ─── Start ────────────────────────────────────────────────────────────────────

init();
