const $ = (sel) => document.querySelector(sel);
const state = { q: '', category: '', protein: '', editingId: null, viewing: null };

const api = async (url, opts = {}) => {
  const res = await fetch(url, opts);
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const splitLines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);
const splitCommas = (s) => s.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);

// ---------- List & filters ----------
async function refresh() {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.category) params.set('category', state.category);
  if (state.protein) params.set('protein', state.protein);
  const [recipes, proteins] = await Promise.all([api(`/api/recipes?${params}`), api('/api/proteins')]);
  renderProteins(proteins);
  renderList(recipes);
}

function renderProteins(proteins) {
  const box = $('#proteinChips');
  if (state.protein && !proteins.some((p) => p.name === state.protein)) state.protein = '';
  box.innerHTML = proteins.length
    ? `<span class="label">Protein:</span>` +
      [{ name: '', count: null }, ...proteins]
        .map((p) => `<button class="chip ${state.protein === p.name ? 'active' : ''}" data-protein="${esc(p.name)}">${p.name ? esc(cap(p.name)) + ` <small>${p.count}</small>` : 'Any'}</button>`)
        .join('')
    : '';
}

function renderList(recipes) {
  $('#empty').hidden = recipes.length > 0 || state.q || state.category || state.protein;
  $('#list').innerHTML = recipes.length
    ? recipes.map((r) => `
      <button class="card" data-id="${r.id}">
        <span class="badge ${r.category}">${cap(r.category)}</span>
        <h3>${esc(r.title)}</h3>
        <p class="protein">${r.primaryProtein && r.primaryProtein !== 'none' ? 'Protein: ' + esc(cap(r.primaryProtein)) : 'No main protein'}</p>
        ${r.tags?.length ? `<p class="tags">${r.tags.map(esc).join(' · ')}</p>` : ''}
      </button>`).join('')
    : (state.q || state.category || state.protein) ? '<p class="empty">No recipes match those filters.</p>' : '';
}

let searchTimer;
$('#search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.q = e.target.value.trim(); refresh(); }, 200);
});
$('#categoryChips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  state.category = chip.dataset.category;
  document.querySelectorAll('#categoryChips .chip').forEach((c) => c.classList.toggle('active', c === chip));
  refresh();
});
$('#proteinChips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  state.protein = chip.dataset.protein;
  refresh();
});

// ---------- Viewer ----------
$('#list').addEventListener('click', async (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  const r = await api(`/api/recipes/${card.dataset.id}`);
  state.viewing = r;
  const meta = [r.servings && `Serves ${esc(r.servings)}`, r.totalTime && esc(r.totalTime)].filter(Boolean).join(' · ');
  $('#viewBody').innerHTML = `
    <span class="badge ${r.category}">${cap(r.category)}</span>
    <h2>${esc(r.title)}</h2>
    ${meta ? `<p class="meta">${meta}</p>` : ''}
    <p class="meta"><strong>Protein:</strong> ${r.proteins.length ? r.proteins.map((p) => esc(cap(p))).join(', ') : 'none'}</p>
    ${r.tags.length ? `<p class="tags">${r.tags.map(esc).join(' · ')}</p>` : ''}
    <h3>Ingredients</h3><ul>${r.ingredients.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
    <h3>Instructions</h3><ol>${r.instructions.map((i) => `<li>${esc(i)}</li>`).join('')}</ol>
    ${r.notes ? `<h3>Notes</h3><p>${esc(r.notes)}</p>` : ''}`;
  $('#viewer').showModal();
});
$('#editBtn').addEventListener('click', () => { $('#viewer').close(); openEditor(state.viewing); });
$('#deleteBtn').addEventListener('click', async () => {
  if (!confirm(`Delete "${state.viewing.title}"?`)) return;
  await api(`/api/recipes/${state.viewing.id}`, { method: 'DELETE' });
  $('#viewer').close();
  refresh();
});

// ---------- Editor ----------
const form = $('#recipeForm');
const f = form.elements; // note: form.title would be the form's own title attribute

function fillForm(r) {
  f.title.value = r.title || '';
  f.category.value = r.category || 'dinner';
  f.primaryProtein.value = r.primaryProtein && r.primaryProtein !== 'none' ? r.primaryProtein : '';
  f.proteins.value = (r.proteins || []).join(', ');
  f.servings.value = r.servings || '';
  f.totalTime.value = r.totalTime || '';
  f.tags.value = (r.tags || []).join(', ');
  f.ingredients.value = (r.ingredients || []).join('\n');
  f.instructions.value = (r.instructions || []).join('\n');
  f.notes.value = r.notes || '';
}

function openEditor(recipe = null) {
  state.editingId = recipe?.id ?? null;
  $('#editorTitle').textContent = recipe ? 'Edit recipe' : 'Add recipe';
  $('#scanBox').hidden = !!recipe;
  $('#scanFiles').value = '';
  $('#scanText').value = '';
  $('#scanStatus').textContent = '';
  fillForm(recipe || {});
  $('#editor').showModal();
}

$('#addBtn').addEventListener('click', () => openEditor());
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

$('#scanBtn').addEventListener('click', async () => {
  const files = $('#scanFiles').files;
  const text = $('#scanText').value;
  if (!files.length && !text.trim()) {
    $('#scanStatus').textContent = 'Choose a photo or paste some text first.';
    return;
  }
  const fd = new FormData();
  for (const f of files) fd.append('images', f);
  fd.append('text', text);
  $('#scanBtn').disabled = true;
  $('#scanStatus').textContent = 'Reading recipe with Gemini…';
  try {
    const draft = await api('/api/scan', { method: 'POST', body: fd });
    fillForm(draft);
    $('#scanStatus').textContent = `✓ Filled in as ${cap(draft.category)}, protein: ${draft.primaryProtein}. Review and save.`;
  } catch (err) {
    $('#scanStatus').textContent = `⚠ ${err.message}`;
  } finally {
    $('#scanBtn').disabled = false;
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const recipe = {
    title: f.title.value,
    category: f.category.value,
    primaryProtein: f.primaryProtein.value.trim().toLowerCase() || 'none',
    proteins: splitCommas(f.proteins.value),
    servings: f.servings.value,
    totalTime: f.totalTime.value,
    tags: splitCommas(f.tags.value),
    ingredients: splitLines(f.ingredients.value),
    instructions: splitLines(f.instructions.value),
    notes: f.notes.value,
  };
  const opts = { method: state.editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(recipe) };
  try {
    await api(state.editingId ? `/api/recipes/${state.editingId}` : '/api/recipes', opts);
    $('#editor').close();
    refresh();
  } catch (err) {
    alert(err.message);
  }
});

refresh();
