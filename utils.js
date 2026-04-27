/**
 * utils.js — Shared utility functions
 * Used by all AI modules and UI
 */

export function loadImg(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

export function dataURLtoBlob(dataURL) {
  const [header, b64] = dataURL.split(',');
  const mime = header.match(/:(.*?);/)[1];
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export function setProgress(pct, text) {
  document.getElementById('progFill').style.width = pct + '%';
  document.getElementById('progPct').textContent = pct + '%';
  document.getElementById('progTxt').textContent = text;
}

export function showProgress(visible) {
  document.getElementById('progWrap').classList.toggle('show', visible);
}

/** Apply pixelated mosaic blur to a canvas region */
export function applyMosaic(ctx, x, y, w, h, tileSize = 14) {
  if (w <= 0 || h <= 0) return;
  const imgData = ctx.getImageData(x, y, w, h);
  const px = imgData.data;
  for (let ty = 0; ty < h; ty += tileSize) {
    for (let tx = 0; tx < w; tx += tileSize) {
      const sx = Math.min(tx + (tileSize >> 1), w - 1);
      const sy = Math.min(ty + (tileSize >> 1), h - 1);
      const si = (sy * w + sx) * 4;
      const r = px[si], g = px[si + 1], b = px[si + 2];
      for (let py = ty; py < Math.min(ty + tileSize, h); py++) {
        for (let qx = tx; qx < Math.min(tx + tileSize, w); qx++) {
          const i = (py * w + qx) * 4;
          px[i] = r; px[i + 1] = g; px[i + 2] = b;
        }
      }
    }
  }
  ctx.putImageData(imgData, x, y);
}

/** Map RGB average to a colour name */
export function identifyColour(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  if (delta < 30) {
    if (max < 50) return 'black';
    if (max > 200) return 'white';
    return 'grey';
  }
  const rawHue = delta === 0 ? 0
    : max === r ? 60 * ((g - b) / delta % 6)
    : max === g ? 60 * ((b - r) / delta + 2)
    : 60 * ((r - g) / delta + 4);
  const h = (rawHue + 360) % 360;
  if (h < 20 || h >= 340) return 'red';
  if (h < 45)  return 'orange';
  if (h < 70)  return 'yellow';
  if (h < 150) return 'green';
  if (h < 200) return 'teal';
  if (h < 260) return 'blue';
  if (h < 290) return 'purple';
  if (h < 320) return 'pink';
  return 'red';
}
