import * as THREE from 'three';
import { RoomEnvironment } from './vendor/jsm/RoomEnvironment.js';

const stage = document.getElementById('stage');
if (stage) init();

async function init() {
  const canvas = stage.querySelector('canvas');
  const caps = [...stage.querySelectorAll('.cap')];
  const outro = stage.querySelector('.stage-outro');
  const steps = [...stage.querySelectorAll('.stage-steps li')];
  const bar = stage.querySelector('.stage-progress i');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
  catch { stage.hidden = true; return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.shadowMap.autoUpdate = false;      // shadows refresh only when the pose changes

  await Promise.all(['700 40px "Bricolage Grotesque"', '600 20px "Bricolage Grotesque"', '400 20px "Instrument Sans"', '600 20px "Instrument Sans"', 'italic 40px "Instrument Serif"']
    .map(f => document.fonts.load(f).catch(() => {})));
  const loadImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  const photos = await Promise.all([1, 2, 3].map(n => loadImg(`3d/photo-${n}.jpg`)));

  // ---------------------------------------------------------------- design space
  const W = 1600, H = 1000, U = 3.2 / W;          // design px -> world units
  const Q = 1.1;                                   // texture px per design px
  const INK = '#151412', CREAM = '#f3efe6', ORANGE = '#f04420', ORANGE_INK = '#b93414';

  function tex(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = Math.round(w * Q); c.height = Math.round(h * Q);
    const g = c.getContext('2d'); g.scale(Q, Q);
    draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  }
  const rr = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  const cover = (g, img, x, y, w, h) => {
    if (!img) { g.fillStyle = '#c9b9a0'; g.fillRect(x, y, w, h); return; }
    const s = Math.max(w / img.width, h / img.height), iw = img.width * s, ih = img.height * s;
    g.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
  };
  function wrap(g, text, x, y, maxW, lh) {
    let line = '', yy = y;
    for (const word of text.split(' ')) {
      const test = line ? line + ' ' + word : word;
      if (g.measureText(test).width > maxW && line) { g.fillText(line, x, yy); line = word; yy += lh; } else line = test;
    }
    g.fillText(line, x, yy);
    return yy;
  }

  // ---------------------------------------------------------------- the two designs
  // Each layer: id, old {rect, draw}, new {rect, draw}. Rects are [x, y, w, h] in design px.
  const SERIF = '"Times New Roman", Times, serif', COMIC = '"Comic Sans MS", "Chalkboard SE", cursive';
  const layers = [
    { id: 'bg',
      old: { r: [0, 0, W, H], d: (g, w, h) => {
        g.fillStyle = '#d8d2c0'; g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(0,0,0,.07)'; g.lineWidth = 1;
        for (let i = 0; i < w; i += 24) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); }
        for (let j = 0; j < h; j += 24) { g.beginPath(); g.moveTo(0, j); g.lineTo(w, j); g.stroke(); }
        g.strokeStyle = '#6b5f46'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
      } },
      new: { r: [0, 0, W, H], d: (g, w, h) => { g.fillStyle = CREAM; g.fillRect(0, 0, w, h); } },
      ex: { z: 0, y: 0, rx: 0, ry: 0, rz: 0 } },
    { id: 'header',
      old: { r: [0, 0, W, 190], d: (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#0a2a8a'); gr.addColorStop(1, '#2a6bd8');
        g.fillStyle = gr; g.fillRect(0, 0, w, 112);
        g.fillStyle = '#ffee00'; g.font = `bold 52px ${COMIC}`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('*** WELCOME TO OUR WEBSITE!!! ***', w / 2, 58);
        g.fillStyle = '#c8c3b0'; g.fillRect(0, 112, w, 78);
        g.strokeStyle = '#7d7866'; g.lineWidth = 3; g.strokeRect(1.5, 112, w - 3, 78);
        g.font = `28px ${SERIF}`; g.fillStyle = '#0000ee'; g.textAlign = 'left';
        let x = 70; for (const t of ['Home', 'About Us', 'Services', 'Gallery', 'Links', 'Contact Us']) {
          g.fillText(t, x, 152); const m = g.measureText(t).width; g.fillRect(x, 160, m, 2);
          g.fillStyle = '#000'; g.fillText('|', x + m + 26, 150); g.fillStyle = '#0000ee'; x += m + 70;
        }
      } },
      new: { r: [60, 30, 1480, 92], d: (g, w, h) => {
        rr(g, 0, 0, w, h, 46); g.fillStyle = '#fff'; g.fill(); g.strokeStyle = 'rgba(21,20,18,.08)'; g.lineWidth = 2; g.stroke();
        g.fillStyle = INK; rr(g, 26, 22, 48, 48, 14); g.fill();
        g.fillStyle = ORANGE; g.beginPath(); g.arc(50, 46, 9, 0, 7); g.fill();
        g.fillStyle = INK; g.font = '700 30px "Bricolage Grotesque"'; g.textBaseline = 'middle'; g.textAlign = 'left';
        g.fillText('Your Business', 92, 47);
        g.font = '500 24px "Instrument Sans"'; g.fillStyle = '#4a4741';
        let x = 700; for (const t of ['Services', 'About', 'Gallery', 'Visit']) { g.fillText(t, x, 47); x += g.measureText(t).width + 54; }
        rr(g, w - 214, 16, 188, 60, 30); g.fillStyle = INK; g.fill();
        g.fillStyle = '#fff'; g.font = '600 24px "Instrument Sans"'; g.textAlign = 'center'; g.fillText('Book now', w - 120, 47);
      } },
      ex: { z: 1.0, y: 0.26, rx: -0.22, ry: 0.1, rz: 0.015 } },
    { id: 'hero',
      old: { r: [90, 250, 520, 330], d: (g, w, h) => {
        g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
        const c = document.createElement('canvas'); c.width = 96; c.height = 60;
        const cg = c.getContext('2d'); cover(cg, photos[0], 0, 0, 96, 60);
        g.imageSmoothingEnabled = false; g.drawImage(c, 10, 10, w - 20, h - 20);
        g.strokeStyle = '#333'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
      } },
      new: { r: [60, 150, 900, 530], d: (g, w, h) => {
        g.save(); rr(g, 0, 0, w, h, 34); g.clip(); cover(g, photos[0], 0, 0, w, h);
        const gr = g.createLinearGradient(0, h * .55, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.45)');
        g.fillStyle = gr; g.fillRect(0, 0, w, h); g.restore();
        g.fillStyle = '#fff'; g.font = '500 24px "Instrument Sans"'; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
        g.fillText('Open today  ·  Miami, FL', 36, h - 34);
      } },
      ex: { z: 0.62, y: 0.0, rx: 0.1, ry: -0.18, rz: -0.02 } },
    { id: 'text',
      old: { r: [660, 240, 850, 290], d: (g, w, h) => {
        g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillStyle = '#cc0000'; g.font = `bold 62px ${COMIC}`; g.fillText('Welcome!', w / 2, 66);
        g.fillStyle = '#000'; g.font = `27px ${SERIF}`;
        wrap(g, 'We are a family owned business serving customers since 1998. We offer many products and services at great prices. Please look around our site and call us today for more information about what we can do for you.', w / 2, 128, w - 30, 38);
      } },
      new: { r: [1000, 165, 540, 370], d: (g, w, h) => {
        g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = INK;
        g.font = '700 70px "Bricolage Grotesque"';
        g.fillText('Your business,', 0, 66); g.fillText('made', 0, 138);
        g.fillStyle = ORANGE_INK; g.font = 'italic 92px "Instrument Serif"'; g.fillText('unforgettable.', 0, 224);
        g.fillStyle = '#4a4741'; g.font = '400 26px "Instrument Sans"';
        wrap(g, 'A fast, modern website that helps customers find you, trust you and get in touch.', 0, 292, w - 20, 38);
      } },
      ex: { z: 1.35, y: 0.12, rx: -0.12, ry: 0.2, rz: 0.03 } },
    { id: 'cta',
      old: { r: [785, 545, 180, 56], d: (g, w, h) => {
        g.fillStyle = '#d4d0c8'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#fff'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h);
        g.fillStyle = '#808080'; g.fillRect(0, h - 3, w, 3); g.fillRect(w - 3, 0, 3, h);
        g.fillStyle = '#000'; g.font = `24px ${SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Click Here', w / 2, h / 2 + 1);
      } },
      new: { r: [1000, 575, 250, 70], d: (g, w, h) => {
        rr(g, 0, 0, w, h, 35); g.fillStyle = ORANGE; g.fill();
        g.fillStyle = '#fff'; g.font = '600 26px "Instrument Sans"'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('Book your visit  →', w / 2, h / 2 + 1);
      } },
      ex: { z: 1.75, y: -0.1, rx: 0.14, ry: 0.28, rz: -0.05 } },
    ...[0, 1, 2].map(i => ({ id: 'card' + i,
      old: { r: [90 + i * 490, 650, 440, 230], d: (g, w, h) => {
        g.fillStyle = '#e6e2d4'; g.fillRect(0, 0, w, h); g.strokeStyle = '#555'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
        g.fillStyle = '#a8a496'; g.fillRect(18, 18, 140, 110);
        g.fillStyle = '#000'; g.font = `bold 26px ${SERIF}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
        g.fillText(['Product 1', 'Product 2', 'Product 3'][i], 176, 54);
        g.font = `19px ${SERIF}`; wrap(g, 'Click here to learn more about this item.', 176, 88, w - 196, 26);
        g.fillStyle = '#0000ee'; g.fillText('more info...', 18, h - 22);
      } },
      new: { r: [60 + i * 500, 715, 470, 215], d: (g, w, h) => {
        g.save(); rr(g, 0, 0, w, h, 28); g.fillStyle = '#fff'; g.fill(); g.clip();
        g.save(); g.beginPath(); g.rect(0, 0, 190, h); g.clip(); cover(g, photos[[1, 2, 0][i]], 0, 0, 190, h); g.restore();
        g.restore();
        g.fillStyle = INK; g.font = '700 32px "Bricolage Grotesque"'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
        g.fillText(['Our story', 'What we do', 'Visit us'][i], 216, 76);
        g.fillStyle = '#6b665c'; g.font = '400 21px "Instrument Sans"';
        wrap(g, ['Who we are and why we do it.', 'Everything we offer, made simple.', 'Hours, map and directions.'][i], 216, 112, w - 236, 30);
        g.fillStyle = ORANGE_INK; g.font = '600 21px "Instrument Sans"'; g.fillText('Learn more →', 216, h - 30);
      } },
      ex: [{ z: 0.7, y: -0.2, rx: 0.18, ry: -0.3, rz: 0.04 }, { z: 1.05, y: -0.3, rx: 0.2, ry: 0.0, rz: -0.03 }, { z: 0.85, y: -0.22, rx: 0.16, ry: 0.32, rz: 0.05 }][i] })),
    { id: 'footer',
      old: { r: [0, 920, W, 80], d: (g, w, h) => {
        g.fillStyle = '#b8b4a2'; g.fillRect(0, 0, w, h); g.fillStyle = '#000'; g.font = `18px ${SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('Copyright 2009. All rights reserved.  Best viewed in Internet Explorer 6.  You are visitor number 003412', w / 2, h / 2);
      } },
      new: { r: [60, 950, 1480, 36], d: (g, w, h) => {
        g.fillStyle = '#6b665c'; g.font = '500 20px "Instrument Sans"'; g.textBaseline = 'middle'; g.textAlign = 'left';
        g.fillText('Open today 9–6   ·   Miami, FL   ·   Tap to call or get directions', 4, h / 2);
        g.textAlign = 'right'; g.fillText('© Your Business', w - 4, h / 2);
      } },
      ex: { z: 0.35, y: -0.42, rx: 0.1, ry: 0.06, rz: 0.0 } },
  ];

  // ---------------------------------------------------------------- scene
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.05).texture;
  scene.environmentIntensity = 0.45;

  const key = new THREE.DirectionalLight(0xfff3e4, 1.5);
  key.position.set(-1.2, 1.8, 6.5); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 10; key.shadow.blurSamples = 10; key.shadow.bias = -0.0003; key.shadow.normalBias = 0.02;
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 16 });
  scene.add(key);
  scene.add(new THREE.AmbientLight(0xfff6ee, 0.8));

  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 60);

  const rig = new THREE.Group(); scene.add(rig);           // whole browser window
  const CW = 3.2, CH = 2.0, BAR = 0.17, BZ = 0.07;         // content size, toolbar height, bezel
  const winW = CW + BZ * 2, winH = CH + BAR + BZ * 2;

  // frame: rounded slab with a recessed screen
  const shape = new THREE.Shape(); const R = 0.1;
  const hw = winW / 2, hh = winH / 2;
  shape.moveTo(-hw + R, -hh); shape.lineTo(hw - R, -hh); shape.quadraticCurveTo(hw, -hh, hw, -hh + R);
  shape.lineTo(hw, hh - R); shape.quadraticCurveTo(hw, hh, hw - R, hh); shape.lineTo(-hw + R, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - R); shape.lineTo(-hw, -hh + R); shape.quadraticCurveTo(-hw, -hh, -hw + R, -hh);
  const frameGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.018, bevelSegments: 5, curveSegments: 20 });
  const frame = new THREE.Mesh(frameGeo, new THREE.MeshStandardMaterial({ color: 0x23211f, metalness: 0.85, roughness: 0.32 }));
  frame.position.z = -0.0825; frame.castShadow = true; frame.receiveShadow = true; rig.add(frame);

  // toolbar (browser chrome) - lives on the frame, never explodes
  const barTex = tex(CW / U, BAR / U, (g, w, h) => {
    g.fillStyle = '#2b2926'; g.fillRect(0, 0, w, h);
    ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(34 + i * 30, h / 2, 8, 0, 7); g.fill(); });
    rr(g, w / 2 - 330, h / 2 - 20, 660, 40, 20); g.fillStyle = '#3a3835'; g.fill();
    g.fillStyle = '#aaa59a'; g.font = '400 20px "Instrument Sans"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('yourbusiness.com', w / 2, h / 2 + 1);
  });
  const bar3 = new THREE.Mesh(new THREE.PlaneGeometry(CW, BAR), new THREE.MeshStandardMaterial({ map: barTex, roughness: 0.6, metalness: 0 }));
  bar3.position.set(0, CH / 2 + BAR / 2 - 0.0 - (BAR - BAR) , 0.002);
  bar3.position.y = (CH + BAR) / 2 - BAR / 2 + 0.0 - 0.0; // top of window content area
  const screen = new THREE.Group(); screen.position.y = -BAR / 2; rig.add(screen);   // layer origin = centre of content area
  bar3.position.set(0, CH / 2 + BAR / 2, 0.004); screen.add(bar3);

  // ---------------------------------------------------------------- layer meshes
  const mats = [];
  const items = layers.map((L, i) => {
    const mk = (spec, order) => {
      const [x, y, w, h] = spec.r;
      const map = tex(w, h, spec.d);
      const m = L.id === 'bg'
        ? new THREE.MeshBasicMaterial({ map, transparent: true })
        : new THREE.MeshStandardMaterial({ map, transparent: true, roughness: 0.55, metalness: 0, envMapIntensity: 0.5 });
      m.depthWrite = false;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w * U, h * U), m);
      mesh.renderOrder = order;
      mesh.userData = { cx: (x + w / 2 - W / 2) * U, cy: -(y + h / 2 - H / 2) * U };
      mats.push(m);
      return mesh;
    };
    const g = new THREE.Group();
    const o = mk(L.old, i * 2), n = mk(L.new, i * 2 + 1);
    n.material.opacity = 0; n.visible = false;
    g.add(o, n); screen.add(g);
    g.userData = { L, o, n, i, z0: 0.006 + i * 0.0012 };
    return g;
  });

  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(CW, CH), new THREE.ShadowMaterial({ opacity: 0.2, transparent: true, depthWrite: false }));
  catcher.position.z = 0.0065; catcher.receiveShadow = true; catcher.renderOrder = 1.5; screen.add(catcher);

  // soft contact shadow behind the window
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.14 }));
  floor.position.z = -1.5; floor.receiveShadow = true; scene.add(floor);

  // ---------------------------------------------------------------- timeline
  const clamp01 = x => Math.min(1, Math.max(0, x));
  const sm = x => x * x * x * (x * (x * 6 - 15) + 10);                // smootherstep
  const seg = (p, a, b) => sm(clamp01((p - a) / (b - a)));
  const lerp = (a, b, t) => a + (b - a) * t;
  const backOut = t => { const c = 1.35; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

  const pin = stage.querySelector('.stage-pin');
  let lastW = 0, lastH = 0, dirty = true;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h || (w === lastW && h === lastH)) return;
    lastW = w; lastH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.userData.base = Math.max((winW * 1.12) / (2 * tan * camera.aspect), (winH * 1.7) / (2 * tan), 6);
    measure(); dirty = true;
  }

  // Scroll geometry is cached, so reading progress never forces a layout inside the frame loop.
  let top = 0, travel = 1;
  function measure() {
    top = stage.getBoundingClientRect().top + scrollY;
    travel = Math.max(1, stage.offsetHeight - pin.clientHeight);
  }
  const progressNow = () => clamp01((scrollY - top) / travel);
  new ResizeObserver(resize).observe(canvas);
  addEventListener('load', () => { measure(); dirty = true; });
  resize();

  let cur = reduce ? 0.93 : progressNow(), visible = false, running = false, last = 0;
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !running) { running = true; last = 0; requestAnimationFrame(tick); }
  }, { rootMargin: '200px' }).observe(stage);

  function pose(p) {
    const burst = seg(p, 0.16, 0.42);            // break apart
    const hold = 1;                              // fully exploded plateau 0.42 - 0.52
    const swap = seg(p, 0.40, 0.58);             // old -> new content while floating
    const build = seg(p, 0.56, 0.84);            // reassemble
    const snap = clamp01((p - 0.78) / 0.14);     // settle with a tiny overshoot
    const spread = clamp01(burst - build);       // 0 assembled .. 1 exploded

    // window orbit: reveal depth while exploded, face front when done
    const yaw = lerp(-0.34, 0.52, seg(p, 0.12, 0.46)) * (1 - seg(p, 0.6, 0.9));
    const pitch = lerp(0.1, 0.2, seg(p, 0.12, 0.4)) * (1 - seg(p, 0.6, 0.9));
    rig.rotation.set(pitch, yaw, 0);
    const outroLift = seg(p, 0.9, 1);
    rig.position.set(0, 0.14 + outroLift * 0.55, 0);
    rig.scale.setScalar(1 - outroLift * 0.2);
    camera.position.set(0, 0.0, camera.userData.base * (1 - seg(p, 0.84, 1) * 0.04));
    camera.lookAt(0, 0.02 + outroLift * 0.18, 0);

    items.forEach(g => {
      const { L, o, n, i, z0 } = g.userData;
      const ex = L.ex;
      const stag = i * 0.012;
      const s = clamp01(seg(p, 0.16 + stag, 0.42 + stag) - seg(p, 0.56 + stag * .6, 0.84 + stag * .6));
      const settle = snap > 0 && snap < 1 ? Math.max(0, backOut(snap) - 1) * 0.04 : 0;
      // path: old rect centre -> (floating) -> new rect centre. Position in the plane eases to the new centre during the swap.
      const mv = seg(p, 0.44, 0.74);
      const cx = lerp(o.userData.cx, n.userData.cx, mv), cy = lerp(o.userData.cy, n.userData.cy, mv);
      g.position.set(cx + ex.ry * 0.35 * s, cy + ex.y * s * (L.id === 'bg' ? 0 : 1), z0 + ex.z * s + settle);
      g.rotation.set(ex.rx * s, ex.ry * s, ex.rz * s);
      // content swap while fully airborne
      const nOp = seg(p, 0.44, 0.54), oOp = L.id === 'bg' ? (nOp >= 1 ? 0 : 1) : 1 - seg(p, 0.38, 0.48);
      o.material.opacity = oOp; n.material.opacity = nOp;
      o.visible = oOp > 0.001; n.visible = nOp > 0.001;
      const casts = L.id !== 'text' && L.id !== 'footer';
      o.castShadow = casts && oOp > 0.5; n.castShadow = casts && nOp > 0.5;
    });
    // bg layer is the page itself; give it a hint of lift in the closing frames
    return spread;
  }

  function setCopy(p) {
    const phase = p < 0.16 ? 0 : p < 0.56 ? 1 : p < 0.9 ? 2 : 3;
    caps.forEach((c, i) => c.classList.toggle('on', i === phase));
    steps.forEach((s, i) => s.classList.toggle('on', i <= Math.min(phase, 2)));
    outro.classList.toggle('on', p > 0.9);
    stage.classList.toggle('done', p > 0.9);
    if (bar) bar.style.height = (p * 100).toFixed(1) + '%';
  }

  // Frame-rate independent smoothing (~45ms time constant): follows the scrollbar closely, never lags or overshoots,
  // and gives the same feel at 60 and 120 Hz. Output is a pure function of progress, so reversing is exact.
  const TAU = reduce ? 0.001 : 0.045;
  function tick(now) {
    if (!visible) { running = false; return; }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60; last = now;
    const target = reduce ? 0.93 : progressNow();
    const diff = target - cur;
    if (Math.abs(diff) > 0.0002 || dirty) {
      cur = Math.abs(diff) < 0.0004 ? target : cur + diff * (1 - Math.exp(-dt / TAU));
      pose(cur); setCopy(cur);
      renderer.shadowMap.needsUpdate = true;
      renderer.render(scene, camera);
      dirty = false;
    }
    requestAnimationFrame(tick);
  }
}
