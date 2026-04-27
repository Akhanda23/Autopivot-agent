/**
 * ai-plate.js — Number Plate Detection & Mosaic Blur
 *
 * AI used: facebook/detr-resnet-50 (quantized) via Transformers.js
 * Runs 100% in-browser. No API key. No uploads.
 *
 * Detection strategy (three layers, fallback chain):
 *  1. DETR explicit plate labels (if model trained on plate data)
 *  2. DETR car bounding box → canvas edge-scan within car region
 *  3. Full-image canvas edge-scan (always tried if above fail)
 */

import { loadImg, applyMosaic } from './utils.js';

// Shared DETR pipeline (loaded once, ~45MB cached)
let detrPipeline = null;

// ── Public entry point ──────────────────────────────────
/**
 * Detect and blur the number plate in a single photo.
 * Updates photo.plateURL on success.
 * @param {object} photo  - { origURL, plateURL, ... }
 */
export async function runPlate(photo) {
  const btn   = document.getElementById('plateBtn');
  const spin  = document.getElementById('plateSpin');
  const lbl   = document.getElementById('plateLbl');
  const err   = document.getElementById('plateErr');
  const badge = document.getElementById('plateBadge');

  btn.disabled = true;
  spin.style.display = 'block';
  lbl.textContent = 'Detecting…';
  err.classList.remove('show');

  // Show comparison panel
  const cmp = document.getElementById('plateCmp');
  cmp.classList.add('show');
  document.getElementById('plateOrig').src = photo.origURL;
  document.getElementById('plateProc').style.display = 'none';
  document.getElementById('plateHint').style.display = 'block';
  badge.textContent = 'Processing';
  badge.className = 'cbadge work';

  try {
    // Load DETR model (first use: downloads & caches)
    if (!detrPipeline) {
      document.getElementById('plateHint').textContent = 'Loading DETR model…';
      const { pipeline, env } =
        await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.1.2/dist/transformers.min.js');
      env.allowLocalModels = false;
      env.useBrowserCache  = true;
      // Quantized facebook/detr-resnet-50 (~45MB in-browser)
      detrPipeline = await pipeline('object-detection', 'Xenova/detr-resnet-50', { quantized: true });
    }

    document.getElementById('plateHint').textContent = 'Running detection…';

    // DETR inference — returns [{label, score, box:{xmin,ymin,xmax,ymax}}]
    const detections = await detrPipeline(photo.origURL, { threshold: 0.3, percentage: false });

    const imgEl = await loadImg(photo.origURL);
    const iw = imgEl.width, ih = imgEl.height;

    const plateBoxes = resolvePhateBoxes(detections, imgEl, iw, ih);

    if (!plateBoxes.length) {
      badge.textContent = 'No plate found';
      badge.className = 'cbadge';
      document.getElementById('plateHint').textContent = 'No plate detected. Try a clearer, well-lit photo.';
      btn.disabled = false; spin.style.display = 'none'; lbl.textContent = '🔒 Hide Plate';
      return;
    }

    // Draw and blur on canvas
    const offCanvas = document.getElementById('canvas');
    offCanvas.width = iw; offCanvas.height = ih;
    const ctx = offCanvas.getContext('2d');
    ctx.drawImage(imgEl, 0, 0);

    plateBoxes.forEach(det => {
      const bb = det.box;
      const margin = Math.min(iw, ih) * 0.018;
      const x  = Math.max(0, (bb.xmin || 0) - margin);
      const y  = Math.max(0, (bb.ymin || 0) - margin);
      const bw = Math.min(iw - x, (bb.xmax - bb.xmin || 60) + margin * 2);
      const bh = Math.min(ih - y, (bb.ymax - bb.ymin || 20) + margin * 2);
      applyMosaic(ctx, Math.round(x), Math.round(y), Math.round(bw), Math.round(bh), 14);
    });

    const url = offCanvas.toDataURL('image/png');
    photo.plateURL = url;

    document.getElementById('plateProc').src = url;
    document.getElementById('plateProc').style.display = 'block';
    document.getElementById('plateHint').style.display = 'none';
    badge.textContent = '✓ Plate hidden';
    badge.className = 'cbadge done';

    const dlBtn = document.getElementById('plateDl');
    dlBtn.href = url;
    dlBtn.classList.add('show');

  } catch (e) {
    err.textContent = '⚠ ' + e.message;
    err.classList.add('show');
    badge.textContent = 'Failed';
    badge.className = 'cbadge';
    console.error('[ai-plate] Error:', e);
  }

  btn.disabled = false;
  spin.style.display = 'none';
  lbl.textContent = '🔒 Hide Plate';
}

