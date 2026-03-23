import { estimateCabinet } from './estimator.js';

// --- DOM Elements ---
const outputEl = document.getElementById('output');
const estimateBtn = document.getElementById('estimateBtn');

// --- Init App ---
async function init() {
  await loadTheme();
  bindEvents();
}

// --- Load Theme (from theme.json) ---
async function loadTheme() {
  const res = await fetch('/index/config/theme.json');
  const theme = await res.json();

  document.body.style.backgroundColor = theme.secondaryColor;
  document.body.style.color = "#fff";

  document.title = theme.brandName;
}

// --- Bind UI Events ---
function bindEvents() {
  estimateBtn.addEventListener('click', handleEstimate);
}

// --- Handle Estimate ---
async function handleEstimate() {
  try {
    const input = getInputValues();
    const result = await estimateCabinet(input);
    renderResult(result);
  } catch (err) {
    console.error(err);
    outputEl.innerHTML = `<div class="error">Error calculating estimate: ${err.message}</div>`;
    outputEl.classList.add('visible');
  }
}

// --- Get Input Values from form ---
function getInputValues() {
  return {
    type:   document.getElementById('type').value,
    width:  parseInt(document.getElementById('width').value, 10),
    height: parseInt(document.getElementById('height').value, 10),
    depth:  parseInt(document.getElementById('depth').value, 10)
  };
}

// --- Render Output ---
function renderResult(result) {
  const el = outputEl;
  const fmt = (n) => `$${n.toFixed(2)} AUD`;
  const b = result.breakdown;

  el.innerHTML = `
    <h2>Estimate Summary</h2>
    <div class="breakdown">
      <div class="breakdown-row section-header"><span>Materials</span></div>
      <div class="breakdown-row"><span>Board (${result.sheetsNeeded} sheet${result.sheetsNeeded !== 1 ? 's' : ''})</span><span>${fmt(b.boardCost)}</span></div>
      <div class="breakdown-row"><span>Hardware (${result.hinges} hinges)</span><span>${fmt(b.hardwareCost)}</span></div>

      <div class="breakdown-row section-header"><span>Labour</span></div>
      <div class="breakdown-row"><span>Cutting / Machining</span><span>${fmt(b.cuttingCost)}</span></div>
      <div class="breakdown-row"><span>Assembly</span><span>${fmt(b.assemblyCost)}</span></div>
      <div class="breakdown-row"><span>Installation</span><span>${fmt(b.installationCost)}</span></div>

      <div class="breakdown-row section-header"><span>Subtotals (with markup)</span></div>
      <div class="breakdown-row"><span>Materials subtotal</span><span>${fmt(b.materialTotal)}</span></div>
      <div class="breakdown-row"><span>Labour subtotal</span><span>${fmt(b.labourTotal)}</span></div>
    </div>
    <div class="total-row">
      <span>Total Estimate</span>
      <span>${fmt(result.total)}</span>
    </div>
  `;
  el.classList.add('visible');
}

// --- Start App ---
init();
