// ─── Config Loader ────────────────────────────────────────────────────────────

async function loadConfig() {
  const [materials, pricing, rules] = await Promise.all([
    fetch('/index/config/materials.json').then(r => r.json()),
    fetch('/index/config/pricing.json').then(r => r.json()),
    fetch('/index/config/rules.json').then(r => r.json())
  ]);
  return { materials, pricing, rules };
}

// ─── Formula Evaluator ────────────────────────────────────────────────────────

function evaluateFormula(formula, variables) {
  let expr = formula;
  Object.keys(variables).forEach(key => {
    expr = expr.replaceAll(key, variables[key]);
  });
  expr = expr.replace(/ceil/g, "Math.ceil");
  return eval(expr);
}

// ─── Sheet Calculator ─────────────────────────────────────────────────────────

function calcSheets(panelAreas, boardSpec, cuttingRate) {
  const totalArea   = panelAreas.reduce((sum, a) => sum + a, 0);
  const sheetArea   = boardSpec.sheetSize[0] * boardSpec.sheetSize[1];
  const sheetsNeeded = Math.ceil((totalArea / sheetArea) / (1 - boardSpec.wasteFactor));
  const boardCost   = sheetsNeeded * boardSpec.costPerSheet;
  const cuttingCost = sheetsNeeded * cuttingRate;
  return { sheetsNeeded, boardCost, cuttingCost };
}

// ─── Carcass Panels ───────────────────────────────────────────────────────────

function carcassPanels(input, cabinetRule) {
  const { width, height, depth, shelves = 0 } = input;
  const panels = [];
  panels.push(depth * height); // left side
  panels.push(depth * height); // right side
  panels.push(width * height); // back
  if (cabinetRule.panels.includes('top'))    panels.push(width * depth);
  if (cabinetRule.panels.includes('bottom')) panels.push(width * depth);
  for (let i = 0; i < shelves; i++) panels.push(width * depth);
  return panels;
}

// ─── Door Face Panels ─────────────────────────────────────────────────────────

function doorFacePanels(input) {
  const { width, height, doors = 0 } = input;
  if (!doors) return [];
  const doorWidth = doors > 1 ? Math.floor(width / doors) : width;
  return Array(doors).fill(doorWidth * height);
}

// ─── Drawer Face Panels ───────────────────────────────────────────────────────

function drawerFacePanels(input) {
  const { width, drawers = 0, drawerFaceHeight = 200 } = input;
  if (!drawers) return [];
  return Array(drawers).fill(width * drawerFaceHeight);
}

// ─── Single Cabinet Estimator ─────────────────────────────────────────────────

function estimateSingleCabinet(input, materials, pricing, rules) {
  const { width, height, depth } = input;
  const cabinetRule = rules.cabinetTypes[input.type];
  if (!cabinetRule) throw new Error(`Unknown cabinet type: "${input.type}"`);

  const shelves = input.shelves ?? evaluateFormula(rules.formulas.shelves, { height });
  const doors   = input.doors   ?? cabinetRule.typicalDoors   ?? 0;
  const drawers = input.drawers ?? cabinetRule.typicalDrawers ?? 0;

  // Carcass (cheap melamine board)
  const carcassBoard = materials.board[0];
  const carcassPanelAreas = carcassPanels({ ...input, shelves }, cabinetRule);
  const {
    sheetsNeeded: carcassSheets,
    boardCost:    carcassBoardCost,
    cuttingCost:  carcassCuttingCost
  } = calcSheets(carcassPanelAreas, carcassBoard, pricing.labour.cuttingPerSheet);

  // Door / drawer faces (MDF)
  const faceBoardId = input.faceMaterial || 'mdf_18';
  const faceBoard   = materials.doorFace.find(b => b.id === faceBoardId) || materials.doorFace[1];
  const facePanelAreas = [...doorFacePanels({ ...input, doors }), ...drawerFacePanels({ ...input, drawers })];

  let faceSheets = 0, faceBoardCost = 0, faceCuttingCost = 0;
  if (facePanelAreas.length > 0) {
    ({ sheetsNeeded: faceSheets, boardCost: faceBoardCost, cuttingCost: faceCuttingCost }
      = calcSheets(facePanelAreas, faceBoard, pricing.labour.cuttingPerSheet));
  }

  // Hardware
  const hingeUnit   = materials.hardware.find(h => h.id === 'hinge_soft_close');
  const hingeCost   = doors * 2 * (hingeUnit?.cost ?? 0); // 2 hinges per door
  const drawerHwCost = drawers * pricing.hardware.drawerSetCost;

  // Labour
  const assemblyCost     = pricing.labour.assemblyPerCabinet;
  const installationCost = pricing.labour.installationPerCabinet;
  const totalCuttingCost = carcassCuttingCost + faceCuttingCost;

  // Totals with markups
  const materialTotal = (carcassBoardCost + hingeCost) * pricing.margin.materialMarkup;
  const faceTotal     = faceBoardCost * pricing.margin.doorFaceMarkup;
  const drawerHwTotal = drawerHwCost  * pricing.margin.materialMarkup;
  const labourTotal   = (assemblyCost + installationCost + totalCuttingCost) * pricing.margin.labourMarkup;
  const total         = Math.max(materialTotal + faceTotal + drawerHwTotal + labourTotal, pricing.minimumCharge);

  return {
    label:        input.label || cabinetRule.label,
    cabinetType:  input.type,
    dimensions:   { width, height, depth },
    shelves,
    doors,
    drawers,
    faceMaterial: faceBoard.name,
    carcassSheets,
    faceSheets,
    breakdown: {
      carcassBoardCost:  +carcassBoardCost.toFixed(2),
      faceBoardCost:     +faceBoardCost.toFixed(2),
      hingeCost:         +hingeCost.toFixed(2),
      drawerHwCost:      +drawerHwCost.toFixed(2),
      cuttingCost:       +totalCuttingCost.toFixed(2),
      assemblyCost:      +assemblyCost.toFixed(2),
      installationCost:  +installationCost.toFixed(2),
      materialTotal:     +materialTotal.toFixed(2),
      faceTotal:         +faceTotal.toFixed(2),
      drawerHwTotal:     +drawerHwTotal.toFixed(2),
      labourTotal:       +labourTotal.toFixed(2)
    },
    total: +total.toFixed(2)
  };
}

// ─── Public: Single Cabinet ───────────────────────────────────────────────────

export async function estimateCabinet(input) {
  const { materials, pricing, rules } = await loadConfig();
  return estimateSingleCabinet(input, materials, pricing, rules);
}

// ─── Public: Full Room (multiple cabinets) ────────────────────────────────────

export async function estimateRoom(items) {
  const { materials, pricing, rules } = await loadConfig();
  const results    = items.map(item => estimateSingleCabinet(item, materials, pricing, rules));
  const grandTotal = +results.reduce((sum, r) => sum + r.total, 0).toFixed(2);
  return { items: results, grandTotal };
}
