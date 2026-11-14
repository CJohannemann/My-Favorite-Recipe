# My Favorite Recipe

Simple app that you can put your favorite recipes.

Snap a photo (or paste the text) of a recipe and **Google Gemini** reads it and fills in the form for you:

- **Category**: breakfast, lunch, or dinner
- **Protein**: the main protein (chicken, beef, salmon, tofu, eggs…) plus any others in the dish
- Title, ingredients, steps, servings, time, and tags

You review what it filled in, fix anything, and save. Then you can search and filter by category and protein.

## Setup

Requires Node.js 22 or newer.

```bash
npm install
cp .env.example .env      # then put your Gemini key in .env
npm start                 # http://localhost:3000
```

Get a free Gemini API key at <https://aistudio.google.com/apikey>.
The key stays on the server and is never sent to the browser.

| Variable         | Default            | Purpose                         |
| ---------------- | ------------------ | ------------------------------- |
| `GEMINI_API_KEY` | (required to scan) | Your Google Gemini API key      |
| `GEMINI_MODEL`   | `gemini-2.5-flash` | Which Gemini model reads recipes |
| `PORT`           | `3000`             | Web server port                 |
| `DATA_DIR`       | `./data`           | Where `recipes.json` is stored  |

## How it works

- `server.js`: Express server and REST API
- `lib/gemini.js`: sends the photo/text to Gemini with a JSON schema, so the reply always has a `category` (one of breakfast/lunch/dinner) and a `primaryProtein`. Protein names are normalized (lowercase, common names like `chicken`, `beef`, `salmon`) so search and filtering stay consistent.
- `lib/store.js`: saves recipes to `data/recipes.json`
- `public/`: the web page (plain HTML/CSS/JS, no build step)

### API

| Method | Path                | Notes |
| ------ | ------------------- | ----- |
| POST   | `/api/scan`         | multipart: `images` (up to 5 photos/PDFs) and/or `text`. Returns a draft recipe; doesn't save it. |
| GET    | `/api/recipes`      | Optional `?q=`, `?category=breakfast\|lunch\|dinner`, `?protein=chicken` |
| GET    | `/api/recipes/:id`  | |
| POST   | `/api/recipes`      | Save a recipe |
| PUT    | `/api/recipes/:id`  | Update |
| DELETE | `/api/recipes/:id`  | Delete |
| GET    | `/api/proteins`     | Every protein in your recipes, with counts (feeds the filter chips) |
