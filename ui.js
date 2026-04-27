/**
 * ui.js — UI Controller
 *
 * Manages: routing/navigation, multi-image file handling,
 * photo mosaic rendering, thumbnail strip, studio build trigger,
 * plate photo selector, and button enable/disable state.
 *
 * Imports AI modules so they receive the shared photos array.
 */

import { runBgRemoval }           from './ai-bg.js';
import { runPlate }               from './ai-plate.js';
import { runDesc, saveGroqKey, loadSavedGroqKey, copyDesc } from './ai-desc.js';
import {
  switchTab, showMsg, clearMsg,
  doLogin, doSignup, setNav, doLogout,
  toggleDrop, closeDrop, pwStr, socDemo, restoreSession
} from './auth.js';

// ── Shared state ────────────────────────────────────────
const VIEW_LABELS = ['Front', '¾ FL', 'Side', '¾ RR', 'Rear', 'Interior', 'Detail', 'Extra'];
let photos = [];      // [{id, name, origURL, blendedURL, plateURL}]
let currentView = 0;

// ── Routing ─────────────────────────────────────────────
function showPage(page) {
  document.getElementById('home-page').classList.toggle('active', page === 'home');
  const authEl = document.getElementById('auth-page');
  authEl.classList.toggle('active', page === 'auth');
  authEl.style.display = page === 'auth' ? 'grid' : '';
}

function scrollSec(id) {
  const el = document.getElementById(id);
  if (!el) return;
  window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 72, behavior: 'smooth' });
}

window.goHome   = () => { showPage('home'); window.scrollTo({ top: 0, behavior: 'smooth' }); };
window.openAuth = tab => { showPage('auth'); switchTab(tab); clearMsg(); window.scrollTo({ top: 0, behavior: 'instant' }); };
window.navTo    = id  => {
  if (document.getElementById('auth-page').classList.contains('active')) window.goHome();
  setTimeout(() => scrollSec(id), 90);
};
window.goStudio = () => { window.goHome(); setTimeout(() => scrollSec('studio'), 90); closeDrop(); };

// ── File handling ────────────────────────────────────────
const dropZone = document.getElementById('mDrop');
dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag'); });
dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('drag'));
dropZone.addEventListener('drop',      e  => {
  e.preventDefault();
  dropZone.classList.remove('drag');
  addFiles([...e.dataTransfer.files]);
});

window.handleFiles = e => addFiles([...e.target.files]);

function addFiles(files) {
  const valid = files.filter(f => f.type.startsWith('image/'));
  const space = 8 - photos.length;

  valid.slice(0, space).forEach(file => {
    if (file.size > 10 * 1024 * 1024) return; // skip >10MB

    const reader = new FileReader();
    reader.onload = ev => {
      const photo = {
        id: Date.now() + Math.random(),
        name: file.name,
        origURL: ev.target.result,
        blendedURL: null,
        plateURL: null
      };
      photos.push(photo);
      renderMosaic();
      refreshPlateSelect();
      enableBtns();
      updateThumbs();
      // Show first photo immediately in the 3D studio
      if (photos.length === 1) window.mainStudio.setImage(photo.origURL);
    };
    reader.readAsDataURL(file);
  });
}

// ── Photo mosaic grid ────────────────────────────────────
function renderMosaic() {
  const grid = document.getElementById('photoMosaic');
  grid.innerHTML = '';
  photos.forEach((photo, i) => {
    const src = photo.blendedURL || photo.origURL;
    const tile = document.createElement('div');
    tile.className = 'photo-tile';
    tile.innerHTML = `
      <img src="${src}" alt="Photo ${i + 1}">
      <button class="photo-rm" onclick="rmPhoto('${photo.id}')">✕</button>
      <span class="photo-flag ${photo.blendedURL ? 'done' : 'raw'}">${photo.blendedURL ? 'Blended' : 'Original'}</span>`;
    grid.appendChild(tile);
  });
}

