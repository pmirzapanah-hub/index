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

export async function estimateCabinet(input) {
  const { materials, pricing, rules } = await loadConfig();

  const height = input.height;

  const shelves = evaluateFormula(rules.formulas.shelves, { height });
  const hinges = evaluateFormula(rules.formulas.hinges, { height });

  const materialCost = 100; // placeholder (you'll upgrade this)
  const labourCost =
    pricing.labour.assemblyPerCabinet +
    pricing.labour.installationPerCabinet;

  const total =
    materialCost * pricing.margin.materialMarkup +
    labourCost * pricing.margin.labourMarkup;

  return {
    shelves,
    hinges,
    total: Math.max(total, pricing.minimumCharge)
  };
}