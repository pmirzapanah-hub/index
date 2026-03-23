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
  const res = await fetch('../config/theme.json');
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
    outputEl.textContent = "Error calculating estimate.";
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
  outputEl.textContent = JSON.stringify(result, null, 2);
}

// --- Start App ---
init();
