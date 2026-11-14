const path = require('node:path');
const express = require('express');
const multer = require('multer');
const store = require('./lib/store');
const { scanRecipe, normalizeRecipe, CATEGORIES } = require('./lib/gemini');

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) =>
    cb(null, file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf'),
});

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Scan a recipe photo/PDF and/or pasted text with Gemini. Returns a draft, does not save.
app.post('/api/scan', upload.array('images', 5), async (req, res, next) => {
  try {
    const images = (req.files || []).map((f) => ({ mimeType: f.mimetype, data: f.buffer }));
    const text = req.body.text || '';
    if (!images.length && !text.trim()) {
      return res.status(400).json({ error: 'Upload a photo or paste recipe text to scan.' });
    }
    res.json(await scanRecipe({ text, images }));
  } catch (err) {
    next(err);
  }
});

app.get('/api/recipes', (req, res) => {
  const { q, category, protein } = req.query;
  res.json(store.list({ q, category, protein }));
});

app.get('/api/proteins', (_req, res) => res.json(store.proteins()));

app.get('/api/recipes/:id', (req, res) => {
  const recipe = store.get(req.params.id);
  recipe ? res.json(recipe) : res.status(404).json({ error: 'Not found' });
});

app.post('/api/recipes', (req, res) => {
  res.status(201).json(store.create(normalizeRecipe(req.body)));
});

app.put('/api/recipes/:id', (req, res) => {
  const updated = store.update(req.params.id, normalizeRecipe(req.body));
  updated ? res.json(updated) : res.status(404).json({ error: 'Not found' });
});

app.delete('/api/recipes/:id', (req, res) => {
  store.remove(req.params.id) ? res.status(204).end() : res.status(404).json({ error: 'Not found' });
});

app.get('/api/categories', (_req, res) => res.json(CATEGORIES));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Something went wrong' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Recipe box running at http://localhost:${port}`));
