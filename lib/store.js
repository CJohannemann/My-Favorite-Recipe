const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'recipes.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

function save(recipes) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(recipes, null, 2));
  fs.renameSync(tmp, FILE); // atomic replace
}

function matches(recipe, { q, category, protein }) {
  if (category && recipe.category !== category) return false;
  if (protein && !recipe.proteins.includes(protein) && recipe.primaryProtein !== protein) return false;
  if (q) {
    const haystack = [
      recipe.title, recipe.primaryProtein, ...recipe.proteins,
      ...recipe.ingredients, ...recipe.tags, recipe.notes,
    ].join(' ').toLowerCase();
    return q.toLowerCase().split(/\s+/).filter(Boolean).every((term) => haystack.includes(term));
  }
  return true;
}

module.exports = {
  list(filters = {}) {
    return load()
      .filter((r) => matches(r, filters))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  get(id) {
    return load().find((r) => r.id === id);
  },
  create(recipe) {
    const recipes = load();
    const now = new Date().toISOString();
    const saved = { ...recipe, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
    recipes.push(saved);
    save(recipes);
    return saved;
  },
  update(id, recipe) {
    const recipes = load();
    const i = recipes.findIndex((r) => r.id === id);
    if (i === -1) return null;
    recipes[i] = { ...recipes[i], ...recipe, id, updatedAt: new Date().toISOString() };
    save(recipes);
    return recipes[i];
  },
  remove(id) {
    const recipes = load();
    const next = recipes.filter((r) => r.id !== id);
    if (next.length === recipes.length) return false;
    save(next);
    return true;
  },
  proteins() {
    const counts = {};
    for (const r of load()) for (const p of r.proteins) counts[p] = (counts[p] || 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  },
};
