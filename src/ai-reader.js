// ─── AI Plan Reader (Claude via cabinet-estimator-proxy) ─────────────────────
// Uses cabinet-estimator-proxy.p-mirzapanah.workers.dev
// Anthropic API key stored safely as Worker secret — never in browser
// ─────────────────────────────────────────────────────────────────────────────

const WORKER_URL = 'https://cabinet-estimator-proxy.p-mirzapanah.workers.dev';

// ── Sheet nesting constants ───────────────────────────────────────────────────
const SHEET = {
  W: 2420, H: 1210,
  efficiency: 0.80,
  wasteFactor: 1.10
};
const EFFECTIVE_AREA = SHEET.W * SHEET.H * SHEET.efficiency;

function sheetsRequired(totalAreaMm2) {
  if (totalAreaMm2 <= 0) return 0;
  return Math.ceil((totalAreaMm2 / EFFECTIVE_AREA) * SHEET.wasteFactor);
}

// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt() {
  return `You are a professional cabinet estimator with deep knowledge of Mozaik cut-list plans.

CABINET FUNDAMENTALS:
- Carcass parts (structural box): White HMR Melamine 16mm
  Part codes: UB (upper back), UEL/UER (sides), BOT (bottom), TOP (top), FrS (front rail), Dba/Dbm (drawer base), AdjSh (shelf)
- Door & drawer front parts: MDF board (default 18mm unless plan states otherwise)
  Part codes: Door(L), Door(R), Dwr (drawer front)
- Finished/applied panels: same MDF as doors (18mm default)

HARDWARE RULES:
- Each door = 2 hinges (standard). If door height > 900mm = 3 hinges.
- Each drawer front (Dwr) = 1 pair of drawer runner slides
- Each door = 1 handle. Each drawer = 1 handle.
- Each AdjSh (adjustable shelf) = 4 shelf pins
- Each base cabinet (has BOT panel) = 4 adjustable legs
- Corner/blind base cabinets = 6 legs
- Edge banding: E1 = white ABS (carcass visible), E3 = MDF door match (all 4 sides)

SHEET NESTING:
- Standard sheet: 2420 × 1210mm
- Saw kerf: 13mm between parts
- Trim: 5mm all four edges
- Yield efficiency: 80% conservative
- Add 10% waste buffer, always round UP

CABINET TYPE DETECTION:
- Has Door parts → has hinges
- Has Dwr parts → has drawer runners
- Has UB (upper back) → wall/overhead cabinet
- Has BOT (base) → base cabinet
- Tall cabinet → end panel height typically > 900mm

PART CODE TABLE:
UB=upper back (HMR 16mm), UEL=upper end left (HMR 16mm), UER=upper end right (HMR 16mm),
BOT=base panel (HMR 16mm), TOP=top panel (HMR 16mm), FrS=front rail (HMR 16mm),
Dba=drawer base (HMR 16mm), Dbm=drawer mid (HMR 16mm), AdjSh=shelf (HMR 16mm),
Door(L)=left door (MDF 18mm), Door(R)=right door (MDF 18mm), Dwr=drawer front (MDF 18mm)

Parts with E1/E4 edging = carcass HMR. Parts with E3 edging = MDF/door panels.`;
}

