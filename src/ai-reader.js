// ─── AI Plan Reader ───────────────────────────────────────────────────────────
// Uses the Anthropic API to read a Mozaik cut-list PDF or cabinet floor plan
// image and return a structured estimate ready for the estimator engine.
//
// SKILL reference: cabinet-estimator v1.0.0
// Part classification, nesting, and hardware rules match SKILL.md exactly.
// ─────────────────────────────────────────────────────────────────────────────

// ── Sheet nesting constants (from SKILL.md) ───────────────────────────────────
const SHEET = {
  W: 2420, H: 1210,          // actual sheet size (your project spec)
  kerf: 13,                   // saw blade kerf mm
  trim: 5,                    // edge trim mm each side
  efficiency: 0.80,           // conservative nesting yield
  wasteFactor: 1.10           // 10% waste buffer
};

// Effective usable area per sheet
const SHEET_AREA = SHEET.W * SHEET.H;
const EFFECTIVE_AREA = SHEET_AREA * SHEET.efficiency;

// ── Nesting calculator ────────────────────────────────────────────────────────

/**
 * Given total part area in mm², return number of sheets to order.
 */
function sheetsRequired(totalAreaMm2) {
  if (totalAreaMm2 <= 0) return 0;
  return Math.ceil((totalAreaMm2 / EFFECTIVE_AREA) * SHEET.wasteFactor);
}

// ── Build the system prompt (embeds SKILL.md domain knowledge) ────────────────

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

Parts with E1/E4 edging = carcass HMR. Parts with E3 edging = MDF/door panels.
If a part code is unknown, infer from context.`;
}

// ── Stage 1 prompt: thorough visual description ───────────────────────────────

function buildDescriptionPrompt() {
  return `Study this cabinet plan or cut-list VERY carefully. Write a thorough, exhaustive description.

SCAN SYSTEMATICALLY — left to right, top to bottom, section by section.

For EVERY cabinet unit you see:
1. State its position (e.g. "left corner base cabinet")
2. State its type: base / wall (overhead) / tall / vanity / tower
3. State its exact width in mm as shown
4. State exactly what it has: door(s), drawer(s), open shelf, appliance gap
5. If it has a drawer bank — count EACH drawer individually
6. Count every door separately — do not group
7. Note any appliance gaps (fridge space, oven, dishwasher) with widths
8. Note benchtop runs with dimensions if shown
9. Note ceiling height if shown

If this is a Mozaik cut-list PDF, extract EVERY part row:
- Part label (e.g. R17C1 Door(L) #1)
- Width × Length in mm
- Cabinet reference
- Edge codes if shown

At the end, write a SUMMARY COUNT:
- Total base cabinets: X
- Total wall/overhead cabinets: X
- Total tall cabinets: X
- Total vanity cabinets: X
- Total doors: X
- Total drawer fronts: X
- Total adjustable shelves: X

Be exhaustive. Nothing can be missed — this drives a material order.`;
}

// ── Stage 2 prompt: extract structured JSON ───────────────────────────────────

function buildExtractionPrompt(description) {
  return `Based on this detailed cabinet plan description, extract structured cabinet data.

DESCRIPTION:
---
${description}
---

EXTRACTION RULES:
- Each distinct cabinet type + width = one entry (e.g. three 600mm base cabs = qty:3)
- has_drawer_unit: true only if drawers explicitly mentioned
- drawer_count: total individual drawers in that cabinet
- has_door: true for base/wall/tall/vanity unless described as open shelf
- Tall cabinets always have 2 doors (top + bottom)
- qty = exact count from description summary
- width_mm: use exact mm, snap to nearest standard if unclear (300/400/450/500/600/750/900/1000/1200)
- For Mozaik cut-lists: extract every unique part with its dimensions

Respond with ONLY valid JSON — no markdown, no extra text:
{
  "scope": "brief summary e.g. '12-cabinet kitchen with island'",
  "cabinets": {
    "base":   [{"width_mm": 600, "height_mm": 720, "depth_mm": 560, "qty": 1, "has_drawer_unit": false, "drawer_count": 0, "has_door": true, "door_count": 1, "note": ""}],
    "wall":   [{"width_mm": 600, "height_mm": 720, "depth_mm": 320, "qty": 1, "has_door": true, "door_count": 1, "note": ""}],
    "tall":   [{"width_mm": 600, "height_mm": 2100, "depth_mm": 560, "qty": 1, "door_count": 2, "note": "pantry"}],
    "tower":  [{"width_mm": 600, "height_mm": 2400, "depth_mm": 600, "qty": 1, "door_count": 2, "drawer_count": 2, "note": ""}]
  },
  "parts": [],
  "appliances": [],
  "benchtop_lm": 0,
  "ceiling_height_mm": 2400,
  "total_doors_check": 0,
  "total_drawers_check": 0,
  "total_shelves_check": 0,
  "notes": ""
}`;
}


// ── Cloudflare Worker proxy URL ───────────────────────────────────────────────
// Replace with your actual Worker URL after deploying worker.js
const WORKER_URL = 'https://cabinet-estimator-proxy.p-mirzapanah.workers.dev';

async function callClaude(messages, maxTokens = 2000) {
  const response = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system:     buildSystemPrompt(),
      messages
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error ${response.status}: ${err.slice(0, 200)}`);
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

