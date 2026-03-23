import { estimateRoom } from './estimator.js';

// ─── State ────────────────────────────────────────────────────────────────────

let items = []; // array of cabinet item objects

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  await loadTheme();
  addItem(); // start with one empty item
  bindEvents();
}

// ─── Theme ────────────────────────────────────────────────────────────────────

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

// ─── Bind Global Events ───────────────────────────────────────────────────────

function bindEvents() {
  document.getElementById('addItemBtn').addEventListener('click', addItem);
  document.getElementById('estimateBtn').addEventListener('click', handleEstimate);
}

// ─── Add Cabinet Item ─────────────────────────────────────────────────────────

function addItem() {
  const id  = Date.now();
  const idx = items.length;
  items.push({ id });

  const container = document.getElementById('itemsContainer');
  const card      = document.createElement('div');
  card.className  = 'cabinet-card';
  card.dataset.id = id;

  card.innerHTML = `
    <div class="card-header">
      <span class="card-title">Cabinet ${idx + 1}</span>
      <button class="remove-btn" onclick="removeItem(${id})">✕ Remove</button>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Cabinet Type</label>
        <select class="field" data-field="type" onchange="updateItemDefaults(${id}, this)">
          <option value="base">Base Cabinet</option>
          <option value="wall">Wall Cabinet</option>
          <option value="tall">Tall Cabinet</option>
          <option value="tower">Tower / Pantry</option>
        </select>
      </div>
      <div class="form-group">
        <label>Label (optional)</label>
        <input type="text" class="field" data-field="label" placeholder="e.g. Kitchen Left">
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Width (mm)</label>
        <input type="number" class="field" data-field="width" value="900">
      </div>
      <div class="form-group">
        <label>Height (mm)</label>
        <input type="number" class="field" data-field="height" value="720">
      </div>
      <div class="form-group">
        <label>Depth (mm)</label>
        <input type="number" class="field" data-field="depth" value="560">
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
      <div class="form-group">
        <label>Drawers</label>
        <input type="number" class="field" data-field="drawers" value="0" min="0">
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Door / Drawer Face Material</label>
        <select class="field" data-field="faceMaterial">
          <option value="mdf_18">MDF 18mm (recommended)</option>
          <option value="mdf_16">MDF 16mm</option>
        </select>
      </div>
    </div>
  `;

  container.appendChild(card);
  updateCardTitles();
}

// ─── Remove Item ──────────────────────────────────────────────────────────────

window.removeItem = function(id) {
  items = items.filter(i => i.id !== id);
  const card = document.querySelector(`.cabinet-card[data-id="${id}"]`);
  if (card) card.remove();
  updateCardTitles();
};

// ─── Update card titles after add/remove ─────────────────────────────────────

function updateCardTitles() {
  document.querySelectorAll('.cabinet-card').forEach((card, i) => {
    const titleEl = card.querySelector('.card-title');
    const label   = card.querySelector('[data-field="label"]')?.value?.trim();
    titleEl.textContent = label || `Cabinet ${i + 1}`;
  });
}

// ─── Update defaults when type changes ───────────────────────────────────────

window.updateItemDefaults = function(id, selectEl) {
  const defaults = {
    base:  { height: 720,  depth: 560, doors: 1, drawers: 0 },
    wall:  { height: 720,  depth: 320, doors: 1, drawers: 0 },
    tall:  { height: 2100, depth: 560, doors: 2, drawers: 0 },
    tower: { height: 2400, depth: 600, doors: 2, drawers: 2 }
  };
  const card = selectEl.closest('.cabinet-card');
  const d    = defaults[selectEl.value] || {};
  if (d.height) card.querySelector('[data-field="height"]').value = d.height;
  if (d.depth)  card.querySelector('[data-field="depth"]').value  = d.depth;
  if (d.doors !== undefined)   card.querySelector('[data-field="doors"]').value   = d.doors;
  if (d.drawers !== undefined) card.querySelector('[data-field="drawers"]').value = d.drawers;
};

// ─── Read All Items from DOM ──────────────────────────────────────────────────

function readItems() {
  return Array.from(document.querySelectorAll('.cabinet-card')).map(card => {
    const get = (field) => card.querySelector(`[data-field="${field}"]`)?.value;
    return {
      type:         get('type'),
      label:        get('label') || '',
      width:        parseInt(get('width'),  10),
      height:       parseInt(get('height'), 10),
      depth:        parseInt(get('depth'),  10),
      shelves:      parseInt(get('shelves'), 10),
      doors:        parseInt(get('doors'),   10),
      drawers:      parseInt(get('drawers'), 10),
      faceMaterial: get('faceMaterial')
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
    return `
      <div class="result-card">
        <div class="result-card-header">
          <span>${item.label || `Cabinet ${i + 1}`}</span>
          <span class="result-type">${item.cabinetType} — ${item.dimensions.width}×${item.dimensions.height}×${item.dimensions.depth}mm</span>
        </div>

        <div class="breakdown">
          <div class="breakdown-row section-header"><span>Carcass (${item.carcassSheets} sheet${item.carcassSheets !== 1 ? 's' : ''})</span></div>
          <div class="breakdown-row"><span>Board cost</span><span>${fmt(b.carcassBoardCost)}</span></div>

          ${(item.doors > 0 || item.drawers > 0) ? `
          <div class="breakdown-row section-header"><span>Door / Drawer Faces — ${item.faceMaterial} (${item.faceSheets} sheet${item.faceSheets !== 1 ? 's' : ''})</span></div>
          <div class="breakdown-row"><span>Face board cost</span><span>${fmt(b.faceBoardCost)}</span></div>
          ` : ''}

          <div class="breakdown-row section-header"><span>Hardware</span></div>
          ${item.doors > 0   ? `<div class="breakdown-row"><span>Hinges (${item.doors} door${item.doors > 1 ? 's' : ''} × 2)</span><span>${fmt(b.hingeCost)}</span></div>` : ''}
          ${item.drawers > 0 ? `<div class="breakdown-row"><span>Drawer sets (${item.drawers} drawer${item.drawers > 1 ? 's' : ''})</span><span>${fmt(b.drawerHwCost)}</span></div>` : ''}

          <div class="breakdown-row section-header"><span>Labour</span></div>
          <div class="breakdown-row"><span>Cutting / Machining</span><span>${fmt(b.cuttingCost)}</span></div>
          <div class="breakdown-row"><span>Assembly</span><span>${fmt(b.assemblyCost)}</span></div>
          <div class="breakdown-row"><span>Installation</span><span>${fmt(b.installationCost)}</span></div>

          <div class="breakdown-row section-header"><span>Subtotals (with markup)</span></div>
          <div class="breakdown-row"><span>Materials</span><span>${fmt(b.materialTotal)}</span></div>
          ${b.faceTotal > 0    ? `<div class="breakdown-row"><span>Face material</span><span>${fmt(b.faceTotal)}</span></div>` : ''}
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
      <span>Grand Total (${result.items.length} cabinets)</span>
      <span>${fmt(result.grandTotal)} AUD</span>
    </div>
  ` : '';

  outputEl.innerHTML = `
    <h2 class="results-heading">Estimate Results</h2>
    ${itemsHTML}
    ${grandHTML}
  `;
  outputEl.classList.add('visible');
}

// ─── Start ────────────────────────────────────────────────────────────────────

init();
