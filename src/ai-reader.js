// ─── AI Plan Reader (OpenAI GPT-4o via pah-proxy) ────────────────────────────
// Uses your existing pah-proxy Worker at pah-proxy.p-mirzapanah.workers.dev
// ─────────────────────────────────────────────────────────────────────────────

const WORKER_URL = 'https://pah-proxy.p-mirzapanah.workers.dev';

// ── Sheet nesting constants ───────────────────────────────────────────────────
const SHEET = {
  W: 2420, H: 1210,
  efficiency: 0.80,
  wasteFactor: 1.10
};
const SHEET_AREA     = SHEET.W * SHEET.H;
const EFFECTIVE_AREA = SHEET_AREA * SHEET.efficiency;

function sheetsRequired(totalAreaMm2) {
  if (totalAreaMm2 <= 0) return 0;
  return Math.ceil((totalAreaMm2 / EFFECTIVE_AREA) * SHEET.wasteFactor);
}

// ── API key — prompt once, cache for session ──────────────────────────────────
function getApiKey() {
  let key = sessionStorage.getItem('cab_openai_key');
  if (!key) {
    key = prompt('Enter your OpenAI API key (sk-...):');
    if (!key) throw new Error('API key required.');
    sessionStorage.setItem('cab_openai_key', key.trim());
  }
  return key.trim();
}

// ── OpenAI call via pah-proxy ─────────────────────────────────────────────────
async function callGPT(messages, maxTokens = 2000) {
  const apiKey   = getApiKey();

  const response = await fetch(WORKER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key':    apiKey
    },
    body: JSON.stringify({
      model:       'gpt-4o',
      max_tokens:  maxTokens,
      temperature: 0,
      messages
    })
  });

  if (!response.ok) {
    const err = await response.text();
    if (response.status === 401) sessionStorage.removeItem('cab_openai_key');
    throw new Error(`API error ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = await response.json();
  if (data.error) {
    sessionStorage.removeItem('cab_openai_key');
    throw new Error(data.error.message || JSON.stringify(data.error));
  }

  return data.choices?.[0]?.message?.content || '';
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

SHEET NESTING:
- Standard sheet: 2420 × 1210mm
- Yield efficiency: 80% conservative
- Add 10% waste buffer, always round UP

CABINET TYPE DETECTION:
- Has Door parts → has hinges
- Has Dwr parts → has drawer runners
- Has UB (upper back) → wall/overhead cabinet
- Has BOT (base) → base cabinet
- Tall cabinet → end panel height typically > 900mm`;
}

// ── Stage 1: Description prompt ───────────────────────────────────────────────
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

If this is a Mozaik cut-list PDF, extract EVERY part row:
- Part label (e.g. R17C1 Door(L) #1)
- Width × Length in mm
- Cabinet reference

At the end, write a SUMMARY COUNT:
- Total base cabinets: X
- Total wall/overhead cabinets: X
- Total tall cabinets: X
- Total doors: X
- Total drawer fronts: X
- Total adjustable shelves: X

Be exhaustive. Nothing can be missed — this drives a material order.`;
}

// ── Stage 2: Extraction prompt ────────────────────────────────────────────────
function buildExtractionPrompt(description) {
  return `Based on this detailed cabinet plan description, extract structured cabinet data.

DESCRIPTION:
---
${description}
---

EXTRACTION RULES:
- Each distinct cabinet type + width = one entry (e.g. three 600mm base cabs = qty:3)
- drawer_count: total individual drawers in that cabinet
- has_door: true for base/wall/tall/vanity unless described as open shelf
- Tall cabinets always have 2 doors (top + bottom)
- qty = exact count from description summary
- width_mm: use exact mm, snap to nearest standard if unclear (300/400/450/500/600/750/900/1000/1200)

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

// ── Read file as base64 ───────────────────────────────────────────────────────
export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result.split(',')[1]);
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

// ── Load PDF.js dynamically ──────────────────────────────────────────────────
async function loadPdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://mozilla.github.io/pdf.js/build/pdf.mjs';
    script.type = 'module';
    script.onerror = () => reject(new Error('Failed to load PDF.js'));
    document.head.appendChild(script);

    // Use importmap-compatible dynamic import instead
    import('https://mozilla.github.io/pdf.js/build/pdf.mjs').then(mod => {
      mod.GlobalWorkerOptions.workerSrc =
        'https://mozilla.github.io/pdf.js/build/pdf.worker.mjs';
      window.pdfjsLib = mod;
      resolve(mod);
    }).catch(reject);
  });
}

