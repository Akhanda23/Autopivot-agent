/**
 * ai-desc.js — AI Listing Description Generator
 *
 * AI used: Groq Llama 3.3 70B (free tier, no credit card)
 * Get your free key at: https://console.groq.com
 * 1,000 requests/day free. No API key hardcoded.
 *
 * How it works:
 *  1. Canvas colour/brightness analysis on each uploaded photo (in-browser, no API)
 *  2. Summaries sent to Groq Llama 3.3 to generate professional listing copy
 */

import { loadImg, identifyColour } from './utils.js';

const VIEW_LABELS = ['Front', '¾ FL', 'Side', '¾ RR', 'Rear', 'Interior', 'Detail', 'Extra'];
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL   = 'llama-3.3-70b-versatile';

// ── API key management ──────────────────────────────────
export function saveGroqKey() {
  const input = document.getElementById('groqKey');
  const k = input.value.trim();
  if (!k) return;
  localStorage.setItem('groq_key', k);
  const btn = document.querySelector('.groq-key-row button');
  btn.textContent = '✓ Saved';
  setTimeout(() => { btn.textContent = 'Save'; }, 1400);
}

export function loadSavedGroqKey() {
  const k = localStorage.getItem('groq_key');
  if (k) document.getElementById('groqKey').value = k;
}

function getGroqKey() {
  return localStorage.getItem('groq_key') || document.getElementById('groqKey').value.trim();
}

// ── Public entry point ──────────────────────────────────
/**
 * Generate a professional car listing description using Groq Llama 3.3.
 * @param {Array} photos - shared photo state array
 */
export async function runDesc(photos) {
  const groqKey = getGroqKey();
  if (!groqKey) {
    const err = document.getElementById('descErr');
    err.textContent = '⚠ Please paste your free Groq key above and save it.';
    err.classList.add('show');
    return;
  }
  if (!photos.length) return;

  const btn  = document.getElementById('descBtn');
  const spin = document.getElementById('descSpin');
  const lbl  = document.getElementById('descLbl');
  const err  = document.getElementById('descErr');

  btn.disabled = true;
  spin.style.display = 'block';
  lbl.textContent = 'Analysing…';
  err.classList.remove('show');

  try {
    // Step 1: Canvas-based visual analysis for each photo (no external API)
    const summaries = [];
    for (let i = 0; i < Math.min(photos.length, 6); i++) {
      const summary = await analysePhotoCanvas(photos[i].origURL, VIEW_LABELS[i] || `Photo ${i + 1}`);
      summaries.push(summary);
    }

    // Step 2: Send to Groq Llama 3.3 for professional copy
    const raw = await callGroq(groqKey, photos.length, summaries.join('\n'));

    // Step 3: Parse and display
    displayResult(raw);

  } catch (e) {
    err.textContent = '⚠ ' + e.message;
    err.classList.add('show');
  }

  btn.disabled = false;
  spin.style.display = 'none';
  lbl.textContent = '✦ Generate Description';
}

// ── Canvas photo analyser ───────────────────────────────
/**
 * Extract dominant colour, brightness and orientation from a photo
 * using only the Canvas API — fully in-browser, zero API calls.
 */
async function analysePhotoCanvas(dataURL, label) {
  const img = await loadImg(dataURL);
  const W = 320, H = Math.round(img.height * (320 / img.width));

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);

  const d = ctx.getImageData(0, 0, W, H).data;
  const n = W * H;

  // Average RGB
  let rSum = 0, gSum = 0, bSum = 0;
  for (let i = 0; i < d.length; i += 4) { rSum += d[i]; gSum += d[i + 1]; bSum += d[i + 2]; }
  const r = Math.round(rSum / n), g = Math.round(gSum / n), b = Math.round(bSum / n);

  const colourName = identifyColour(r, g, b);
  const brightness = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
  const brightDesc = brightness < 60 ? 'dark' : brightness < 120 ? 'mid-tone' : brightness < 180 ? 'well-lit' : 'bright';
  const orientation = img.width > img.height * 1.2 ? 'landscape (likely exterior)' :
                      img.width < img.height * 0.9  ? 'portrait (interior/detail)' : 'square';

  return `${label}: dominant colour=${colourName}, brightness=${brightDesc}, orientation=${orientation}, resolution=${img.width}x${img.height}`;
}

// ── Groq API call ───────────────────────────────────────
async function callGroq(apiKey, photoCount, capBlock) {
  const systemPrompt =
    'You are an expert Australian automotive copywriter for Carsales, Drive.com.au and Facebook Marketplace. ' +
    'Write professionally, concisely and factually. Never invent specifications.';

  const userPrompt =
    `Here is a canvas-based visual analysis of ${photoCount} photos of a vehicle listed for sale:\n\n` +
    `${capBlock}\n\n` +
    `Write:\n` +
    `1. A compelling headline (max 10 words)\n` +
    `2. A professional 2-3 sentence listing description suitable for Carsales\n` +
    `3. JSON block at end:\n` +
    `{"make":"...","model":"...","year_est":"...","colour":"...","body_type":"...","condition":"...","features":["...","..."]}\n\n` +
    `Use "Unknown" for anything you cannot determine. Be factual.`;

  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      temperature: 0.35,
      max_tokens: 600
    })
  });

  if (!res.ok) {
    const e = await res.json();
    throw new Error(e.error?.message || `Groq error ${res.status}`);
  }

  const data = await res.json();
  return data.choices[0]?.message?.content || '';
}

// ── Result display ──────────────────────────────────────
function displayResult(raw) {
  // Extract structured JSON from end of response
  let structured = {};
  try {
    const match = raw.match(/\{[\s\S]*?"make"[\s\S]*?\}/);
    if (match) structured = JSON.parse(match[0]);
  } catch {}

  const bodyText = raw.replace(/\{[\s\S]*?\}$/, '').trim();

  document.getElementById('descTxt').textContent = bodyText;

  const tags = [
    structured.make,
    structured.model,
    structured.year_est,
    structured.colour,
    structured.body_type,
    structured.condition ? 'Condition: ' + structured.condition : null,
    ...(structured.features || []).slice(0, 3)
  ].filter(Boolean).filter(t => t !== 'Unknown');

  document.getElementById('descTags').innerHTML =
    tags.map(t => `<span class="dtag">${t}</span>`).join('');

  document.getElementById('descOut').classList.add('show');
}

// ── Copy to clipboard ───────────────────────────────────
export function copyDesc() {
  const text = document.getElementById('descTxt').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector('.copy-btn');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 1400);
  });
}
