console.log("APP JS LOADED");
alert("JS is working");

import { estimateCabinet } from './srcestimator.js';

document.addEventListener('DOMContentLoaded', init);

function init() {
  const estimateBtn = document.getElementById('estimateBtn');

  if (!estimateBtn) {
    console.error("Button not found");
    return;
  }

  estimateBtn.addEventListener('click', handleEstimate);
}

async function handleEstimate() {
  const outputEl = document.getElementById('output');

  try {
    outputEl.textContent = "Calculating...";

    const input = {
      type: document.getElementById('type').value,
      width: Number(document.getElementById('width').value),
      height: Number(document.getElementById('height').value),
      depth: Number(document.getElementById('depth').value)
    };

    const result = await estimateCabinet(input);

    outputEl.textContent = JSON.stringify(result, null, 2);

  } catch (err) {
    console.error(err);
    outputEl.textContent = "Error: " + err.message;
  }
}
