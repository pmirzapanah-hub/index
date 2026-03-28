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
  const totalArea    = panelAreas.reduce((sum, a) => sum + a, 0);
  const sheetArea    = boardSpec.sheetSize[0] * boardSpec.sheetSize[1];
  const sheetsNeeded = Math.ceil((totalArea / sheetArea) / (1 - boardSpec.wasteFactor));
  const boardCost    = sheetsNeeded * boardSpec.costPerSheet;
  const cuttingCost  = sheetsNeeded * cuttingRate;
  return { sheetsNeeded, boardCost, cuttingCost };
}

// ─── Width Validation ─────────────────────────────────────────────────────────

/**
 * Validate cabinet width against doors and drawer units.
 *
 * input.doors       = number of doors (each ≤ maxDoorWidth)
 * input.doorWidth   = actual door width (auto = cabinet width / doors, capped at max)
 * input.drawerUnits = [{ width, count }]  — each unit has width + stacked drawer count
 */
export function validateWidth(input, limits) {
  const { width, doors = 0, drawerUnits = [] } = input;
  const { maxDoorWidth } = limits;

  const warnings = [];

  // Door width: evenly split across door count
  const doorWidth = doors > 0 ? Math.floor(width / doors) : 0;
  if (doors > 0 && doorWidth > maxDoorWidth) {
    warnings.push(`Each door would be ${doorWidth}mm — max is ${maxDoorWidth}mm. Consider adding more doors.`);
  }

  // Used width from drawer units
  const usedByDrawers = drawerUnits.reduce((sum, u) => sum + (u.width || 0), 0);

  // Used width from doors (capped at maxDoorWidth each)
  const usedByDoors = doors * Math.min(doorWidth, maxDoorWidth);

  const usedWidth = usedByDoors + usedByDrawers;
  const gap       = Math.max(0, width - usedWidth);

  return { warnings, usedByDoors, usedByDrawers, usedWidth, gap, doorWidth };
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

// ─── Face Panel Areas ─────────────────────────────────────────────────────────

function buildFacePanelAreas(input, rules) {
  const {
    width, height, depth,
    doors = 0,
    drawerUnits = [],
    drawerFaceHeight = 200,
    endBoardLeft  = false,
    endBoardRight = false,
    appliances    = []
  } = input;

  const { maxDoorWidth } = rules.limits;
  const areas = [];

  // Door faces
  if (doors > 0) {
    const doorW = Math.min(Math.floor(width / doors), maxDoorWidth);
    for (let i = 0; i < doors; i++) areas.push(doorW * height);
  }

  // Drawer unit faces — each drawer in the unit gets a face panel
  drawerUnits.forEach(unit => {
    const drawerW = unit.width || 600;
    const count   = unit.count || 1;
    for (let i = 0; i < count; i++) {
      areas.push(drawerW * drawerFaceHeight);
    }
  });

  // End boards (height × depth, same MDF)
  if (endBoardLeft)  areas.push(height * depth);
  if (endBoardRight) areas.push(height * depth);

  // Appliance reveal panels
  appliances.forEach(appl => {
    const rule  = rules.appliances[appl.type];
    const count = rule?.extraFaceboards ?? 0;
    for (let i = 0; i < count; i++) areas.push(height * depth);
  });

  return areas;
}

// ─── Single Cabinet Estimator ─────────────────────────────────────────────────

function estimateSingleCabinet(input, materials, pricing, rules) {
  const { width, height, depth } = input;
  const cabinetRule = rules.cabinetTypes[input.type];
  if (!cabinetRule) throw new Error(`Unknown cabinet type: "${input.type}"`);

  const shelves     = input.shelves ?? evaluateFormula(rules.formulas.shelves, { height });
  const doors       = input.doors   ?? cabinetRule.typicalDoors ?? 0;
  const drawerUnits = input.drawerUnits || [];

  // Total individual drawer count across all units
  const totalDrawers = drawerUnits.reduce((sum, u) => sum + (u.count || 1), 0);

  // Width validation
  const { warnings, gap, doorWidth } = validateWidth({ ...input, doors, drawerUnits }, rules.limits);

  // Appliances
  const appliances = input.appliances || [];
  const totalApplianceWidth = appliances.reduce((sum, a) => {
    return sum + (a.width ?? rules.appliances[a.type]?.defaultWidth ?? 0);
  }, 0);
  const remainingGap = Math.max(0, gap - totalApplianceWidth);
  if (remainingGap > 50 && appliances.length > 0) {
    warnings.push(`${remainingGap}mm unaccounted gap remaining after appliances.`);
  }

  // ── Carcass ──
  const carcassBoard = materials.board[0];
  const carcassPanelAreas = carcassPanels({ ...input, shelves }, cabinetRule);
  const {
    sheetsNeeded: carcassSheets,
    boardCost:    carcassBoardCost,
    cuttingCost:  carcassCuttingCost
  } = calcSheets(carcassPanelAreas, carcassBoard, pricing.labour.cuttingPerSheet);

  // ── Face boards ──
  const faceBoardId = input.faceMaterial || 'mdf_18';
  const faceBoard   = materials.doorFace.find(b => b.id === faceBoardId) || materials.doorFace[1];
  const faceAreas   = buildFacePanelAreas({ ...input, doors, drawerUnits, appliances }, rules);

  let faceSheets = 0, faceBoardCost = 0, faceCuttingCost = 0;
  if (faceAreas.length > 0) {
    ({ sheetsNeeded: faceSheets, boardCost: faceBoardCost, cuttingCost: faceCuttingCost }
      = calcSheets(faceAreas, faceBoard, pricing.labour.cuttingPerSheet));
  }

  // ── Hardware ──
  const hingeUnit    = materials.hardware.find(h => h.id === 'hinge_soft_close');
  const hingeCost    = doors         * 2 * (hingeUnit?.cost ?? 0);
  const drawerHwCost = totalDrawers  * pricing.hardware.drawerSetCost;

  // ── Labour ──
  const assemblyCost     = pricing.labour.assemblyPerCabinet;
  const installationCost = pricing.labour.installationPerCabinet;
  const totalCuttingCost = carcassCuttingCost + faceCuttingCost;

  // ── Totals ──
  const materialTotal = (carcassBoardCost + hingeCost) * pricing.margin.materialMarkup;
  const faceTotal     = faceBoardCost * pricing.margin.doorFaceMarkup;
  const drawerHwTotal = drawerHwCost  * pricing.margin.materialMarkup;
  const labourTotal   = (assemblyCost + installationCost + totalCuttingCost) * pricing.margin.labourMarkup;
  const total         = Math.max(materialTotal + faceTotal + drawerHwTotal + labourTotal, pricing.minimumCharge);

  const endBoardCount      = (input.endBoardLeft ? 1 : 0) + (input.endBoardRight ? 1 : 0);
  const applianceFaceCount = appliances.reduce((s, a) => s + (rules.appliances[a.type]?.extraFaceboards ?? 0), 0);

  return {
    label:             input.label || cabinetRule.label,
    cabinetType:       input.type,
    dimensions:        { width, height, depth },
    shelves, doors, drawerUnits, totalDrawers,
    doorWidth,
    faceMaterial:      faceBoard.name,
    carcassSheets, faceSheets,
    gap, warnings, appliances,
    endBoardLeft:      input.endBoardLeft  || false,
    endBoardRight:     input.endBoardRight || false,
    endBoardCount, applianceFaceCount,
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

// ─── Public API ───────────────────────────────────────────────────────────────

export async function estimateCabinet(input) {
  const { materials, pricing, rules } = await loadConfig();
  return estimateSingleCabinet(input, materials, pricing, rules);
}

export async function estimateRoom(items) {
  const { materials, pricing, rules } = await loadConfig();

  // ── Step 1: Estimate each cabinet individually for per-cabinet breakdown ──
  const results = items.map(item => estimateSingleCabinet(item, materials, pricing, rules));

  // ── Step 2: Pool ALL carcass and face areas across every cabinet ──────────
  // This gives the true sheet count — partial sheets from different cabinets
  // nest together, so 20 cabinets × 0.5 sheets = 10 sheets (not 20).
  const carcassBoard = materials.board[0];
  const faceBoard    = materials.doorFace.find(b => b.id === 'mdf_18') || materials.doorFace[1];

  let totalCarcassArea = 0;
  let totalFaceArea    = 0;

  results.forEach(r => {
    // Back-calculate raw area from per-cabinet sheet costs
    // Instead, re-collect panel areas directly from each result
    totalCarcassArea += r._carcassAreaMm2 || 0;
    totalFaceArea    += r._faceAreaMm2    || 0;
  });

  const pooledCarcassSheets = Math.ceil(
    (totalCarcassArea / (carcassBoard.sheetSize[0] * carcassBoard.sheetSize[1])) /
    (1 - carcassBoard.wasteFactor)
  );
  const pooledFaceSheets = Math.ceil(
    (totalFaceArea / (faceBoard.sheetSize[0] * faceBoard.sheetSize[1])) /
    (1 - faceBoard.wasteFactor)
  );

  // ── Step 3: Recalculate costs based on pooled sheet counts ────────────────
  const pooledCarcassCost   = pooledCarcassSheets * carcassBoard.costPerSheet;
  const pooledFaceCost      = pooledFaceSheets    * faceBoard.costPerSheet;
  const pooledCuttingCost   = (pooledCarcassSheets + pooledFaceSheets) * pricing.labour.cuttingPerSheet;

  const grandTotal = +results.reduce((sum, r) => sum + r.total, 0).toFixed(2);

  return {
    items: results,
    grandTotal,
    pooled: {
      carcassSheets:  pooledCarcassSheets,
      faceSheets:     pooledFaceSheets,
      carcassCost:    +pooledCarcassCost.toFixed(2),
      faceCost:       +pooledFaceCost.toFixed(2),
      cuttingCost:    +pooledCuttingCost.toFixed(2),
      totalSheets:    pooledCarcassSheets + pooledFaceSheets
    }
  };
}