// ── Description prompt — auto-detect and read ────────────────────────────────
function buildDescriptionPrompt() {
  return `You are reading a cabinet document. First identify what type of document this is, then extract cabinet data accordingly.

═══ STEP 1: IDENTIFY DOCUMENT TYPE ═══

Scan the document and determine which type it is:
TYPE A — Mozaik Cabinet List: Has a structured table with columns "ID, Name, Width, Height, Depth, Description" and cabinet IDs like R1C1, R1C2 etc.
TYPE B — Floor plan / elevation drawing: Has cabinet outlines with dimension labels and cabinet numbers like #1, #2 etc.
TYPE C — Kitchen photo or render: A real or rendered photograph of a kitchen.

Write "DOCUMENT TYPE: A" or "DOCUMENT TYPE: B" or "DOCUMENT TYPE: C" at the top.

═══ STEP 2A: IF MOZAIK CABINET LIST (Type A) ═══

Read the Cabinet List table. EXCLUDE rows containing: Kickboard, Filler, Bulkhead, End Panel, Bar Back, Dishwasher (PR), Edge Filler.

For each remaining row:
- type: "base" if Height ~720-900mm, "wall" if Height ~400-760mm and depth ≤400, "tall" if Height >1200mm
- doors: from Description — "2 Doors"=2, "1 Door"=1, "Open"=0, "Rangehood"=0
- drawers: from Description — "3 Drw"=3, "1 Drw"=1, else 0

FORMAT:
R1C1: base | W=300 H=870 D=580 | doors=0 drawers=1
R1C2: base | W=987 H=870 D=580 | doors=1 drawers=0
(every non-excluded row)

═══ STEP 2B: IF FLOOR PLAN / ELEVATION (Type B) ═══

Read cabinet numbers and dimensions from the drawings.
For each cabinet number (#1, #2 etc or labeled cabinets):
- Identify width from dimension labels
- Identify type from context (base=below bench, wall=above bench, tall=full height)
- Count doors and drawers from the elevation view

FORMAT:
Cabinet #1: base | est. width=300mm | doors=0 drawers=1
Cabinet #2: base | est. width=987mm | doors=1 drawers=0

═══ STEP 2C: IF PHOTO (Type C) ═══

Estimate from visual inspection:
- Count visible door panels and drawer fronts
- Estimate widths: single door≈600mm, double door≈900mm, drawer bank≈600mm
- Standard heights: base=720mm, wall=700mm, tall=2100mm

FORMAT:
Cabinet 1: base | est. width=600mm | doors=1 drawers=0 confidence=high
Cabinet 2: wall | est. width=600mm | doors=2 drawers=0 confidence=medium

═══ STEP 3: FINAL TALLY (all types) ═══

TOTAL BASE: X
TOTAL WALL: X
TOTAL TALL: X
TOTAL DOORS: X
TOTAL DRAWERS: X`;
}

// ── Description prompt — photo/visual mode ────────────────────────────────────
function buildPhotoPrompt() {
  return `You are looking at a photo of a kitchen or cabinet installation. Estimate the cabinets you can see.

STEP 1 — DETECT INPUT TYPE:
First decide: is this a kitchen photo/render, or a technical plan/cut-list?
- If it is a PHOTO or RENDER: continue with estimation below
- If it is a PLAN/CUT-LIST: reply with "TYPE:CUTLIST" and stop — do not estimate

STEP 2 — COUNT AND ESTIMATE (photos only):
Scan the image systematically left to right.

For BASE cabinets (below benchtop):
- Count each door panel as one door unit
- Estimate width: single door ≈ 450–600mm, double door ≈ 900mm, drawer bank ≈ 450–600mm
- Standard base height: 720mm, depth: 560mm

For WALL/OVERHEAD cabinets (above benchtop):
- Count each door panel
- Estimate width same as above
- Standard wall height: 700mm, depth: 320mm

For TALL cabinets / towers (full height):
- Note any oven towers, pantry units, fridge surrounds
- Standard tall height: 2100–2400mm

FORMAT each cabinet:
Cabinet 1: [type] | est. width: [X]mm | doors: [N] | drawers: [N] | confidence: [high/medium/low]
Cabinet 2: ...

FINAL TALLY:
TOTAL BASE: X
TOTAL WALL: X
TOTAL TALL: X
TOTAL DOORS: X
TOTAL DRAWERS: X
NOTE: [any assumptions made about dimensions or layout]`;
}

