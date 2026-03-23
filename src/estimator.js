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

// ─── Gap / Width Validation ───────────────────────────────────────────────────

/**
 * Work out the used width (doors + drawers) vs total cabinet width.
 * Returns warnings and the leftover gap.
 *
 * Rules:
 *   - Max door width:   450mm  → doors wider than this need splitting
 *   - Max drawer width: 900mm  → drawers wider than this need splitting
 */
export function validateWidth(input, limits) {
  const { width, doors = 0, drawers = 0 } = input;
  const { maxDoorWidth, maxDrawerWidth } = limits;

  const warnings = [];

  // Door width check
  if (doors > 0) {
    const doorWidth = Math.floor(width / (doors + drawers || 1));
    if (doorWidth > maxDoorWidth) {
      warnings.push(`Door width (${doorWidth}mm) exceeds max ${maxDoorWidth}mm. Consider adding more doors or splitting the run.`);
    }
  }

  // Drawer width check
  if (drawers > 0 && width > maxDrawerWidth) {
    warnings.push(`Cabinet width (${width}mm) exceeds max drawer width of ${maxDrawerWidth}mm.`);
  }

  // Used width = doors × maxDoorWidth + drawers × maxDrawerWidth (capped at cabinet width)
  const usedByDoors   = doors   * maxDoorWidth;
  const usedByDrawers = drawers * maxDrawerWidth;
  const usedWidth     = usedByDoors + usedByDrawers;
  const gap           = Math.max(0, width - usedWidth);

  return { warnings, usedWidth: Math.min(usedWidth, width), gap };
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

/**
 * Calculate face panel areas for doors, drawers, end boards, and appliance gaps.
 *
 * End boards: height × depth (same MDF as door/drawer faces).
 * Appliance gap faces: 2 extra faceboards per appliance (left + right reveal panels).
 */
function facePanelAreas(input, rules) {
  const {
    width, height, depth,
    doors = 0, drawers = 0,
    drawerFaceHeight = 200,
    endBoardLeft  = false,
    endBoardRight = false,
    appliances = []   // [{ type, width }]
  } = input;

  const { maxDoorWidth, maxDrawerWidth } = rules.limits;
  const areas = [];

  // Door faces — width capped per door
  if (doors > 0) {
    const doorW = Math.min(Math.floor(width / doors), maxDoorWidth);
    for (let i = 0; i < doors; i++) areas.push(doorW * height);
  }

  // Drawer faces — full cabinet width, capped
  if (drawers > 0) {
    const drawerW = Math.min(width, maxDrawerWidth);
    for (let i = 0; i < drawers; i++) areas.push(drawerW * drawerFaceHeight);
  }

  // End boards — height × depth (side panel, same MDF)
  if (endBoardLeft)  areas.push(height * depth);
  if (endBoardRight) areas.push(height * depth);

  // Appliance extra faceboards
  // Each appliance with extraFaceboards > 0 adds that many panels (height × depth each)
  appliances.forEach(appl => {
    const rule = rules.appliances[appl.type];
    if (!rule) return;
    const count = rule.extraFaceboards ?? 0;
    for (let i = 0; i < count; i++) areas.push(height * depth);
  });

  return areas;
}

// ─── Single Cabinet Estimator ─────────────────────────────────────────────────

function estimateSingleCabinet(input, materials, pricing, rules) {
  const { width, height, depth } = input;
  const cabinetRule = rules.cabinetTypes[input.type];
  if (!cabinetRule) throw new Error(`Unknown cabinet type: "${input.type}"`);

  const shelves  = input.shelves  ?? evaluateFormula(rules.formulas.shelves, { height });
  const doors    = input.doors    ?? cabinetRule.typicalDoors   ?? 0;
  const drawers  = input.drawers  ?? cabinetRule.typicalDrawers ?? 0;

  // Width validation & gap
  const { warnings, gap } = validateWidth({ ...input, doors, drawers }, rules.limits);

  // Appliances in the gap
  const appliances = input.appliances || [];
  const totalApplianceWidth = appliances.reduce((sum, a) => {
    const rule = rules.appliances[a.type];
    return sum + (a.width ?? rule?.defaultWidth ?? 0);
  }, 0);
  const remainingGap = Math.max(0, gap - totalApplianceWidth);
  if (remainingGap > 0 && appliances.length > 0) {
    warnings.push(`${remainingGap}mm unaccounted gap after appliances.`);
  }

  // ── Carcass ──
  const carcassBoard = materials.board[0];
  const carcassPanelAreas = carcassPanels({ ...input, shelves }, cabinetRule);
  const {
    sheetsNeeded: carcassSheets,
    boardCost:    carcassBoardCost,
    cuttingCost:  carcassCuttingCost
  } = calcSheets(carcassPanelAreas, carcassBoard, pricing.labour.cuttingPerSheet);

  // ── Face boards (MDF) ──
  const faceBoardId  = input.faceMaterial || 'mdf_18';
  const faceBoard    = materials.doorFace.find(b => b.id === faceBoardId) || materials.doorFace[1];
  const faceAreas    = facePanelAreas({ ...input, doors, drawers, appliances }, rules);

  let faceSheets = 0, faceBoardCost = 0, faceCuttingCost = 0;
  if (faceAreas.length > 0) {
    ({ sheetsNeeded: faceSheets, boardCost: faceBoardCost, cuttingCost: faceCuttingCost }
      = calcSheets(faceAreas, faceBoard, pricing.labour.cuttingPerSheet));
  }

  // ── Hardware ──
  const hingeUnit    = materials.hardware.find(h => h.id === 'hinge_soft_close');
  const hingeCost    = doors   * 2 * (hingeUnit?.cost ?? 0);
  const drawerHwCost = drawers * pricing.hardware.drawerSetCost;

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

  // ── Extra face count for display ──
  const endBoardCount    = (input.endBoardLeft ? 1 : 0) + (input.endBoardRight ? 1 : 0);
  const applianceFaceCount = appliances.reduce((sum, a) => {
    return sum + (rules.appliances[a.type]?.extraFaceboards ?? 0);
  }, 0);

  return {
    label:             input.label || cabinetRule.label,
    cabinetType:       input.type,
    dimensions:        { width, height, depth },
    shelves, doors, drawers,
    faceMaterial:      faceBoard.name,
    carcassSheets,
    faceSheets,
    gap,
    warnings,
    appliances,
    endBoardLeft:      input.endBoardLeft  || false,
    endBoardRight:     input.endBoardRight || false,
    endBoardCount,
    applianceFaceCount,
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

// ─── Public: Full Room ────────────────────────────────────────────────────────

export async function estimateRoom(items) {
  const { materials, pricing, rules } = await loadConfig();
  const results    = items.map(item => estimateSingleCabinet(item, materials, pricing, rules));
  const grandTotal = +results.reduce((sum, r) => sum + r.total, 0).toFixed(2);
  return { items: results, grandTotal };
}