/**
 * Read a cabinet plan PDF or image using the AI.
 * @param {File}     file       - the uploaded file
 * @param {Function} onStatus   - callback(statusText) for progress updates
 * @returns {object}            - { description, extracted, takeoff }
 */
export async function readPlanFile(file, onStatus = () => {}) {
  const isPDF   = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const mimeType = isPDF ? 'application/pdf' : (file.type || 'image/jpeg');

  onStatus('Reading file…');
  const base64Data = await readFileAsBase64(file);

  // ── Stage 1: Visual description ────────────────────────────────────────────
  onStatus('Step 1/3 — Reading plan carefully…');

  const fileBlock = isPDF
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } }
    : { type: 'image',    source: { type: 'base64', media_type: mimeType,           data: base64Data } };

  const description = await callClaude([{
    role: 'user',
    content: [fileBlock, { type: 'text', text: buildDescriptionPrompt() }]
  }], 2500);

  // ── Stage 2: Structured extraction ────────────────────────────────────────
  onStatus('Step 2/3 — Extracting cabinet list…');

  const extractText = await callClaude([{
    role: 'user',
    content: [{ type: 'text', text: buildExtractionPrompt(description) }]
  }], 2000);

  const jsonMatch = extractText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not extract structured data from plan description.');
  const extracted = JSON.parse(jsonMatch[0]);

  // ── Stage 3: Compute take-off from extracted data ─────────────────────────
  onStatus('Step 3/3 — Calculating material take-off…');
  const takeoff = computeTakeoff(extracted);

  // Self-verify door/drawer counts
  const warnings = [];
  if (extracted.total_doors_check > 0 && Math.abs(extracted.total_doors_check - takeoff.totalDoors) > 1) {
    warnings.push(`⚠️ Door count: plan shows ${extracted.total_doors_check}, computed ${takeoff.totalDoors} — please review`);
  }
  if (extracted.total_drawers_check > 0 && Math.abs(extracted.total_drawers_check - takeoff.totalDrawers) > 1) {
    warnings.push(`⚠️ Drawer count: plan shows ${extracted.total_drawers_check}, computed ${takeoff.totalDrawers} — please review`);
  }
  if (warnings.length) extracted.notes = [extracted.notes, ...warnings].filter(Boolean).join(' ');

  return { description, extracted, takeoff };
}

// ── Take-off calculator (deterministic, from extracted JSON) ──────────────────

/**
 * Given extracted cabinet data, compute full material + hardware take-off.
 * Uses SKILL.md rules exactly.
 */
