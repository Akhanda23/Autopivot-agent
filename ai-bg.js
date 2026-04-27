/**
 * ai-bg.js — Background Removal + Car-Colour Blend
 *
 * AI used: RMBG-1.4 by BRIA AI via Transformers.js
 * Runs 100% in-browser. No API key. No uploads.
 *
 * Steps:
 *  1. Load RMBG-1.4 model (cached after first download, ~45MB)
 *  2. Generate alpha mask for each photo
 *  3. Sample dominant car colour from masked pixels
 *  4. Render a colour-matched studio gradient background
 *  5. Composite car over gradient with ground shadow
 */

import { loadImg, setProgress, showProgress } from './utils.js';

// Shared pipeline instance (loaded once, reused for all photos)
let bgPipeline = null;

// ── Public entry point ──────────────────────────────────
/**
 * Remove backgrounds from all unprocessed photos.
 * @param {Array}   photos      - shared photo state array
 * @param {boolean} silent      - if true, suppress button/spinner UI
 * @param {Function} onDone     - called after all photos processed
 */
export async function runBgRemoval(photos, silent = false, onDone = null) {
  if (!photos.length) return;

  const btn  = document.getElementById('bgBtn');
  const spin = document.getElementById('bgSpin');
  const lbl  = document.getElementById('bgLbl');
  const err  = document.getElementById('bgErr');

  if (!silent) { btn.disabled = true; spin.style.display = 'block'; lbl.textContent = 'Processing…'; }
  setProgress(0, 'Loading RMBG-1.4…');
  showProgress(true);

  try {
    const { AutoModel, AutoProcessor, env, RawImage } =
      await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.1.2/dist/transformers.min.js');

    if (!bgPipeline) {
      env.allowLocalModels = false;
      env.useBrowserCache  = true;

      const [model, processor] = await Promise.all([
        AutoModel.from_pretrained('briaai/RMBG-1.4', {
          config: { model_type: 'custom' },
          progress_callback: p => {
            if (p.status === 'progress')
              setProgress(Math.round((p.loaded / p.total) * 65), 'Downloading RMBG-1.4…');
          }
        }),
        AutoProcessor.from_pretrained('briaai/RMBG-1.4', {
          config: {
            do_normalize: true, do_pad: false, do_rescale: true, do_resize: true,
            image_mean: [0.5, 0.5, 0.5],
            feature_extractor_type: 'ImageFeatureExtractor',
            image_std: [1, 1, 1], resample: 2,
            rescale_factor: 1 / 255,
            size: { width: 1024, height: 1024 }
          }
        })
      ]);
      bgPipeline = { model, processor };
    }

    const unprocessed = photos.filter(p => !p.blendedURL);

    for (let i = 0; i < unprocessed.length; i++) {
      const photo = unprocessed[i];
      setProgress(65 + Math.round((i / unprocessed.length) * 32), `Processing photo ${i + 1}/${unprocessed.length}…`);

      try {
        photo.blendedURL = await processOnePhoto(photo.origURL, bgPipeline.processor, bgPipeline.model, RawImage);
      } catch (e) {
        console.warn('RMBG failed for photo:', photo.name, e);
      }
    }

    setProgress(100, 'Done!');
    setTimeout(() => showProgress(false), 700);
    if (!silent && err) err.classList.remove('show');
    if (onDone) onDone();

  } catch (e) {
    showProgress(false);
    if (!silent && err) { err.textContent = '⚠ ' + e.message; err.classList.add('show'); }
  }

  if (!silent) {
    btn.disabled = false;
    spin.style.display = 'none';
    lbl.textContent = '✂️ Remove Backgrounds + Colour Blend';
  }
}

