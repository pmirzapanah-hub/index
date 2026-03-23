async function loadConfig() {
  const [materials, pricing, rules] = await Promise.all([
    fetch('/config/materials.json').then(r => r.json()),
    fetch('/config/pricing.json').then(r => r.json()),
    fetch('/config/rules.json').then(r => r.json())
  ]);

  return { materials, pricing, rules };
}

function evaluateFormula(formula, variables) {
  let expr = formula;

  Object.keys(variables).forEach(key => {
    expr = expr.replaceAll(key, variables[key]);
  });

  expr = expr.replace(/ceil/g, "Math.ceil");

  return eval(expr);
}

/**
 * Calculate how many sheets of board are needed for a cabinet,
 * accounting for the waste factor.
 */
function calculateMaterialCost(input, board, pricing) {
  const { width, height, depth } = input;

  // Cabinet panels: 2 sides, top, bottom, back (simplified)
  const panelAreas = [
    depth * height,   // left side
    depth * height,   // right side
    width * depth,    // top
    width * depth,    // bottom
    width * height    // back
  ];

  const totalArea = panelAreas.reduce((sum, a) => sum + a, 0); // mm²
  const sheetArea = board.sheetSize[0] * board.sheetSize[1];   // mm²

  // Apply waste factor — we need more sheets to account for offcuts
  const sheetsNeeded = Math.ceil((totalArea / sheetArea) / (1 - board.wasteFactor));

  const boardCost = sheetsNeeded * board.costPerSheet;
  const cuttingCost = sheetsNeeded * pricing.labour.cuttingPerSheet;

  return { boardCost, cuttingCost, sheetsNeeded };
}

export async function estimateCabinet(input) {
  const { materials, pricing, rules } = await loadConfig();

  const { width, height, depth } = input;

  // --- Rules / formulas ---
  const shelves = evaluateFormula(rules.formulas.shelves, { height });
  const hinges  = evaluateFormula(rules.formulas.hinges,  { height });

  // --- Material cost (uses real materials.json data) ---
  const board = materials.board[0]; // White Melamine 16mm
  const { boardCost, cuttingCost, sheetsNeeded } = calculateMaterialCost(input, board, pricing);

  // --- Hardware cost ---
  const hingeUnit    = materials.hardware.find(h => h.id === 'hinge_soft_close');
  const hardwareCost = hinges * (hingeUnit ? hingeUnit.cost : 0);

  // --- Labour cost ---
  const labourCost =
    pricing.labour.assemblyPerCabinet +
    pricing.labour.installationPerCabinet;

  // --- Totals with markups ---
  const materialTotal = (boardCost + hardwareCost) * pricing.margin.materialMarkup;
  const labourTotal   = (labourCost + cuttingCost) * pricing.margin.labourMarkup;
  const total         = Math.max(materialTotal + labourTotal, pricing.minimumCharge);

  return {
    cabinetType:    input.type,
    dimensions:     { width, height, depth },
    shelves,
    hinges,
    sheetsNeeded,
    breakdown: {
      boardCost:    +boardCost.toFixed(2),
      hardwareCost: +hardwareCost.toFixed(2),
      cuttingCost:  +cuttingCost.toFixed(2),
      labourCost:   +labourCost.toFixed(2),
      materialTotal: +materialTotal.toFixed(2),
      labourTotal:   +labourTotal.toFixed(2)
    },
    total: +total.toFixed(2)
  };
}
