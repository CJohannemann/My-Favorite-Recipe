const path = require('node:path');
const express = require('express');
const multer = require('multer');
const store = require('./lib/store');
const { scanRecipe, normalizeRecipe, CATEGORIES } = require('./lib/gemini');
const { basicAuth, rateLimiter, securityHeaders } = require('./lib/security');

const APP_USER = process.env.APP_USER || 'cook';
const APP_PASSWORD = process.env.APP_PASSWORD || '';
// Without a password, only listen on this computer. With one, listen on all
// interfaces so a tunnel / reverse proxy / other devices can reach it.
const HOST = process.env.HOST || (APP_PASSWORD ? '0.0.0.0' : '127.0.0.1');
if (!APP_PASSWORD && !['127.0.0.1', 'localhost', '::1'].includes(HOST)) {
  console.error('Refusing to listen on %s without APP_PASSWORD set. Add APP_PASSWORD to .env.', HOST);
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
// Number of reverse proxies in front of the app (e.g. 1 for Cloudflare Tunnel or Caddy),
// so rate limits see the real visitor IP instead of the proxy's.
app.set('trust proxy', Number(process.env.TRUST_PROXY || 0));
app.use(securityHeaders);

// Unauthenticated health check for Docker / uptime monitors.
app.get('/healthz', (_req, res) => res.send('ok'));

if (APP_PASSWORD) app.use(basicAuth({ user: APP_USER, password: APP_PASSWORD }));

// Every scan costs Gemini quota, so cap it.
const scanLimit = rateLimiter({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.SCANS_PER_HOUR || 30),
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) =>
    cb(null, file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf'),
});

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Scan a recipe photo/PDF and/or pasted text with Gemini. Returns a draft, does not save.
app.post('/api/scan', (req, res, next) => {
  const wait = scanLimit.hit(req.ip);
  if (!wait) return next();
  res.set('Retry-After', String(wait));
  res.status(429).json({ error: `Scan limit reached. Try again in ${Math.ceil(wait / 60)} min.` });
}, upload.array('images', 5), async (req, res, next) => {
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
  const status = err.status || (err instanceof multer.MulterError ? 400 : 500);
  // Don't leak internal error details to visitors; Gemini/config errors set err.status.
  res.status(status).json({ error: status < 500 || err.status ? err.message : 'Something went wrong' });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, HOST, () => {
  console.log(`Recipe box running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${port}`);
  console.log(APP_PASSWORD ? `Password protection ON (user: ${APP_USER})` : 'No APP_PASSWORD set: only reachable from this computer.');
});