// ── Detection resolution chain ──────────────────────────
function resolvePhateBoxes(detections, imgEl, iw, ih) {
  // Strategy 1: DETR direct plate labels
  const PLATE_LABELS = ['license plate', 'numberplate', 'number plate', 'plate', 'car plate'];
  let boxes = detections.filter(r =>
    PLATE_LABELS.some(l => r.label.toLowerCase().includes(l)) && r.score > 0.3
  );
  if (boxes.length) return boxes;

  // Strategy 2: Locate car → canvas scan within car bounds
  const CAR_LABELS = ['car', 'vehicle', 'truck', 'bus', 'motorcycle', 'van', 'automobile'];
  const carDets = detections
    .filter(r => CAR_LABELS.some(l => r.label.toLowerCase().includes(l)) && r.score > 0.25)
    .sort((a, b) => b.score - a.score);

  if (carDets.length) {
    const { xmin, ymin, xmax, ymax } = carDets[0].box;
    const plateBox = findPlateInRegion(imgEl, xmin, ymin, xmax, ymax);
    if (plateBox) return [{ box: plateBox, score: 0.8, label: 'license plate' }];
  }

  // Strategy 3: Full-image canvas scan
  const fallbackBox = findPlateInRegion(imgEl, 0, 0, iw, ih);
  if (fallbackBox) return [{ box: fallbackBox, score: 0.6, label: 'license plate' }];

  return [];
}

// ── Canvas-based plate finder ───────────────────────────
/**
 * Scan a region of an image for the horizontal row band with the
 * highest pixel-to-pixel variance — characteristic of a licence plate
 * (dense characters on a uniform background create many vertical edges).
 */
function findPlateInRegion(imgEl, rx, ry, rx2, ry2) {
  const rw = Math.round(rx2 - rx);
  const rh = Math.round(ry2 - ry);

  const scanCanvas = document.createElement('canvas');
  scanCanvas.width = rw; scanCanvas.height = rh;
  const ctx = scanCanvas.getContext('2d');
  ctx.drawImage(imgEl, rx, ry, rw, rh, 0, 0, rw, rh);

  const imageData = ctx.getImageData(0, 0, rw, rh);
  const data = imageData.data;

  // Grayscale conversion
  const gray = new Uint8Array(rw * rh);
  for (let i = 0; i < rw * rh; i++) {
    gray[i] = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
  }

  // Per-row horizontal edge score (sum of |px[x] - px[x-1]|)
  const rowScores = [];
  for (let y = 0; y < rh; y++) {
    let score = 0, prev = gray[y * rw];
    for (let x = 1; x < rw; x++) {
      score += Math.abs(gray[y * rw + x] - prev);
      prev = gray[y * rw + x];
    }
    rowScores.push(score / rw);
  }

  // Sliding window: find the horizontal band with the highest edge density
  const windowH = Math.max(4, Math.round(rh * 0.06)); // ~6% of region height
  let bestScore = -1, bestY = 0;
  for (let y = 0; y <= rh - windowH; y++) {
    let s = 0;
    for (let k = 0; k < windowH; k++) s += rowScores[y + k];
    if (s > bestScore) { bestScore = s; bestY = y; }
  }

  // Reject if too little edge activity (not a plate)
  if (bestScore < 8 * windowH) return null;

  // Find horizontal extent of the plate in the best band
  let pxMin = rw, pxMax = 0;
  for (let y = bestY; y < bestY + windowH; y++) {
    for (let x = 0; x < rw; x++) {
      const g = gray[y * rw + x];
      if (g > 40 && g < 240) {
        if (x < pxMin) pxMin = x;
        if (x > pxMax) pxMax = x;
      }
    }
  }

  // Reject if detected band is too narrow to be a plate
  if (pxMax - pxMin < rw * 0.08) return null;

  return {
    xmin: Math.round(rx + pxMin),
    ymin: Math.round(ry + bestY),
    xmax: Math.round(rx + pxMax),
    ymax: Math.round(ry + bestY + windowH)
  };
}
