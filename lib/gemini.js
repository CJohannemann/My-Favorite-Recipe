const { GoogleGenAI } = require('@google/genai');

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const CATEGORIES = ['breakfast', 'lunch', 'dinner'];

// Common proteins we try to normalize to, so search/filter stays consistent.
const KNOWN_PROTEINS = [
  'chicken', 'turkey', 'beef', 'pork', 'lamb', 'fish', 'salmon', 'tuna',
  'shrimp', 'shellfish', 'eggs', 'tofu', 'tempeh', 'beans', 'lentils',
  'chickpeas', 'cheese', 'yogurt', 'nuts', 'sausage', 'bacon', 'ham',
];

// JSON Schema for Gemini structured output.
const recipeSchema = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Name of the recipe.' },
    category: {
      type: 'string',
      enum: CATEGORIES,
      description: 'The meal this recipe best fits.',
    },
    primaryProtein: {
      type: 'string',
      description:
        'The main protein, lowercase, singular-ish common name (e.g. "chicken", "beef", "salmon", "tofu"). Use "none" if there is no meaningful protein source.',
    },
    proteins: {
      type: 'array',
      items: { type: 'string' },
      description: 'All notable protein sources in the dish, lowercase. Include the primary protein.',
    },
    ingredients: {
      type: 'array',
      items: { type: 'string' },
      description: 'Each ingredient line with quantity, as written.',
    },
    instructions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Ordered steps, one per item, without step numbers.',
    },
    servings: { type: 'string', description: 'Servings / yield if stated, else empty string.' },
    totalTime: { type: 'string', description: 'Total time if stated or easily inferred, else empty string.' },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: 'A few short lowercase tags (cuisine, diet, method), e.g. "mexican", "vegetarian", "slow cooker".',
    },
  },
  required: ['title', 'category', 'primaryProtein', 'proteins', 'ingredients', 'instructions'],
};

const PROMPT = `You are reading a recipe (from a photo, scan, or pasted text).
Extract it into the provided JSON schema.

Rules:
- category must be exactly one of: ${CATEGORIES.join(', ')}. Choose the meal it is most commonly eaten as. Snacks, sides and desserts: pick whichever meal they would most likely accompany.
- primaryProtein: identify the main protein even if it isn't in the title. Prefer one of these normalized names when it fits: ${KNOWN_PROTEINS.join(', ')}. Otherwise use a short lowercase common name. Use "none" only if the dish has no meaningful protein.
- proteins: every notable protein source, lowercase, using the same normalized names.
- Keep ingredient quantities exactly as written. Fix obvious OCR typos only.
- If something is not present in the source, use an empty string or empty array rather than inventing it, except category and primaryProtein, which you should always infer.`;

let client;
function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    const err = new Error('GEMINI_API_KEY is not set. Add it to your .env file.');
    err.status = 500;
    throw err;
  }
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

/**
 * @param {{ text?: string, images?: { mimeType: string, data: Buffer }[] }} input
 */
async function scanRecipe({ text, images = [] }) {
  const parts = [{ text: PROMPT }];
  for (const img of images) {
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.data.toString('base64') } });
  }
  if (text && text.trim()) parts.push({ text: `Recipe text:\n${text.trim()}` });

  const response = await getClient().models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts }],
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: recipeSchema,
      temperature: 0.2,
    },
  });

  let data;
  try {
    data = JSON.parse(response.text);
  } catch {
    const err = new Error('Gemini returned an unreadable response. Try again.');
    err.status = 502;
    throw err;
  }
  return normalizeRecipe(data);
}

function normalizeList(list) {
  return [...new Set((Array.isArray(list) ? list : []).map((s) => String(s).trim()).filter(Boolean))];
}

function normalizeRecipe(r = {}) {
  const lower = (s) => String(s || '').trim().toLowerCase();
  const category = CATEGORIES.includes(lower(r.category)) ? lower(r.category) : 'dinner';
  const primaryProtein = lower(r.primaryProtein) || 'none';
  const proteins = normalizeList(r.proteins).map((p) => p.toLowerCase());
  if (primaryProtein !== 'none' && !proteins.includes(primaryProtein)) proteins.unshift(primaryProtein);
  return {
    title: String(r.title || '').trim() || 'Untitled recipe',
    category,
    primaryProtein,
    proteins: proteins.filter((p) => p !== 'none'),
    ingredients: normalizeList(r.ingredients),
    instructions: normalizeList(r.instructions),
    servings: String(r.servings || '').trim(),
    totalTime: String(r.totalTime || '').trim(),
    tags: normalizeList(r.tags).map((t) => t.toLowerCase()),
    notes: String(r.notes || '').trim(),
  };
}

module.exports = { scanRecipe, normalizeRecipe, CATEGORIES };