// ── Process a single photo ──────────────────────────────
async function processOnePhoto(origURL, processor, model, RawImage) {
  const img = await RawImage.fromURL(origURL);
  const { pixel_values } = await processor(img);
  const { output } = await model({ input: pixel_values });
  const mask = await RawImage.fromTensor(output[0].mul(255).to('uint8')).resize(img.width, img.height);

  const imgEl = await loadImg(origURL);
  const W = img.width, H = img.height;

  // 1. Sample dominant car colour from masked (foreground) pixels
  const smpCanvas = document.createElement('canvas');
  smpCanvas.width = W; smpCanvas.height = H;
  const smpCtx = smpCanvas.getContext('2d');
  smpCtx.drawImage(imgEl, 0, 0);
  const carColour = sampleDominantColour(smpCtx, mask.data, W, H);

  // 2. Render colour-matched studio background
  const outCanvas = document.createElement('canvas');
  outCanvas.width = W; outCanvas.height = H;
  const outCtx = outCanvas.getContext('2d');
  drawCarBlendBg(outCtx, W, H, carColour);

  // 3. Apply alpha mask to car layer
  const carCanvas = document.createElement('canvas');
  carCanvas.width = W; carCanvas.height = H;
  const carCtx = carCanvas.getContext('2d');
  carCtx.drawImage(imgEl, 0, 0);
  const carData = carCtx.getImageData(0, 0, W, H);
  for (let k = 0; k < mask.data.length; k++) carData.data[k * 4 + 3] = mask.data[k];
  carCtx.putImageData(carData, 0, 0);

  // 4. Composite: background + car
  outCtx.drawImage(carCanvas, 0, 0);

  // 5. Subtle ground shadow ellipse
  const shadowY = Math.round(H * 0.88);
  const shadowW = Math.round(W * 0.6);
  const sg = outCtx.createRadialGradient(W / 2, shadowY, 0, W / 2, shadowY, shadowW / 2);
  sg.addColorStop(0, 'rgba(0,0,0,.28)');
  sg.addColorStop(1, 'rgba(0,0,0,0)');
  outCtx.fillStyle = sg;
  outCtx.beginPath();
  outCtx.ellipse(W / 2, shadowY, shadowW / 2, Math.round(H * 0.04), 0, 0, Math.PI * 2);
  outCtx.fill();

  return outCanvas.toDataURL('image/jpeg', 0.92);
}

// ── Colour sampling ─────────────────────────────────────
/**
 * Sample the average colour of foreground (car) pixels using the alpha mask.
 * Every 4th pixel is sampled for performance.
 */
function sampleDominantColour(ctx, maskData, w, h) {
  const pixelData = ctx.getImageData(0, 0, w, h).data;
  let rSum = 0, gSum = 0, bSum = 0, count = 0;
  for (let i = 0; i < maskData.length; i += 4) {
    if (maskData[i] > 128) { // pixel belongs to the car
      const idx = i * 4;
      rSum += pixelData[idx];
      gSum += pixelData[idx + 1];
      bSum += pixelData[idx + 2];
      count++;
    }
  }
  return count === 0
    ? { r: 60, g: 80, b: 120 } // fallback: dark navy
    : { r: Math.round(rSum / count), g: Math.round(gSum / count), b: Math.round(bSum / count) };
}

// ── Studio background generator ─────────────────────────
/**
 * Draw a professional automotive studio gradient background
 * derived from the car's dominant colour.
 *
 * Layers (bottom to top):
 *  1. Dark-to-mid-to-dark vertical gradient (colour-matched)
 *  2. Soft key-light bloom (upper-left)
 *  3. Floor reflection gradient (lower 25%)
 *  4. Vignette overlay
 */
function drawCarBlendBg(ctx, w, h, col) {
  const dk = (v, f) => Math.round(v * f);

  // Three tone levels: dark, mid, light — all derived from car colour
  const dark = { r: dk(col.r, 0.18), g: dk(col.g, 0.18), b: dk(col.b, 0.22) };
  const mid  = { r: dk(col.r, 0.28), g: dk(col.g, 0.28), b: dk(col.b, 0.32) };
  const lite = { r: dk(col.r, 0.38), g: dk(col.g, 0.38), b: dk(col.b, 0.42) };

  // Main gradient
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0,    `rgb(${dark.r},${dark.g},${dark.b})`);
  bg.addColorStop(0.35, `rgb(${mid.r},${mid.g},${mid.b})`);
  bg.addColorStop(0.65, `rgb(${lite.r},${lite.g},${lite.b})`);
  bg.addColorStop(1,    `rgb(${dark.r},${dark.g},${dark.b})`);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Key light bloom (upper-left)
  const bloom = ctx.createRadialGradient(w * 0.2, h * 0.2, 0, w * 0.2, h * 0.25, w * 0.55);
  bloom.addColorStop(0, 'rgba(255,250,230,.18)');
  bloom.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, w, h);

  // Floor reflection
  const floorY = Math.round(h * 0.75);
  const flr = ctx.createLinearGradient(0, floorY, 0, h);
  flr.addColorStop(0, `rgba(${lite.r},${lite.g},${lite.b},.55)`);
  flr.addColorStop(1, `rgba(${dark.r},${dark.g},${dark.b},.9)`);
  ctx.fillStyle = flr;
  ctx.fillRect(0, floorY, w, h - floorY);

  // Vignette
  const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, w * 0.72);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,.48)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
}