// ── Build extraction from photo description ──────────────────────────────────
async function buildExtractionFromPhoto(photoDescription, fileBlock) {
  const prompt = `You analysed a kitchen photo and produced this cabinet list:

${photoDescription}

Now convert this into structured JSON. Use estimated dimensions where exact sizes aren't visible.
Standard estimates: base width 600mm (single door) or 900mm (double), wall width same, tall 600mm.
For drawers without stated count, use 3 drawers per drawer bank.

Respond with ONLY valid JSON:
{
  "scope": "Kitchen photo — dimensions estimated",
  "cabinets": {
    "base":  [{"width_mm": 600, "height_mm": 720, "depth_mm": 560, "qty": 1, "drawer_count": 0, "has_door": true, "door_count": 1, "estimated": true, "note": ""}],
    "wall":  [{"width_mm": 600, "height_mm": 700, "depth_mm": 320, "qty": 1, "has_door": true, "door_count": 1, "estimated": true, "note": ""}],
    "tall":  [],
    "tower": []
  },
  "appliances": [],
  "benchtop_lm": 0,
  "ceiling_height_mm": 2400,
  "total_doors_check": 0,
  "total_drawers_check": 0,
  "total_shelves_check": 0,
  "notes": "Dimensions estimated from photo"
}`;

  const extractText = await callClaude([{
    role: 'user',
    content: [{ type: 'text', text: prompt }]
  }], 2000);

  const jsonMatch = extractText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not extract cabinet data from photo.');

  try {
    return JSON.parse(jsonMatch[0]);
  } catch(e) {
    const cleaned = jsonMatch[0].replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(cleaned);
  }
}

// ── Extraction prompt ─────────────────────────────────────────────────────────
function buildExtractionPrompt(description) {
  return `Convert this cabinet analysis into structured JSON.

SOURCE DATA:
---
${description}
---

RULES:
- Each cabinet entry gets qty:1 UNLESS two cabinets are truly identical (same type + width + doors + drawers) — then group with qty:2
- door_count and drawer_count are PER CABINET (not total)
- Use exact widths as listed — do not round unless truly unclear
- If widths are unclear, snap to nearest: 300/400/450/500/600/700/750/900/1000/1200mm
- total_doors_check and total_drawers_check must match FINAL TALLY
- Exclude kickboards, fillers, bulkheads, end panels
- For photos (Type C), mark estimated:true on each cabinet entry

Respond with ONLY valid JSON — no markdown, no extra text:
{
  "scope": "brief summary e.g. '12-cabinet kitchen'",
  "cabinets": {
    "base":   [{"width_mm": 600, "height_mm": 720, "depth_mm": 560, "qty": 1, "drawer_count": 0, "has_door": true, "door_count": 1, "note": ""}],
    "wall":   [{"width_mm": 600, "height_mm": 720, "depth_mm": 320, "qty": 1, "has_door": true, "door_count": 1, "note": ""}],
    "tall":   [{"width_mm": 600, "height_mm": 2100, "depth_mm": 560, "qty": 1, "door_count": 2, "note": ""}],
    "tower":  [{"width_mm": 600, "height_mm": 2400, "depth_mm": 600, "qty": 1, "door_count": 2, "drawer_count": 2, "note": ""}]
  },
  "appliances": [],
  "benchtop_lm": 0,
  "ceiling_height_mm": 2400,
  "total_doors_check": 0,
  "total_drawers_check": 0,
  "total_shelves_check": 0,
  "notes": ""
}`;
}

