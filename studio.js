/**
 * studio.js — Three.js 360° studio engine
 *
 * Loaded as a classic <script> (NOT a module) so it can access
 * the global THREE object loaded by the Three.js CDN script above it.
 *
 * Exposes:
 *   window.heroStudio  — studio instance for hero canvas
 *   window.mainStudio  — studio instance for the main viewer canvas
 *   window.toggleRot   — toggle auto-rotate (called from HTML button)
 *   window.doZoom      — zoom in/out
 *   window.resetCam    — reset camera position
 */

/* global THREE */
const GOLD = 0xc8a44a;

/**
 * Create a studio instance on a canvas element.
 * @param {HTMLCanvasElement} canvasEl
 * @param {number} heightPx
 * @returns {{ setImage, drawDefault, toggleAuto, zoom, reset }}
 */
function makeStudio(canvasEl, heightPx) {
  // ── Scene ──────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x060c1a, 0.038);
  scene.background = new THREE.Color(0x06090f);

  const getWidth = () => canvasEl.parentElement?.clientWidth || 500;
  const camera = new THREE.PerspectiveCamera(44, getWidth() / heightPx, 0.1, 200);
  camera.position.set(0, 1.4, 7);

  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(getWidth(), heightPx);
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  window.addEventListener('resize', () => {
    renderer.setSize(getWidth(), heightPx, false);
    camera.aspect = getWidth() / heightPx;
    camera.updateProjectionMatrix();
  });

  // ── Lighting ───────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x1a2940, 1.3));

  const keyLight = new THREE.DirectionalLight(0xfff5d6, 3.8);
  keyLight.position.set(-5, 9, 5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x6688cc, 1.5);
  fillLight.position.set(7, 4, -3);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xc8a44a, 1.8);
  rimLight.position.set(0, 3, -8);
  scene.add(rimLight);

  // ── Floor + grid ───────────────────────────────────
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 50),
    new THREE.MeshStandardMaterial({ color: 0x05090e, metalness: 0.7, roughness: 0.35 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.6;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(40, 40, 0x0c1e36, 0x0c1e36);
  grid.position.y = -1.6;
  grid.material.opacity = 0.3;
  grid.material.transparent = true;
  scene.add(grid);

  // ── Platform ───────────────────────────────────────
  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(2.8, 3.05, 0.14, 80),
    new THREE.MeshStandardMaterial({ color: 0x0a1525, metalness: 0.85, roughness: 0.2 })
  );
  platform.position.y = -1.54;
  platform.receiveShadow = true;
  scene.add(platform);

  // ── Gold ring ──────────────────────────────────────
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.9, 3.1, 80),
    new THREE.MeshStandardMaterial({
      color: GOLD, metalness: 1, roughness: 0.08,
      emissive: GOLD, emissiveIntensity: 0.45,
      side: THREE.DoubleSide, transparent: true, opacity: 0.88
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -1.46;
  scene.add(ring);

  // Outer accent ring
  const outerRing = new THREE.Mesh(
    new THREE.RingGeometry(5, 5.2, 80),
    new THREE.MeshStandardMaterial({
      color: 0x2244aa, metalness: 1, roughness: 0.2,
      transparent: true, opacity: 0.22, side: THREE.DoubleSide
    })
  );
  outerRing.rotation.x = -Math.PI / 2;
  outerRing.position.y = -1.44;
  scene.add(outerRing);

  // ── Studio softboxes ───────────────────────────────
  [[-5, 3, 3, 0.5], [5, 3, 3, -0.5], [0, 5.5, -10, Math.PI]].forEach(([x, y, z, ry]) => {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 1.1, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x1a2840 })
    ));
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(1.55, 0.92),
      new THREE.MeshStandardMaterial({
        color: 0xfff9ee, emissive: 0xfff5d8, emissiveIntensity: 0.75, roughness: 1
      })
    );
    panel.position.z = 0.028;
    group.add(panel);
    group.position.set(x, y, z);
    group.rotation.y = ry;
    scene.add(group);
  });

  // ── Gold dust particles ────────────────────────────
  const particles = [];
  for (let i = 0; i < 60; i++) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.013, 4, 4),
      new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: Math.random() * 0.4 + 0.1 })
    );
    mesh.position.set(
      (Math.random() - 0.5) * 16,
      (Math.random() - 0.5) * 9 + 1,
      (Math.random() - 0.5) * 9
    );
    mesh.userData.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 0.003,
      (Math.random() - 0.5) * 0.002 + 0.001,
      (Math.random() - 0.5) * 0.003
    );
    scene.add(mesh);
    particles.push(mesh);
  }

  // ── Car billboard (texture plane) ─────────────────
  const billCanvas = document.createElement('canvas');
  billCanvas.width = 1024;
  billCanvas.height = 600;
  const billCtx = billCanvas.getContext('2d');
  const billTex = new THREE.CanvasTexture(billCanvas);

  const billboard = new THREE.Mesh(
    new THREE.PlaneGeometry(5.4, 3.1),
    new THREE.MeshStandardMaterial({
      map: billTex, transparent: true, roughness: 0.28, metalness: 0.04, side: THREE.DoubleSide
    })
  );
  billboard.position.y = 0.08;
  billboard.castShadow = true;
  scene.add(billboard);

  function drawDefault() {
    const c = billCtx, w = 1024, h = 600;
    c.clearRect(0, 0, w, h);
    c.fillStyle = 'rgba(200,164,74,.05)';
    c.beginPath();
    c.roundRect ? c.roundRect(40, 40, w - 80, h - 80, 18) : c.rect(40, 40, w - 80, h - 80);
    c.fill();
    c.strokeStyle = 'rgba(200,164,74,.13)';
    c.lineWidth = 1.5;
    c.stroke();
    c.font = '60px serif';
    c.textAlign = 'center';
    c.fillStyle = 'rgba(255,255,255,.08)';
    c.fillText('🚗', w / 2, h / 2 + 8);
    c.font = '500 16px DM Sans,sans-serif';
    c.fillStyle = 'rgba(255,255,255,.18)';
    c.fillText('Upload photos to build your 360° studio', w / 2, h / 2 + 62);
    billTex.needsUpdate = true;
  }
  drawDefault();

  function setImage(dataURL) {
    const img = new Image();
    img.onload = () => {
      billCtx.clearRect(0, 0, 1024, 600);
      const s = Math.min(1024 / img.width, 600 / img.height);
      billCtx.drawImage(img, (1024 - img.width * s) / 2, (600 - img.height * s) / 2, img.width * s, img.height * s);
      billTex.needsUpdate = true;
    };
    img.src = dataURL;
  }

  // ── Orbit controls ─────────────────────────────────
  let theta = 0, phi = 0.26, radius = 7, autoRotate = true;
  let dragging = false, prevX = 0, prevY = 0;

  canvasEl.addEventListener('mousedown', e => { dragging = true; prevX = e.clientX; prevY = e.clientY; });
  window.addEventListener('mouseup', () => { dragging = false; });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    theta -= (e.clientX - prevX) * 0.008;
    phi = Math.max(0.04, Math.min(0.95, phi + (e.clientY - prevY) * 0.005));
    prevX = e.clientX; prevY = e.clientY;
  });
  canvasEl.addEventListener('touchstart', e => { dragging = true; prevX = e.touches[0].clientX; prevY = e.touches[0].clientY; }, { passive: true });
  window.addEventListener('touchend', () => { dragging = false; });
  window.addEventListener('touchmove', e => {
    if (!dragging) return;
    theta -= (e.touches[0].clientX - prevX) * 0.008;
    phi = Math.max(0.04, Math.min(0.95, phi + (e.touches[0].clientY - prevY) * 0.005));
    prevX = e.touches[0].clientX; prevY = e.touches[0].clientY;
  }, { passive: true });
  canvasEl.addEventListener('wheel', e => {
    radius = Math.max(3.5, Math.min(13, radius + e.deltaY * 0.01));
    e.preventDefault();
  }, { passive: false });

  // ── Render loop ────────────────────────────────────
  const clock = new THREE.Clock();
  (function loop() {
    requestAnimationFrame(loop);
    const t = clock.getElapsedTime();
    if (autoRotate) theta += 0.004;

    camera.position.x = radius * Math.sin(theta) * Math.cos(phi);
    camera.position.y = radius * Math.sin(phi) + 0.4;
    camera.position.z = radius * Math.cos(theta) * Math.cos(phi);
    camera.lookAt(0, 0.1, 0);

    platform.rotation.y = t * 0.1;
    ring.rotation.z = t * 0.065;
    ring.material.opacity = 0.65 + Math.sin(t * 1.5) * 0.2;

    particles.forEach(p => {
      p.position.add(p.userData.velocity);
      if (p.position.y > 5)  p.position.y = -2;
      if (p.position.y < -2) p.position.y = 5;
      if (Math.abs(p.position.x) > 8) p.userData.velocity.x *= -1;
      if (Math.abs(p.position.z) > 6) p.userData.velocity.z *= -1;
    });

    renderer.render(scene, camera);
  })();

  return {
    setImage,
    drawDefault,
    toggleAuto: () => { autoRotate = !autoRotate; },
    zoom: delta => { radius = Math.max(3.5, Math.min(13, radius + delta)); },
    reset: () => { theta = 0; phi = 0.26; radius = 7; autoRotate = true; }
  };
}

// ── Init both canvases ─────────────────────────────
const HERO_H = Math.min(window.innerHeight * 0.6, 520);
window.heroStudio = makeStudio(document.getElementById('heroCanvas'), HERO_H);
window.mainStudio = makeStudio(document.getElementById('studioCanvas'), 400);

// Expose orbit controls to HTML button handlers
window.toggleRot = () => {
  mainStudio.toggleAuto();
  document.getElementById('btnRot').classList.toggle('on');
};
window.doZoom    = d => mainStudio.zoom(d);
window.resetCam  = ()  => mainStudio.reset();
