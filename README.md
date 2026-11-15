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

### Where the key lives

Your key goes in the **`.env` file in the project folder** (next to `package.json`):

```
GEMINI_API_KEY=your-key-here
```

- `.env` is listed in `.gitignore`, so it is **never committed or pushed to GitHub**. This repo is public, so that matters: a key pushed here could be copied by anyone.
- `npm start` reads `.env` automatically. There is no separate server to set up.
- The key is used only by the app's own Node process on your computer and is never sent to the web page.

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