// ── Claude API call via Worker (key stored in Worker secret) ──────────────────
async function callClaude(messages, maxTokens = 2500) {
  const response = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:       'claude-sonnet-4-6',
      max_tokens:  maxTokens,
      temperature: 0,
      system:      buildSystemPrompt(),
      messages
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error ${response.status}: ${err.slice(0, 300)}`);
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.content?.find(b => b.type === 'text')?.text || '';
}

// ── Read file as base64 ───────────────────────────────────────────────────────
export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result.split(',')[1]);
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

// ── Main: read plan from file ─────────────────────────────────────────────────
export async function readPlanFile(file, onStatus = () => {}) {
  const isPDF    = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const mimeType = file.type || 'image/jpeg';

  onStatus('Reading file…');
  const base64Data = await readFileAsBase64(file);

  // Claude natively supports PDFs as documents and images
  const fileBlock = isPDF
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } }
    : { type: 'image',    source: { type: 'base64', media_type: mimeType,           data: base64Data } };

  onStatus('Step 1/3 — Reading document…');
  const description = await callClaude([{
    role: 'user',
    content: [fileBlock, { type: 'text', text: buildDescriptionPrompt() }]
  }]);

  // ── Stage 2: Extract JSON ─────────────────────────────────────────────────
  onStatus('Step 2/3 — Extracting cabinet list…');
  const extractText = await callClaude([{
    role: 'user',
    content: [{ type: 'text', text: buildExtractionPrompt(description) }]
  }], 4000);

  // Extract and clean JSON from Claude's response
  const jsonMatch = extractText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not extract structured data from plan.');

  let extracted;
  try {
    extracted = JSON.parse(jsonMatch[0]);
  } catch (parseErr) {
    // Try to fix common JSON issues: trailing commas, truncated arrays
    let cleaned = jsonMatch[0]
      .replace(/,\s*([}\]])/g, '$1')   // remove trailing commas
      .replace(/,\s*$/, '')              // remove trailing comma at end
      .replace(/([^\\])"\s*\n\s*"/g, '$1", "'); // fix missing commas between strings

    // If still broken, try truncating to last valid closing brace
    try {
      extracted = JSON.parse(cleaned);
    } catch (e2) {
      // Last resort: ask Claude to fix it
      onStatus('Fixing response format…');
      const fixText = await callClaude([{
        role: 'user',
        content: [{ type: 'text', text: 'The following JSON is malformed. Fix it and return ONLY valid JSON, nothing else:\n\n' + jsonMatch[0].slice(0, 3000) }]
      }], 1500);
      const fixMatch = fixText.match(/\{[\s\S]*\}/);
      if (!fixMatch) throw new Error('Could not parse plan data. Please try again.');
      extracted = JSON.parse(fixMatch[0]);
    }
  }

  // ── Stage 3: Take-off ─────────────────────────────────────────────────────
  onStatus('Step 3/3 — Calculating material take-off…');
  const takeoff = computeTakeoff(extracted);

  // Self-verify
  const warnings = [];
  if (extracted.total_doors_check > 0 && Math.abs(extracted.total_doors_check - takeoff.totalDoors) > 1)
    warnings.push(`⚠️ Door count: plan shows ${extracted.total_doors_check}, computed ${takeoff.totalDoors} — please review`);
  if (extracted.total_drawers_check > 0 && Math.abs(extracted.total_drawers_check - takeoff.totalDrawers) > 1)
    warnings.push(`⚠️ Drawer count: plan shows ${extracted.total_drawers_check}, computed ${takeoff.totalDrawers} — please review`);
  if (warnings.length) extracted.notes = [extracted.notes, ...warnings].filter(Boolean).join(' ');

  return { description, extracted, takeoff };
}

// ── Take-off calculator ───────────────────────────────────────────────────────
export function computeTakeoff(extracted) {
  const cab = extracted.cabinets || {};
  let hmrAreaMm2 = 0, mdfAreaMm2 = 0;
  let totalDoors = 0, totalDrawers = 0, totalShelves = 0;
  let totalHinges = 0, totalSlides = 0, totalHandles = 0, totalLegs = 0, totalPins = 0;
  const DRAWER_FACE_H = 200;

  const allTypes = [
    { list: cab.base  || [], type: 'base'  },
    { list: cab.wall  || [], type: 'wall'  },
    { list: cab.tall  || [], type: 'tall'  },
    { list: cab.tower || [], type: 'tower' },
  ];

  allTypes.forEach(({ list, type }) => {
    list.forEach(c => {
      const qty     = c.qty || 1;
      const w       = c.width_mm  || 600;
      const h       = c.height_mm || (type === 'wall' ? 720 : type === 'tall' ? 2100 : type === 'tower' ? 2400 : 720);
      const d       = c.depth_mm  || (type === 'wall' ? 320 : 560);
      const doors   = c.door_count   || (c.has_door !== false ? (w >= 900 ? 2 : 1) : 0);
      const drawers = c.drawer_count || 0;
      const shelves = c.shelf_count  || Math.max(0, Math.ceil(h / 600) - 1);

      for (let i = 0; i < qty; i++) {
        // Carcass panels
        const panels = [d * h, d * h, w * h];
        if (type !== 'wall') panels.push(w * d); // bottom
        if (type !== 'base') panels.push(w * d); // top
        for (let s = 0; s < shelves; s++) panels.push(w * d);
        hmrAreaMm2 += panels.reduce((a, b) => a + b, 0);

        // Face panels
        if (doors > 0) {
          const doorW = Math.floor(w / doors);
          for (let dr = 0; dr < doors; dr++) mdfAreaMm2 += doorW * h;
        }
        for (let dr = 0; dr < drawers; dr++) mdfAreaMm2 += w * DRAWER_FACE_H;

        // Hardware
        const hingesPerDoor = h > 900 ? 3 : 2;
        totalHinges  += doors * hingesPerDoor;
        totalSlides  += drawers;
        totalHandles += doors + drawers;
        totalLegs    += type === 'wall' ? 0 : 4;
        totalPins    += shelves * 4;
        totalDoors   += doors;
        totalDrawers += drawers;
        totalShelves += shelves;
      }
    });
  });

  return {
    hmrAreaMm2:  Math.round(hmrAreaMm2),
    mdfAreaMm2:  Math.round(mdfAreaMm2),
    hmrSheets:   sheetsRequired(hmrAreaMm2),
    mdfSheets:   sheetsRequired(mdfAreaMm2),
    totalDoors, totalDrawers, totalShelves,
    totalHinges, totalSlides, totalHandles, totalLegs, totalPins,
    scope:       extracted.scope || '',
    notes:       extracted.notes || '',
    cabinets:    extracted.cabinets || {},
    appliances:  extracted.appliances || [],
    benchtop_lm: extracted.benchtop_lm || 0
  };
}

// ── Convert to estimator items ────────────────────────────────────────────────
export function takeoffToEstimatorItems(extracted) {
  const cab   = extracted.cabinets || {};
  const items = [];
  const typeMap = {
    base:  { type: 'base',  defaultH: 720,  defaultD: 560 },
    wall:  { type: 'wall',  defaultH: 720,  defaultD: 320 },
    tall:  { type: 'tall',  defaultH: 2100, defaultD: 560 },
    tower: { type: 'tower', defaultH: 2400, defaultD: 600 }
  };

  Object.entries(typeMap).forEach(([key, meta]) => {
    (cab[key] || []).forEach(c => {
      const qty     = c.qty || 1;
      const w       = c.width_mm  || 600;
      const h       = c.height_mm || meta.defaultH;
      const d       = c.depth_mm  || meta.defaultD;
      const doors   = c.door_count   || (c.has_door !== false ? (w >= 900 ? 2 : 1) : 0);
      const drawers = c.drawer_count || 0;
      const shelves = c.shelf_count  || Math.max(0, Math.ceil(h / 600) - 1);

      for (let i = 0; i < qty; i++) {
        items.push({
          type:          meta.type,
          label:         c.note || `${key} ${w}mm${qty > 1 ? ` #${i + 1}` : ''}`,
          width: w, height: h, depth: d, shelves, doors,
          drawerUnits:   drawers > 0 ? [{ width: Math.min(w, 900), count: drawers }] : [],
          faceMaterial:  'mdf_18',
          endBoardLeft:  false,
          endBoardRight: false,
          appliances:    []
        });
      }
    });
  });
  return items;
}