window.rmPhoto = id => {
  photos = photos.filter(p => String(p.id) !== String(id));
  renderMosaic();
  refreshPlateSelect();
  enableBtns();
  updateThumbs();
  if (photos.length === 0) window.mainStudio.drawDefault();
};

// ── Plate photo selector ─────────────────────────────────
function refreshPlateSelect() {
  const sel = document.getElementById('plateSel');
  sel.innerHTML = photos.length === 0
    ? '<option value="">— Upload photos first —</option>'
    : photos.map((p, i) => `<option value="${i}">Photo ${i + 1}: ${p.name.slice(0, 22)}</option>`).join('');
}

// ── Button state ─────────────────────────────────────────
function enableBtns() {
  const hasPhotos = photos.length > 0;
  ['bgBtn', 'vsBuildBtn', 'descBtn', 'plateBtn'].forEach(id => {
    document.getElementById(id).disabled = !hasPhotos;
  });
}

// ── Thumbnail strip ──────────────────────────────────────
function updateThumbs() {
  const strip = document.getElementById('thumbStrip');
  strip.innerHTML = '';

  if (!photos.length) {
    strip.innerHTML = '<div class="thumb-item sel"><div class="thumb-ph">🚗</div><div class="thumb-lbl">Upload</div></div>';
    return;
  }

  photos.forEach((photo, i) => {
    const src = photo.blendedURL || photo.origURL;
    const item = document.createElement('div');
    item.className = `thumb-item${i === currentView ? ' sel' : ''}`;
    item.onclick = () => selectView(i);
    item.innerHTML = `
      <img class="thumb-img" src="${src}" alt="">
      <div class="thumb-lbl">${VIEW_LABELS[i] || 'View ' + (i + 1)}</div>`;
    strip.appendChild(item);
  });
}

function selectView(i) {
  currentView = i;
  document.querySelectorAll('.thumb-item').forEach((t, j) => t.classList.toggle('sel', j === i));
  if (photos[i]) window.mainStudio.setImage(photos[i].blendedURL || photos[i].origURL);
}

// ── Studio build button ──────────────────────────────────
window.buildStudio = async () => {
  if (!photos.length) return;

  const btn  = document.getElementById('vsBuildBtn');
  const spin = document.getElementById('vsSpin');
  const lbl  = document.getElementById('vsBuildLbl');
  const txt  = document.getElementById('vsTxt');

  btn.disabled = true;
  spin.style.display = 'block';
  lbl.textContent = 'Building…';
  txt.textContent = 'Running RMBG-1.4 + colour blend on all photos…';

  await runBgRemoval(photos, true, () => {
    renderMosaic();
    updateThumbs();
    selectView(0);
  });

  spin.style.display = 'none';
  btn.disabled = false;
  lbl.textContent = '🔄 Rebuild View';
  txt.textContent = `${photos.length} photo${photos.length > 1 ? 's' : ''} loaded · Drag to orbit · Click thumbnails to switch angle`;
};

// ── AI button handlers (bridge to modules) ───────────────
window.runBgRemoval = () => runBgRemoval(photos, false, () => { renderMosaic(); updateThumbs(); });

window.runPlate = () => {
  const idx = parseInt(document.getElementById('plateSel').value);
  if (!isNaN(idx) && photos[idx]) runPlate(photos[idx]);
};

window.runDesc      = () => runDesc(photos);
window.saveGroqKey  = saveGroqKey;
window.copyDesc     = copyDesc;

// ── Auth bridge ───────────────────────────────────────────
window.switchTab  = switchTab;
window.doLogin    = () => doLogin(() => window.goHome());
window.doSignup   = () => doSignup(() => window.goHome());
window.doLogout   = () => doLogout(closeDrop);
window.toggleDrop = toggleDrop;
window.closeDrop  = closeDrop;
window.pwStr      = pwStr;
window.socDemo    = socDemo;

// Close dropdown on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('#userChip') && !e.target.closest('#uDrop')) closeDrop();
});

// ── Init ──────────────────────────────────────────────────
restoreSession();
loadSavedGroqKey();