export function computeTakeoff(extracted) {
  const cab = extracted.cabinets || {};

  let hmrAreaMm2  = 0;  // White HMR 16mm carcass
  let mdfAreaMm2  = 0;  // MDF 18mm doors/fronts/panels

  let totalDoors   = 0;
  let totalDrawers = 0;
  let totalShelves = 0;
  let totalHinges  = 0;
  let totalSlides  = 0;
  let totalHandles = 0;
  let totalLegs    = 0;
  let totalPins    = 0;

  const DRAWER_FACE_H = 200; // mm — standard drawer front height

  const allTypes = [
    { list: cab.base   || [], type: 'base'   },
    { list: cab.wall   || [], type: 'wall'   },
    { list: cab.tall   || [], type: 'tall'   },
    { list: cab.tower  || [], type: 'tower'  },
  ];

  allTypes.forEach(({ list, type }) => {
    list.forEach(c => {
      const qty    = c.qty    || 1;
      const w      = c.width_mm  || 600;
      const h      = c.height_mm || (type === 'wall' ? 720 : type === 'tall' ? 2100 : type === 'tower' ? 2400 : 720);
      const d      = c.depth_mm  || (type === 'wall' ? 320 : 560);
      const doors  = c.door_count  || (c.has_door  !== false ? (w >= 900 ? 2 : 1) : 0);
      const drawers = c.drawer_count || 0;
      const shelves = c.shelf_count  || Math.max(0, Math.ceil(h / 600) - 1);

      for (let i = 0; i < qty; i++) {
        // ── Carcass panels (HMR 16mm) ──────────────────────────────────────
        const carcassPanels = [
          d * h,   // left side
          d * h,   // right side
          w * h,   // back
        ];
        if (type !== 'wall') carcassPanels.push(w * d); // bottom
        if (type === 'wall' || type === 'tall' || type === 'tower') carcassPanels.push(w * d); // top
        for (let s = 0; s < shelves; s++) carcassPanels.push(w * d);
        hmrAreaMm2 += carcassPanels.reduce((a, b) => a + b, 0);

        // ── Door face panels (MDF 18mm) ────────────────────────────────────
        if (doors > 0) {
          const doorW = Math.floor(w / doors);
          for (let dr = 0; dr < doors; dr++) mdfAreaMm2 += doorW * h;
        }

        // ── Drawer face panels (MDF 18mm) ──────────────────────────────────
        for (let dr = 0; dr < drawers; dr++) mdfAreaMm2 += w * DRAWER_FACE_H;

        // ── Hardware ───────────────────────────────────────────────────────
        const hingesPerDoor = h > 900 ? 3 : 2;
        totalHinges  += doors   * hingesPerDoor;
        totalSlides  += drawers;        // 1 pair per drawer
        totalHandles += doors + drawers;
        totalLegs    += (type === 'wall') ? 0 : 4;
        totalPins    += shelves * 4;

        totalDoors   += doors;
        totalDrawers += drawers;
        totalShelves += shelves;
      }
    });
  });

  const hmrSheets = sheetsRequired(hmrAreaMm2);
  const mdfSheets = sheetsRequired(mdfAreaMm2);

  return {
    hmrAreaMm2:  Math.round(hmrAreaMm2),
    mdfAreaMm2:  Math.round(mdfAreaMm2),
    hmrSheets,
    mdfSheets,
    totalDoors,
    totalDrawers,
    totalShelves,
    totalHinges,
    totalSlides,
    totalHandles,
    totalLegs,
    totalPins,
    scope: extracted.scope || '',
    notes: extracted.notes || '',
    cabinets: extracted.cabinets || {},
    appliances: extracted.appliances || [],
    benchtop_lm: extracted.benchtop_lm || 0
  };
}

// ── Convert takeoff → cabinet estimator items ─────────────────────────────────

/**
 * Convert AI takeoff into the format expected by estimateRoom() in estimator.js
 * so the AI reading flows directly into the existing pricing engine.
 */
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
      const qty     = c.qty     || 1;
      const w       = c.width_mm  || 600;
      const h       = c.height_mm || meta.defaultH;
      const d       = c.depth_mm  || meta.defaultD;
      const doors   = c.door_count   || (c.has_door   !== false ? (w >= 900 ? 2 : 1) : 0);
      const drawers = c.drawer_count || 0;
      const shelves = c.shelf_count  || Math.max(0, Math.ceil(h / 600) - 1);

      for (let i = 0; i < qty; i++) {
        const drawerUnits = drawers > 0
          ? [{ width: Math.min(w, 900), count: drawers }]
          : [];

        items.push({
          type:         meta.type,
          label:        c.note || `${key} ${w}mm${qty > 1 ? ` #${i + 1}` : ''}`,
          width:        w,
          height:       h,
          depth:        d,
          shelves,
          doors,
          drawerUnits,
          faceMaterial: 'mdf_18',
          endBoardLeft:  false,
          endBoardRight: false,
          appliances:    []
        });
      }
    });
  });

  return items;
}