// ── Convert PDF to array of PNG base64 strings ────────────────────────────────
async function pdfToBase64Images(file, onStatus, maxPages = 8) {
  onStatus('Loading PDF renderer…');
  const pdfjsLib = await loadPdfJs();

  onStatus('Parsing PDF…');
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const totalPages = Math.min(pdf.numPages, maxPages);
  const images = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onStatus(`Rendering page ${pageNum} of ${totalPages}…`);
    const page = await pdf.getPage(pageNum);
    const scale = 2.0; // high resolution
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width  = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;

    const dataUrl = canvas.toDataURL('image/png');
    const base64  = dataUrl.replace(/^data:image\/png;base64,/, '');
    images.push(base64);
  }

  return images;
}

// ── Main: read plan from file ─────────────────────────────────────────────────
export async function readPlanFile(file, onStatus = () => {}) {
  const isPDF    = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const mimeType = file.type || 'image/jpeg';

  onStatus('Reading file…');

  let fileContent;

  if (isPDF) {
    const images = await pdfToBase64Images(file, onStatus);
    onStatus(`Step 1/3 — Analysing ${images.length} page(s)…`);
    fileContent = [
      { type: 'text', text: buildDescriptionPrompt() },
      ...images.map(b64 => ({
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${b64}`, detail: 'high' }
      }))
    ];
  } else {
    const base64Data = await readFileAsBase64(file);
    onStatus('Step 1/3 — Reading plan carefully…');
    fileContent = [
      { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Data}`, detail: 'high' } },
      { type: 'text', text: buildDescriptionPrompt() }
    ];
  }

  const description = await callGPT([{
    role: 'system', content: buildSystemPrompt()
  }, {
    role: 'user', content: fileContent
  }], 2500);

  // ── Stage 2: Extract JSON ─────────────────────────────────────────────────
  onStatus('Step 2/3 — Extracting cabinet list…');

  const extractText = await callGPT([{
    role: 'system', content: buildSystemPrompt()
  }, {
    role: 'user', content: buildExtractionPrompt(description)
  }], 2000);

  const jsonMatch = extractText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not extract structured data from plan description.');
  const extracted = JSON.parse(jsonMatch[0]);

  // ── Stage 3: Take-off ─────────────────────────────────────────────────────
  onStatus('Step 3/3 — Calculating material take-off…');
  const takeoff = computeTakeoff(extracted);

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
        const panels = [d * h, d * h, w * h];
        if (type !== 'wall') panels.push(w * d);
        if (type !== 'base') panels.push(w * d);
        for (let s = 0; s < shelves; s++) panels.push(w * d);
        hmrAreaMm2 += panels.reduce((a, b) => a + b, 0);

        if (doors > 0) {
          const doorW = Math.floor(w / doors);
          for (let dr = 0; dr < doors; dr++) mdfAreaMm2 += doorW * h;
        }
        for (let dr = 0; dr < drawers; dr++) mdfAreaMm2 += w * DRAWER_FACE_H;

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
    hmrAreaMm2: Math.round(hmrAreaMm2),
    mdfAreaMm2: Math.round(mdfAreaMm2),
    hmrSheets:  sheetsRequired(hmrAreaMm2),
    mdfSheets:  sheetsRequired(mdfAreaMm2),
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
          type: meta.type,
          label: c.note || `${key} ${w}mm${qty > 1 ? ` #${i + 1}` : ''}`,
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
