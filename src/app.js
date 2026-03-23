import { estimateCabinet } from './estimator.js';

// --- DOM Elements ---
const outputEl = document.getElementById('output');
const estimateBtn = document.getElementById('estimateBtn');

// --- App State ---
let configCache = {};

// --- Init App ---
async function init() {
  await loadTheme();
  bindEvents();
}

// --- Load Theme (from theme.json) ---
async function loadTheme() {
  const res = await fetch('/config/theme.json');
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

// --- Get Input Values (future form-ready) ---
function getInputValues() {
  return {
    type: "base",
    width: 900,
    height: 720,
    depth: 560
  };
}

// --- Render Output ---
function renderResult(result) {
  outputEl.textContent = JSON.stringify(result, null, 2);
}

// --- Start App ---
init();