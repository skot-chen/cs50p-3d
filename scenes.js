// 3D memory scenes, one per lecture. Each scene turns the lecture's core idea into a picture you can play with.
// mount(el, key) builds the stage inside el and returns a dispose() function.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const SANS = '"PingFang SC","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif';
const MONO = 'ui-monospace,"Cascadia Mono",Consolas,"Microsoft YaHei",monospace';
const C = {
  bg: "#0d1424", panel: "#1c2740", steel: "#33415f", cyan: "#5ee6ff", amber: "#ffb84d",
  green: "#4ade80", red: "#f87171", violet: "#a78bfa", pink: "#f472b6", paper: "#f3efe4", text: "#e8eefc",
};
const HOUSES = { Gryffindor: "#c0392b", Hufflepuff: "#e8b923", Ravenclaw: "#2e5fb8", Slytherin: "#2e8b57" };

// ---------- small 3D helpers ----------
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// A text label that always faces the camera. o.h = world height of one line.
function label(text, o = {}) {
  const mat = new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.userData.o = { size: 48, color: C.text, bg: "rgba(13,20,36,.85)", h: 0.42, mono: false, bold: false, ...o };
  s.renderOrder = 10;
  setText(s, text);
  return s;
}
function setText(s, text, patch) {
  if (patch) Object.assign(s.userData.o, patch);
  const o = s.userData.o;
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  const font = `${o.bold ? 700 : 500} ${o.size}px ${o.mono ? MONO : SANS}`;
  ctx.font = font;
  const lines = String(text).split("\n");
  const pad = o.size * 0.45, lh = o.size * 1.3;
  const w = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width), o.size) + pad * 2);
  const h = Math.ceil(lh * lines.length + pad * 0.8);
  c.width = w; c.height = h;
  ctx.font = font;
  if (o.bg) { ctx.fillStyle = o.bg; roundRect(ctx, 0, 0, w, h, Math.min(18, h / 2)); ctx.fill(); }
  if (o.border) { ctx.strokeStyle = o.border; ctx.lineWidth = 4; roundRect(ctx, 2, 2, w - 4, h - 4, Math.min(16, h / 2)); ctx.stroke(); }
  ctx.fillStyle = o.color; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  lines.forEach((l, i) => ctx.fillText(l, w / 2, pad * 0.4 + lh * (i + 0.5)));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (s.material.map) s.material.map.dispose();
  s.material.map = tex; s.material.needsUpdate = true;
  const k = o.h / lh;
  s.scale.set(w * k, h * k, 1);
  s.userData.text = text;
}

function mat(color, o = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1, ...o });
}
function box(w, h, d, color, o) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), color instanceof THREE.Material ? color : mat(color, o));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function at(obj, x, y, z) { obj.position.set(x, y, z); return obj; }
const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

// ---------- stage: renderer, camera, light, loop ----------
function createStage(el, { cam = [0, 4.2, 10], target = [0, 1.2, 0], fitWidth = 14 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(C.bg);
  scene.fog = new THREE.Fog(C.bg, 22, 42);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  const base = new THREE.Vector3(...cam);
  const tgt = new THREE.Vector3(...target);
  camera.position.copy(base);

  scene.add(new THREE.HemisphereLight("#cfe0ff", "#1a2235", 1.5));
  const sun = new THREE.DirectionalLight("#ffffff", 2.2);
  sun.position.set(6, 12, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12 });
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(16, 48), mat("#131c30", { roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(32, 32, "#2a3a5c", "#1b2742");
  grid.position.y = 0.002;
  scene.add(grid);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(tgt);
  Object.assign(controls, { enableDamping: true, enablePan: false, minDistance: 5, maxDistance: 26, maxPolarAngle: 1.45 });
  // Let a vertical swipe on a phone still scroll the page; a sideways drag rotates the scene.
  renderer.domElement.style.touchAction = "pan-y";

  const tweens = [];
  const frames = [];
  let alive = true, visible = true, raf = 0;

  function resize() {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Narrow screens: move the camera back so the whole scene still fits.
    const need = fitWidth / (2 * Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
    const dist = Math.max(base.distanceTo(tgt), need * 1.05);
    camera.position.copy(tgt).add(base.clone().sub(tgt).setLength(dist));
    controls.maxDistance = Math.max(26, dist * 1.4);
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) loop(); });
  io.observe(el);

  function loop() {
    cancelAnimationFrame(raf);
    if (!alive || !visible) return;
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    for (let i = tweens.length - 1; i >= 0; i--) {
      const t = tweens[i];
      const p = Math.min(1, (now - t.t0) / t.ms);
      t.fn(t.ease(p));
      if (p >= 1) { tweens.splice(i, 1); t.res(); }
    }
    frames.forEach((f) => f(now));
    controls.update();
    renderer.render(scene, camera);
  }
  resize();
  loop();

  const st = {
    scene, camera, renderer, controls,
    add(...objs) { objs.forEach((o) => scene.add(o)); return objs[0]; },
    anim(ms, fn, e = ease) { return new Promise((res) => tweens.push({ t0: performance.now(), ms, fn, ease: e, res })); },
    sleep(ms) { return st.anim(ms, () => {}); },
    onFrame(fn) { frames.push(fn); },
    move(obj, to, ms = 600, arc = 0) {
      const from = obj.position.clone();
      const dst = new THREE.Vector3(...to);
      return st.anim(ms, (p) => {
        obj.position.lerpVectors(from, dst, p);
        obj.position.y += arc * Math.sin(Math.PI * p);
      });
    },
    scaleTo(obj, s, ms = 300) {
      const from = obj.scale.clone();
      const dst = new THREE.Vector3(s, s, s);
      return st.anim(ms, (p) => obj.scale.lerpVectors(from, dst, p));
    },
    pulse(mesh, color, ms = 500) {
      const m = mesh.material;
      const old = m.emissive.clone();
      m.emissive.set(color);
      return st.anim(ms, (p) => { m.emissiveIntensity = 1 - p; }).then(() => { m.emissive.copy(old); m.emissiveIntensity = 1; });
    },
    shake(obj, ms = 400, amt = 0.08) {
      const x0 = obj.position.x;
      return st.anim(ms, (p) => { obj.position.x = x0 + Math.sin(p * 40) * amt * (1 - p); }).then(() => { obj.position.x = x0; });
    },
    dispose() {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
  return st;
}

// ---------- HTML controls under the scene ----------
function makeUI(bar, codeEl, statusEl) {
  let busy = false;
  const btns = [];
  const ui = {
    button(text, fn, cls = "") {
      const b = document.createElement("button");
      b.type = "button"; b.className = "sbtn " + cls; b.textContent = text;
      b.onclick = () => ui.run(fn);
      bar.appendChild(b); btns.push(b);
      return b;
    },
    input(value, width = "12em", ph = "") {
      const i = document.createElement("input");
      i.type = "text"; i.value = value; i.placeholder = ph; i.style.width = width; i.spellcheck = false;
      bar.appendChild(i);
      return i;
    },
    select(options, value) {
      const s = document.createElement("select");
      options.forEach((o) => { const op = document.createElement("option"); op.value = op.textContent = o; s.appendChild(op); });
      s.value = value ?? options[0];
      bar.appendChild(s);
      return s;
    },
    range(min, max, value, labelText) {
      const wrap = document.createElement("label");
      wrap.className = "srange";
      wrap.innerHTML = `<span>${labelText}</span>`;
      const r = document.createElement("input");
      r.type = "range"; r.min = min; r.max = max; r.value = value;
      const v = document.createElement("b"); v.textContent = value;
      r.addEventListener("input", () => (v.textContent = r.value));
      wrap.append(r, v);
      bar.appendChild(wrap);
      return r;
    },
    text(t) { const s = document.createElement("span"); s.className = "stext"; s.textContent = t; bar.appendChild(s); return s; },
    code(lines) {
      codeEl.innerHTML = "";
      const spans = lines.map((l) => {
        const d = document.createElement("div");
        d.textContent = l || " ";
        codeEl.appendChild(d);
        return d;
      });
      return (i) => spans.forEach((s, k) => s.classList.toggle("hi", k === i || (Array.isArray(i) && i.includes(k))));
    },
    say(t, kind = "") { statusEl.textContent = t; statusEl.className = "sstatus " + kind; },
    async run(fn) {
      if (busy) return;
      busy = true; btns.forEach((b) => (b.disabled = true));
      try { await fn(); } finally { busy = false; btns.forEach((b) => (b.disabled = false)); }
    },
  };
  return ui;
}

// =====================================================================
// Scenes. Each gets (st, ui) and builds itself.
// =====================================================================
const SCENES = {};

// ---- Lecture 0: a value goes through function machines into a variable box ----
SCENES.machine = (st, ui) => {
  const show = (s) => `"${s.replace(/ /g, "·")}"`;
  st.add(at(box(1.4, 0.2, 1.4, C.steel), -6, 0.1, 0), at(label("input()", { mono: true }), -6, 1.9, 0));
  const machines = [["str.strip()", "去掉两头空格", -3], ["str.title()", "首字母大写", 0]].map(([name, zh, x]) => {
    const g = new THREE.Group();
    const body = box(1.8, 1.6, 1.6, "#3b4a7a");
    body.position.y = 0.8;
    const mouth = box(0.1, 0.8, 0.9, "#0b1020");
    mouth.position.set(-0.9, 0.7, 0);
    const out = mouth.clone(); out.position.x = 0.9;
    const lamp = box(0.3, 0.3, 0.3, C.cyan, { emissive: C.cyan, emissiveIntensity: 0.4 });
    lamp.position.y = 1.75;
    g.add(body, mouth, out, lamp, at(label(name, { mono: true, color: C.cyan }), 0, 2.5, 0), at(label(zh, { h: 0.3 }), 0, -0.25, 1.05));
    g.position.x = x;
    st.add(g);
    return { g, body, lamp };
  });
  // the variable: an open amber box with a name sticker
  const vbox = new THREE.Group();
  const amber = mat(C.amber);
  vbox.add(at(box(1.6, 0.12, 1.6, amber), 0, 0.06, 0), at(box(1.6, 1, 0.1, amber), 0, 0.5, 0.75), at(box(1.6, 1, 0.1, amber), 0, 0.5, -0.75),
    at(box(0.1, 1, 1.6, amber), 0.75, 0.5, 0), at(box(0.1, 1, 1.6, amber), -0.75, 0.5, 0));
  vbox.add(at(label("name", { mono: true, bold: true, color: "#1b1300", bg: C.amber, h: 0.36 }), 0, 0.45, 0.95));
  vbox.position.x = 3;
  st.add(vbox);
  // the screen print() writes to
  const screen = new THREE.Group();
  screen.add(at(box(0.15, 1, 0.15, C.steel), 0, 0.5, 0), at(box(2.6, 1.6, 0.12, "#05080f"), 0, 1.7, 0));
  const out = at(label("", { mono: true, color: C.green, bg: null, h: 0.32 }), 0, 1.7, 0.2);
  screen.add(out, at(label("print()", { mono: true }), 0, 2.85, 0));
  screen.position.x = 6.2;
  st.add(screen);

  const token = box(0.7, 0.7, 0.7, C.cyan, { emissive: C.cyan, emissiveIntensity: 0.25 });
  const tag = label("", { mono: true, h: 0.34 });
  tag.position.y = 0.95;
  token.add(tag);
  st.add(token);
  const home = [-6, 0.55, 0];
  token.position.set(...home);

  const hi = ui.code(['raw = input("Name? ")', "name = raw.strip().title()   # 从左到右，一台接一台", 'print(f"hello, {name}")']);
  const inp = ui.input("   ada lovelace  ", "13em", "输入名字");
  setText(tag, show(inp.value));
  inp.addEventListener("input", () => setText(tag, show(inp.value)));
  ui.say("机器 = 函数；放进去的是参数，吐出来的是返回值。");

  ui.button("▶ 运行", async () => {
    const raw = inp.value;
    let v = raw;
    setText(out, "");
    token.position.set(...home); token.scale.setScalar(1); token.visible = true;
    setText(tag, show(raw));
    hi(0); ui.say(`input() 返回了一个字符串：${show(raw)}`);
    await st.sleep(700);
    hi(1);
    const steps = [(s) => s.trim(), (s) => s.toLowerCase().replace(/(^|[^a-z])([a-z])/g, (m, a, b) => a + b.toUpperCase())];
    for (let i = 0; i < 2; i++) {
      const m = machines[i], x = m.g.position.x;
      await st.move(token, [x - 1.5, 0.55, 0], 600, 1);
      await st.move(token, [x, 0.7, 0], 300);
      token.visible = false;
      await Promise.all([st.shake(m.g, 500), st.pulse(m.lamp, "#ffffff", 500)]);
      v = steps[i](v);
      setText(tag, show(v));
      token.visible = true;
      ui.say(`${i === 0 ? ".strip()" : ".title()"} 返回 ${show(v)}`);
      await st.move(token, [x + 1.5, 0.55, 0], 400);
    }
    await st.move(token, [3, 0.55, 0], 600, 1.4);
    ui.say(`= 把返回值放进变量盒子 name。盒子会一直留着这个值。`);
    await st.sleep(900);
    hi(2);
    const copy = token.clone(true);
    copy.material = token.material.clone();
    st.add(copy);
    await st.move(copy, [6.2, 1.7, 0.2], 700, 1.2);
    copy.removeFromParent();
    setText(out, `hello, ${v}`);
    ui.say(`print 只是「显示」：屏幕上出现 hello, ${v}。name 盒子里的值还在。`, "ok");
  }, "primary");
};

// ---- Lecture 1: a ball rolls past if / elif / else gates ----
SCENES.gates = (st, ui) => {
  const gates = [
    { cond: "score >= 90", out: "A", test: (s) => s >= 90, color: C.green },
    { cond: "score >= 80", out: "B", test: (s) => s >= 80, color: C.cyan },
    { cond: "score >= 70", out: "C", test: (s) => s >= 70, color: C.violet },
    { cond: "else", out: "F", test: () => true, color: C.red },
  ];
  const xs = [-4.5, -1.5, 1.5, 4.5];
  st.add(at(box(13, 0.15, 1.2, "#25324f"), 0, 0.075, 0));
  gates.forEach((g, i) => {
    const x = xs[i];
    const frame = new THREE.Group();
    const post = mat(C.steel);
    frame.add(at(box(0.15, 1.8, 0.15, post), 0, 0.9, -0.7), at(box(0.15, 1.8, 0.15, post), 0, 0.9, 0.7));
    g.bar = box(0.2, 0.2, 1.6, C.steel);
    g.bar.position.y = 1.8;
    frame.add(g.bar);
    g.tag = at(label(i === 3 ? "else:" : (i === 0 ? "if " : "elif ") + g.cond + ":", { mono: true, h: 0.3 }), 0, 2.4, 0);
    frame.add(g.tag);
    // a ramp to the bin in front of the gate
    const ramp = box(0.9, 0.08, 2.0, "#2a3a5c");
    ramp.position.set(0.0, 0.12, 1.6);
    frame.add(ramp);
    g.bin = new THREE.Group();
    const bm = mat(g.color, { transparent: true, opacity: 0.85 });
    g.bin.add(at(box(1.4, 0.1, 1.2, bm), 0, 0.05, 0), at(box(1.4, 0.7, 0.1, bm), 0, 0.35, 0.55), at(box(0.1, 0.7, 1.2, bm), 0.65, 0.35, 0), at(box(0.1, 0.7, 1.2, bm), -0.65, 0.35, 0));
    g.bin.add(at(label(g.out, { bold: true, size: 64, h: 0.5, color: g.color }), 0, 1.1, 0.4));
    g.bin.position.set(0, 0, 3.1);
    frame.add(g.bin);
    frame.position.x = x;
    st.add(frame);
  });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.38, 32, 16), mat(C.amber, { emissive: C.amber, emissiveIntensity: 0.2 }));
  ball.castShadow = true;
  const btag = label("", { bold: true, h: 0.32 });
  btag.position.y = 0.75;
  ball.add(btag);
  st.add(ball);
  const start = [-6.4, 0.53, 0];
  ball.position.set(...start);

  const hi = ui.code(["if score >= 90:", '    print("A")', "elif score >= 80:", '    print("B")', "elif score >= 70:", '    print("C")', "else:", '    print("F")']);
  const r = ui.range(0, 100, 85, "score =");
  setText(btag, r.value);
  r.addEventListener("input", () => setText(btag, r.value));
  ui.say("门从左到右检查。进了一扇门，后面的门就不再看。");

  ui.button("▶ 放球", async () => {
    const s = +r.value;
    setText(btag, s);
    gates.forEach((g) => g.bar.material.color.set(C.steel));
    ball.position.set(...start);
    for (let i = 0; i < gates.length; i++) {
      const g = gates[i];
      hi(i * 2);
      await st.move(ball, [xs[i], 0.53, 0], 650);
      const ok = g.test(s);
      g.bar.material.color.set(ok ? C.green : C.red);
      ui.say(i === 3 ? "前面全是 False，所以走 else。" : `${g.cond.replace("score", s)}  →  ${ok ? "True，进门！" : "False，继续往右"}`, ok ? "ok" : "");
      await st.sleep(450);
      if (ok) {
        hi(i * 2 + 1);
        await st.move(ball, [xs[i], 0.53, 1.0], 300);
        await st.move(ball, [xs[i], 0.5, 3.1], 650, 0.4);
        ui.say(`打印 ${g.out}。${i < 3 ? "后面的门根本没检查。" : ""}`, "ok");
        return;
      }
    }
  }, "primary");
};

// ---- Lecture 2: nested loops build a brick wall ----
SCENES.bricks = (st, ui) => {
  const group = new THREE.Group();
  st.add(group);
  const hud = at(label("i = -   j = -", { mono: true, h: 0.42, color: C.amber }), 0, 5.3, 0);
  st.add(hud);
  const hi = ui.code(["for i in range(rows):", "    for j in range(cols):", '        print("#", end="")', "    print()   # 换行"]);
  const rows = ui.range(1, 5, 3, "rows");
  const cols = ui.range(1, 6, 4, "cols");
  ui.say("内层循环（j）每次都要跑完一整圈，外层（i）才前进一步。");
  const brickMat = mat("#c8643c", { roughness: 0.8 });
  let speed = 1;

  ui.button("▶ 运行", async () => {
    group.clear();
    const R = +rows.value, K = +cols.value;
    const cx = (K - 1) / 2;
    speed = R * K > 16 ? 0.6 : 1;
    for (let i = 0; i < R; i++) {
      hi(0);
      setText(hud, `i = ${i}   j = -`);
      await st.sleep(350 * speed);
      for (let j = 0; j < K; j++) {
        hi(1);
        setText(hud, `i = ${i}   j = ${j}`);
        const b = box(0.95, 0.95, 0.95, brickMat);
        b.position.set((j - cx) * 1.05, 6, 0);
        group.add(b);
        hi(2);
        await st.move(b, [(j - cx) * 1.05, (R - 1 - i) * 1.02 + 0.5, 0], 380 * speed);
      }
      hi(3);
      ui.say(`第 ${i} 行盖完：内层跑了 ${K} 次。`);
      await st.sleep(300 * speed);
    }
    hi(-1);
    setText(hud, `完成：${R} × ${K} = ${R * K} 块`);
    ui.say(`外层 ${R} 次 × 内层 ${K} 次 = 一共 ${R * K} 次 print("#")。`, "ok");
  }, "primary");
};

// ---- Lecture 3: try is a tightrope, except is the safety net ----
SCENES.net = (st, ui) => {
  st.add(at(box(1.8, 2.4, 1.6, C.steel), -6, 1.2, 0), at(box(1.8, 2.4, 1.6, C.steel), 6, 1.2, 0));
  st.add(at(label("try:\n  x = int(text)", { mono: true, h: 0.3 }), -6, 4.3, 0));
  const elseTag = at(label("else:\n  print(x)", { mono: true, h: 0.3, color: C.green }), 6, 4.3, 0);
  st.add(elseTag);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 10.2, 8), mat("#d9d2c0"));
  rope.rotation.z = Math.PI / 2;
  rope.position.y = 2.4;
  st.add(rope);
  // net: a sagging wire grid
  const netGeo = new THREE.PlaneGeometry(8, 3, 16, 6);
  const pos = netGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i, -0.6 * (1 - (x / 4) ** 2) * (1 - (y / 1.5) ** 2));
  }
  const netMat = new THREE.MeshBasicMaterial({ color: C.red, wireframe: true, transparent: true, opacity: 0.7 });
  const net = new THREE.Mesh(netGeo, netMat);
  net.rotation.x = -Math.PI / 2;
  net.position.y = 0.7;
  st.add(net);
  st.add(at(label("except ValueError:", { mono: true, h: 0.3, color: C.red }), 0, 0.5, 2.1));
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.4, 32, 16), mat(C.cyan, { emissive: C.cyan, emissiveIntensity: 0.25 }));
  ball.castShadow = true;
  const tag = label("", { mono: true, h: 0.3 });
  tag.position.y = 0.8;
  ball.add(tag);
  st.add(ball);
  const startPos = [-6, 2.8, 0];
  ball.position.set(...startPos);
  const printed = at(label("", { mono: true, h: 0.34, color: C.green, bg: "#05080f" }), 6, 0.6, 1.2);
  st.add(printed);

  const hi = ui.code(["while True:", "    try:", "        x = int(input())", "    except ValueError:", '        print("x is not an integer")', "    else:", "        break", 'print(f"x is {x}")']);
  const inp = ui.input("cat", "8em", "输入值");
  ui.say("int() 把字符串变成整数。变不了就会抛出 ValueError。");
  const isInt = (s) => /^\s*[+-]?\d+(_\d+)*\s*$/.test(s);

  ui.button("▶ 试一下", async () => {
    const text = inp.value;
    setText(printed, "");
    ball.position.set(...startPos);
    ball.material.color.set(C.cyan);
    setText(tag, JSON.stringify(text));
    hi([0, 1, 2]);
    ui.say(`int(${JSON.stringify(text)}) ...`);
    await st.move(ball, [-1.5, 2.8, 0], 900);
    if (isInt(text)) {
      await st.move(ball, [6, 2.8, 0], 900);
      hi([5, 6]);
      ui.say("没出错：跳过 except，走 else，然后 break 跳出循环。", "ok");
      await st.sleep(500);
      hi(7);
      setText(printed, `x is ${parseInt(text.replace(/_/g, ""), 10)}`);
    } else {
      ball.material.color.set(C.red);
      hi([3, 4]);
      ui.say(`ValueError！掉进安全网，程序没有崩溃。`, "bad");
      await st.anim(600, (p) => { ball.position.y = 2.8 - p * p * 2.1; ball.position.x = -1.5 + p * 1.2; }, (p) => p);
      await st.anim(500, (p) => { ball.position.y = 0.7 + Math.sin(Math.PI * p) * 0.8; }, (p) => p);
      hi(0);
      ui.say("while True：回到起点，重新问一次。换一个能转成整数的值试试。");
      await st.move(ball, startPos, 1000, 2.5);
      ball.material.color.set(C.cyan);
    }
  }, "primary");
};

// ---- Lecture 4: modules are books; import takes the book, from ... import takes one page ----
SCENES.shelf = (st, ui) => {
  const mods = [
    { name: "random", fn: "choice", call: 'choice(["heads", "tails"])', color: "#e05d5d" },
    { name: "statistics", fn: "mean", call: "mean([100, 90])", color: "#e8b923" },
    { name: "sys", fn: "argv", call: "argv[1]", color: "#4ab37a" },
    { name: "json", fn: "loads", call: "loads(text)", color: "#4a8fe0" },
    { name: "csv", fn: "reader", call: "reader(file)", color: "#a073e0" },
  ];
  const shelf = new THREE.Group();
  const wood = mat("#6b4a2f", { roughness: 0.9 });
  shelf.add(at(box(9, 0.2, 1.4, wood), 0, 1.2, 0), at(box(9, 0.2, 1.4, wood), 0, 3.4, 0), at(box(0.2, 3.6, 1.4, wood), -4.5, 1.8, 0), at(box(0.2, 3.6, 1.4, wood), 4.5, 1.8, 0));
  shelf.position.z = -3;
  st.add(shelf);
  mods.forEach((m, i) => {
    m.book = box(0.7, 1.7, 1.1, m.color);
    m.home = [-3.2 + i * 1.6, 1.3 + 0.85, -3];
    m.book.position.set(...m.home);
    m.book.add(at(label(m.name, { mono: true, h: 0.26 }), 0, 1.2, 0.6));
    st.add(m.book);
  });
  const desk = new THREE.Group();
  desk.add(at(box(5, 0.2, 2.4, wood), 0, 1.2, 0), at(box(0.2, 1.2, 0.2, wood), -2.3, 0.6, -1), at(box(0.2, 1.2, 0.2, wood), 2.3, 0.6, -1), at(box(0.2, 1.2, 0.2, wood), -2.3, 0.6, 1), at(box(0.2, 1.2, 0.2, wood), 2.3, 0.6, 1));
  desk.position.z = 2;
  st.add(desk);
  st.add(at(label("你的程序（桌面）", { h: 0.3 }), 0, 0.25, 3.5));
  const deskTag = at(label("", { mono: true, h: 0.4, color: C.cyan, border: C.cyan }), 0, 2.4, 3.3);
  st.add(deskTag);
  deskTag.visible = false;
  const page = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 0.85), mat(C.paper));
  page.castShadow = true;
  page.visible = false;
  st.add(page);

  const hi = ui.code(["# 先选一本书，再选一种 import 方式"]);
  const pick = ui.select(mods.map((m) => m.name), "random");
  ui.say("书架上的书 = 别人写好的模块。");
  let onDesk = null;
  const reset = async () => {
    deskTag.visible = false;
    page.visible = false;
    if (onDesk) { const b = onDesk; onDesk = null; await st.move(b.book, b.home, 500, 1); b.book.rotation.set(0, 0, 0); }
  };
  const cur = () => mods.find((m) => m.name === pick.value);

  ui.button(`import 模块`, async () => {
    await reset();
    const m = cur();
    ui.code([`import ${m.name}`, "", `${m.name}.${m.call}   # 要写书名.函数名`])([0, 2]);
    await st.move(m.book, [0, 1.75, 2], 900, 2);
    await st.anim(300, (p) => { m.book.rotation.x = -p * Math.PI / 2; });
    onDesk = m;
    setText(deskTag, `${m.name}.${m.fn}`); deskTag.visible = true;
    ui.say(`整本 ${m.name} 都在桌上了。用的时候要说明是哪本书里的：${m.name}.${m.fn}`, "ok");
  });
  ui.button(`from 模块 import 名字`, async () => {
    await reset();
    const m = cur();
    ui.code([`from ${m.name} import ${m.fn}`, "", `${m.call}   # 直接写名字`])([0, 2]);
    page.position.copy(m.book.position);
    page.visible = true;
    await st.shake(m.book, 300, 0.05);
    await st.move(page, [0, 1.32, 2], 900, 2);
    setText(deskTag, m.fn); deskTag.visible = true;
    ui.say(`只撕下了 ${m.fn} 这一页。直接写 ${m.fn}(...)，不用加 ${m.name}.`, "ok");
  });
  void hi;
};

// ---- Lecture 5: each assert is a lamp ----
SCENES.lamps = (st, ui) => {
  const tests = [[2, 4], [3, 9], [-2, 4], [0, 0]];
  const lamps = tests.map(([n, want], i) => {
    const g = new THREE.Group();
    g.add(at(box(0.15, 1.6, 0.15, C.steel), 0, 0.8, 0));
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 16), mat("#3a4560", { emissive: "#000000" }));
    bulb.position.y = 2.1;
    bulb.castShadow = true;
    const tag = at(label(`square(${n}) == ${want}`, { mono: true, h: 0.34 }), 0, 3.0, 0);
    const got = at(label("", { mono: true, h: 0.32 }), 0, 0.4, 0.9);
    g.add(bulb, tag, got);
    g.position.x = -4.5 + i * 3;
    st.add(g);
    return { bulb, got, n, want };
  });
  const summary = at(label("还没运行 pytest", { h: 0.38 }), 0, 4.4, 0);
  st.add(summary);
  const impls = { "return n * n": (n) => n * n, "return n + n   # 写错了": (n) => n + n };
  const which = ui.select(Object.keys(impls), "return n + n   # 写错了");
  const hi = ui.code(["def square(n):", "    " + which.value]);
  which.addEventListener("change", () => ui.code(["def square(n):", "    " + which.value]));
  ui.say("一盏灯 = 一条 assert。绿灯通过，红灯失败。");

  ui.button("▶ pytest", async () => {
    const f = impls[which.value];
    let pass = 0;
    setText(summary, "running...");
    lamps.forEach((l) => { l.bulb.material.color.set("#3a4560"); l.bulb.material.emissive.set("#000"); setText(l.got, ""); });
    for (const l of lamps) {
      await st.sleep(450);
      const got = f(l.n);
      const ok = got === l.want;
      if (ok) pass++;
      const col = ok ? C.green : C.red;
      l.bulb.material.color.set(col);
      l.bulb.material.emissive.set(col);
      l.bulb.material.emissiveIntensity = 0.8;
      setText(l.got, `实际 ${got}  ${ok ? "✓" : "✗"}`, { color: col });
      await st.scaleTo(l.bulb, 1.25, 120);
      await st.scaleTo(l.bulb, 1, 160);
    }
    const fail = tests.length - pass;
    setText(summary, fail ? `${pass} passed, ${fail} failed` : `${pass} passed`, { color: fail ? C.red : C.green });
    ui.say(fail ? `写错的版本居然通过了 ${pass} 条（2 和 0 恰好碰巧对）。只测一个数是不够的。` : "全部通过。正数、负数、零都测到了。", fail ? "bad" : "ok");
  }, "primary");
  void hi;
};

// ---- Lecture 6: a file is a stack of pages; the mode decides what happens ----
SCENES.pages = (st, ui) => {
  const tray = new THREE.Group();
  const tm = mat("#2c3a5e");
  tray.add(at(box(2.4, 0.12, 3, tm), 0, 0.06, 0), at(box(2.4, 0.4, 0.1, tm), 0, 0.2, 1.5), at(box(2.4, 0.4, 0.1, tm), 0, 0.2, -1.5), at(box(0.1, 0.4, 3, tm), -1.2, 0.2, 0));
  tray.add(at(label("names.txt", { mono: true, h: 0.32, color: C.amber }), -2.1, 0.5, 0));
  tray.position.x = -2.5;
  st.add(tray);
  const reader = at(label("", { mono: true, h: 0.32, color: C.green, bg: "#05080f" }), 3.5, 2.6, 0);
  st.add(reader);
  st.add(at(label("你的程序", { h: 0.3 }), 3.5, 0.3, 1.2));
  st.add(at(box(2.6, 0.1, 2.2, "#1f2a44"), 3.5, 0.05, 0));
  const stack = [];
  const pageAt = (i) => [-2.5, 0.32 + i * 0.44, 0];
  function newPage(text) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.38, 1.6), mat(C.paper));
    p.castShadow = true;
    const t = label(text + "\\n", { mono: true, h: 0.26, color: "#1d1d1d", bg: null });
    t.position.set(0, 0, 0.85);
    p.add(t);
    p.userData.text = text;
    return p;
  }
  const inp = ui.input("Hermione", "9em", "名字");
  ui.code(["# 选一种模式"]);
  ui.say("每一行 = 一页纸。");

  ui.button('"w" 写', async () => {
    ui.code(['with open("names.txt", "w") as file:', '    file.write(f"{name}\\n")'])([0, 1]);
    if (stack.length) ui.say(`"w" 会先清空整个文件！原来的 ${stack.length} 行都没了。`, "bad");
    await Promise.all(stack.map((p, i) => st.move(p, [-2.5 + (i % 2 ? 3 : -3), -1, 3], 600, 2).then(() => p.removeFromParent())));
    stack.length = 0;
    const p = newPage(inp.value);
    p.position.set(-2.5, 5, 0);
    st.add(p);
    await st.move(p, pageAt(0), 600);
    stack.push(p);
    ui.say(`现在文件里只有 1 行：${inp.value}`, "ok");
  });
  ui.button('"a" 追加', async () => {
    if (stack.length >= 7) { ui.say("演示最多 7 行，先用 \"w\" 清空再试。", "bad"); return; }
    ui.code(['with open("names.txt", "a") as file:', '    file.write(f"{name}\\n")'])([0, 1]);
    const p = newPage(inp.value);
    p.position.set(-2.5, 5, 0);
    st.add(p);
    await st.move(p, pageAt(stack.length), 600);
    stack.push(p);
    ui.say(`加到最后，原来的保留。现在一共 ${stack.length} 行。`, "ok");
  });
  ui.button('"r" 读', async () => {
    ui.code(['with open("names.txt") as file:   # 默认就是 "r"', "    for line in file:", '        print("hello,", line.rstrip())'])([0]);
    if (!stack.length) { ui.say("文件是空的，先写几行。", "bad"); return; }
    const outLines = [];
    for (let i = 0; i < stack.length; i++) {
      const p = stack[i];
      ui.code(['with open("names.txt") as file:   # 默认就是 "r"', "    for line in file:", '        print("hello,", line.rstrip())'])([1, 2]);
      const home = pageAt(i);
      await st.move(p, [3.5, 1.2, 0], 550, 1.5);
      outLines.push(`hello, ${p.userData.text}`);
      setText(reader, outLines.slice(-6).join("\n"));
      ui.say(`第 ${i + 1} 行："${p.userData.text}\\n" → rstrip() 去掉换行`);
      await st.move(p, home, 450, 1.5);
    }
    ui.say(`从第一行读到最后一行，一共 ${stack.length} 行。读不会改变文件。`, "ok");
  });
};

// ---- Lecture 7: the pattern slides over a row of character tiles ----
SCENES.regex = (st, ui) => {
  const row = new THREE.Group();
  st.add(row);
  const result = at(label("", { mono: true, h: 0.34 }), 0, 4.6, 0);
  st.add(result);
  const GROUP_COLORS = [C.amber, C.pink, C.green, C.violet];
  const presets = [
    ["邮箱", "^\\w+@(\\w+\\.)?\\w+\\.edu$", "malan@cs50.harvard.edu"],
    ["姓, 名", "^(.+), *(.+)$", "Malan, David"],
    ["推特网址", "^https?://(?:www\\.)?twitter\\.com/(\\w+)$", "https://twitter.com/davidjmalan"],
    ["找数字", "\\d+", "room 12, floor 3"],
  ];
  const pat = ui.input(presets[0][1], "15em", "模式");
  const txt = ui.input(presets[0][2], "15em", "文字");
  const mode = ui.select(["re.search（第一个）", "re.findall（全部）"]);
  const flag = ui.select(["区分大小写", "re.IGNORECASE"]);
  presets.forEach(([name, p, t]) => ui.button(name, async () => { pat.value = p; txt.value = t; await render(); }, "chip"));
  ui.say("升起来的字母 = 被匹配到的部分。不同颜色 = 不同的括号组。");
  let tiles = [];

  async function render() {
    const text = txt.value.slice(0, 40);
    const all = mode.value.startsWith("re.findall");
    const ci = flag.value === "re.IGNORECASE";
    row.clear();
    const n = text.length;
    const w = Math.min(0.62, 13 / Math.max(n, 1));
    tiles = [...text].map((ch, i) => {
      const t = box(w * 0.9, 0.18, 0.9, "#2b3854");
      t.position.set((i - (n - 1) / 2) * w, 0.09, 0);
      const l = label(ch === " " ? "␣" : ch, { mono: true, bg: null, h: Math.min(0.5, w * 0.9) });
      l.position.set(0, 0.45, 0);
      t.add(l);
      row.add(t);
      return t;
    });
    const pyCode = `re.${all ? "findall" : "search"}(r"${pat.value}", "${text}"${ci ? ", re.IGNORECASE" : ""})`;
    ui.code(["import re", pyCode]);
    let re;
    try { re = new RegExp(pat.value, "d" + (all ? "g" : "") + (ci ? "i" : "")); } catch (e) {
      setText(result, "模式写错了", { color: C.red }); ui.say(String(e.message), "bad"); return;
    }
    const matches = [];
    if (all) { for (const m of text.matchAll(re)) { matches.push(m); if (m[0] === "") re.lastIndex++; if (matches.length > 50) break; } } else { const m = re.exec(text); if (m) matches.push(m); }
    if (!matches.length) {
      setText(result, all ? "[]   # 一个都没找到" : "None   # 没匹配上", { color: C.red });
      ui.say("没有匹配。检查 ^ $、转义 \\. 和重复符号。", "bad");
      return;
    }
    const lift = [];
    matches.forEach((m) => {
      const [s, e] = m.indices[0];
      for (let i = s; i < e; i++) lift.push([i, C.cyan, 0.7]);
      m.indices.slice(1).forEach((g, k) => { if (g) for (let i = g[0]; i < g[1]; i++) lift.push([i, GROUP_COLORS[k % 4], 1.1]); });
    });
    const target = new Map();
    lift.forEach(([i, col, y]) => target.set(i, [col, y]));
    await st.anim(500, (p) => {
      target.forEach(([col, y], i) => { tiles[i].position.y = 0.09 + y * p; });
    });
    target.forEach(([col], i) => tiles[i].material.color.set(col));
    if (all) {
      const vals = matches.map((m) => (m.length > 2 ? `(${m.slice(1).map((x) => JSON.stringify(x ?? "")).join(", ")})` : JSON.stringify(m[m.length > 1 ? 1 : 0])));
      setText(result, `[${vals.join(", ")}]`.slice(0, 60), { color: C.cyan });
      ui.say(`找到 ${matches.length} 处。（findall 有括号组时只返回组的内容）`, "ok");
    } else {
      const m = matches[0];
      const groups = m.slice(1).map((g, k) => `group(${k + 1}) = ${JSON.stringify(g ?? null)}`);
      setText(result, [`group(0) = ${JSON.stringify(m[0])}`, ...groups].join("\n").slice(0, 200), { color: C.text });
      ui.say(groups.length ? "颜色对应 group(1)、group(2)……" : "匹配成功。没有括号，所以只有 group(0)。", "ok");
    }
  }
  ui.button("▶ 匹配", render, "primary");
  [pat, txt].forEach((el) => el.addEventListener("keydown", (e) => { if (e.key === "Enter") ui.run(render); }));
  [mode, flag].forEach((el) => el.addEventListener("change", () => ui.run(render)));
  ui.run(render);
};

// ---- Lecture 8: a class is a blueprint; objects are built from it ----
SCENES.blueprint = (st, ui) => {
  const bp = new THREE.Group();
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.8, 2.2, 1.2)), new THREE.LineBasicMaterial({ color: C.cyan }));
  edges.position.y = 1.1;
  bp.add(edges);
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.6), new THREE.MeshBasicMaterial({ color: "#163a6b", transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
  sheet.position.set(0, 1.8, -0.8);
  bp.add(sheet);
  bp.add(at(label("class Student\n  name\n  house", { mono: true, h: 0.28, color: C.cyan }), 0, 3.6, 0));
  bp.position.x = -5;
  st.add(bp);
  const factoryTag = at(label("__init__ 检查", { mono: true, h: 0.28 }), -2.2, 2.6, 0);
  st.add(factoryTag);
  const gate = box(0.2, 2.2, 1.6, C.steel);
  gate.position.set(-2.2, 1.1, 0);
  st.add(gate);
  const objects = [];
  const name = ui.input("Harry", "7em", "name");
  const house = ui.select([...Object.keys(HOUSES), "Number Four, Privet Drive"], "Gryffindor");
  const hi = ui.code(["class Student:", "    def __init__(self, name, house):", '        if house not in ["Gryffindor", "Hufflepuff", "Ravenclaw", "Slytherin"]:', '            raise ValueError("Invalid house")', "        self.name = name", "        self.house = house", "    def __str__(self):", '        return f"{self.name} from {self.house}"', "", "s = Student(name, house)", "print(s)"]);
  ui.say("一张图纸可以造出很多个对象，每个对象有自己的 name 和 house。");

  ui.button("▶ 造一个学生", async () => {
    const nm = name.value.trim() || "?", hs = house.value;
    const valid = hs in HOUSES;
    hi(9);
    const body = box(1.6, 2, 1, valid ? HOUSES[hs] : "#888", { transparent: true, opacity: 0.2 });
    body.position.set(-5, 1.1, 0);
    body.scale.setScalar(0.2);
    st.add(body);
    await Promise.all([st.scaleTo(body, 1, 500), st.anim(500, (p) => (body.material.opacity = 0.2 + 0.8 * p))]);
    hi(1);
    await st.move(body, [-3.2, 1.1, 0], 500);
    hi([2, 3]);
    await st.sleep(400);
    if (!valid) {
      body.material.color.set(C.red);
      await Promise.all([st.shake(body, 500, 0.15), st.pulse(gate, C.red, 600)]);
      ui.say(`ValueError: Invalid house —— 「${hs}」不是学院，__init__ 拒绝造这个对象。`, "bad");
      await Promise.all([st.scaleTo(body, 0.01, 500), st.anim(500, (p) => (body.material.opacity = 1 - p))]);
      body.removeFromParent();
      return;
    }
    await st.pulse(gate, C.green, 300);
    hi([4, 5]);
    const slot = objects.length % 5;
    if (objects[slot]) objects[slot].removeFromParent();
    const tag = label(`${nm} from ${hs}`, { h: 0.24 });
    tag.position.y = 1.45;
    body.add(tag);
    await st.move(body, [0 + slot * 1.7 - 0.4, 1.1, slot % 2 ? 1.2 : -0.4], 700, 1);
    objects[slot] = body;
    hi([6, 7, 10]);
    ui.say(`print(s) 调用 __str__ → "${nm} from ${hs}"。现在一共造了 ${objects.filter((o) => o.parent).length} 个对象。`, "ok");
  }, "primary");
};

// ---- Lecture 9: map / filter / comprehension as a conveyor belt ----
SCENES.conveyor = (st, ui) => {
  st.add(at(box(14, 0.3, 1.4, "#222c44"), 0, 0.6, 0));
  for (let x = -6.5; x <= 6.5; x += 1) st.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.5, 12).rotateX(Math.PI / 2), mat(C.steel)), x, 0.45, 0));
  const fGate = new THREE.Group();
  fGate.add(at(box(0.15, 2, 0.15, C.violet), 0, 1.6, -0.75), at(box(0.15, 2, 0.15, C.violet), 0, 1.6, 0.75), at(box(0.2, 0.2, 1.65, C.violet), 0, 2.6, 0));
  fGate.add(at(label("filter\nx % 2 == 0", { mono: true, h: 0.26, color: C.violet }), 0, 3.4, 0));
  fGate.position.x = -1.5;
  const press = new THREE.Group();
  const head = box(1.2, 0.5, 1.2, C.amber);
  head.position.y = 2.6;
  press.add(head, at(box(0.2, 1.4, 0.2, C.steel), 0, 3.4, 0), at(label("map\nx * x", { mono: true, h: 0.26, color: C.amber }), 0, 4.4, 0));
  press.position.x = 2.2;
  st.add(fGate, press);
  const outTag = at(label("[ ]", { mono: true, h: 0.36, color: C.green }), 5, 3.2, 0);
  st.add(outTag);
  const modes = {
    "map": { f: false, m: true, code: "list(map(lambda x: x * x, nums))" },
    "filter": { f: true, m: false, code: "list(filter(lambda x: x % 2 == 0, nums))" },
    "推导式（两个都用）": { f: true, m: true, code: "[x * x for x in nums if x % 2 == 0]" },
  };
  const pick = ui.select(Object.keys(modes), "推导式（两个都用）");
  const show = () => {
    const m = modes[pick.value];
    fGate.visible = m.f; press.visible = m.m;
    ui.code(["nums = [1, 2, 3, 4, 5, 6]", m.code]);
  };
  pick.addEventListener("change", show);
  show();
  ui.say("filter 决定留不留，map 决定变成什么。");
  let items = [];

  ui.button("▶ 运行", async () => {
    const m = modes[pick.value];
    items.forEach((i) => i.removeFromParent());
    items = [];
    setText(outTag, "[ ]");
    const result = [];
    const cubes = [1, 2, 3, 4, 5, 6].map((v, k) => {
      const c = box(0.7, 0.7, 0.7, C.cyan);
      const t = label(String(v), { mono: true, bold: true, h: 0.36, bg: null });
      t.position.y = 0.75;
      c.add(t);
      c.userData = { v, t };
      c.position.set(-6.5 - k * 1.2, 1.1, 0);
      st.add(c);
      items.push(c);
      return c;
    });
    await Promise.all(cubes.map(async (c, k) => {
      await st.sleep(k * 650);
      await st.move(c, [m.f ? -1.5 : 2.2, 1.1, 0], 1400 - (m.f ? 400 : 0) + k * 0, 0);
      if (m.f) {
        if (c.userData.v % 2 !== 0) {
          c.material.color.set(C.red);
          await st.move(c, [-1.2, -0.5, 2.4], 600, 0.6);
          c.removeFromParent();
          return;
        }
        c.material.color.set(C.violet);
        await st.move(c, [2.2, 1.1, 0], 700);
      }
      if (m.m) {
        await st.anim(160, (p) => (head.position.y = 2.6 - p * 1.1));
        c.userData.v = c.userData.v * c.userData.v;
        setText(c.userData.t, String(c.userData.v));
        c.material.color.set(C.amber);
        await st.anim(200, (p) => (head.position.y = 1.5 + p * 1.1));
      }
      await st.move(c, [5 + (result.length % 3) * 0.2, 1.1, 0], 600);
      result.push(c.userData.v);
      setText(outTag, `[${result.join(", ")}]`);
      c.removeFromParent();
    }));
    ui.say(`结果：[${result.join(", ")}]。${m.f && m.m ? "推导式一行就做完了 filter + map。" : ""}`, "ok");
  }, "primary");
};

// =====================================================================
export function mount(el, key) {
  const wrap = document.createElement("div");
  wrap.className = "stage";
  const bar = document.createElement("div");
  bar.className = "scontrols";
  const status = document.createElement("div");
  status.className = "sstatus";
  const code = document.createElement("pre");
  code.className = "scode";
  el.append(wrap, status, bar, code);
  const views = {
    regex: { cam: [0, 5, 10], target: [0, 1.6, 0], fitWidth: 14 },
    bricks: { cam: [0, 4.5, 11], target: [0, 2.6, 0], fitWidth: 9 },
    lamps: { cam: [0, 4, 10], target: [0, 2, 0], fitWidth: 13 },
    blueprint: { cam: [0, 4.5, 10], target: [0, 1.6, 0], fitWidth: 14 },
    conveyor: { cam: [0, 4.5, 10], target: [0, 1.8, 0], fitWidth: 14 },
  };
  const st = createStage(wrap, views[key] || {});
  const ui = makeUI(bar, code, status);
  SCENES[key](st, ui);
  return () => st.dispose();
}

// Home page: ten floating cubes, one per lecture. Click one to open it.
export function mountHome(el, lectures, done, go) {
  const st = createStage(el, { cam: [0, 3.2, 10], target: [0, 1.8, 0], fitWidth: 12.5 });
  const colors = [C.cyan, C.amber, "#c8643c", C.red, "#4ab37a", C.green, C.paper, C.pink, C.violet, "#4a8fe0"];
  const cubes = lectures.map((l, i) => {
    const a = (i / lectures.length) * Math.PI * 2;
    const c = box(1, 1, 1, colors[i], { emissive: colors[i], emissiveIntensity: done[l.n] ? 0.5 : 0.08 });
    c.position.set(Math.cos(a) * 4.5, 1.6, Math.sin(a) * 4.5);
    c.userData.n = l.n;
    c.add(at(label(`${l.n}  ${l.zh}${done[l.n] ? " ✓" : ""}`, { h: 0.3 }), 0, 1.0, 0));
    st.add(c);
    return c;
  });
  st.add(at(label("CS50P · 10 讲", { h: 0.6, bold: true, bg: null, color: C.cyan }), 0, 3.6, 0));
  st.controls.autoRotate = true;
  st.controls.autoRotateSpeed = 0.6;
  st.onFrame((now) => cubes.forEach((c, i) => { c.position.y = 1.6 + Math.sin(now / 700 + i) * 0.2; c.rotation.y = now / 2000 + i; }));
  const ray = new THREE.Raycaster();
  const v = new THREE.Vector2();
  let down = null;
  const cv = st.renderer.domElement;
  cv.addEventListener("pointerdown", (e) => (down = [e.clientX, e.clientY]));
  cv.addEventListener("pointerup", (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    const r = cv.getBoundingClientRect();
    v.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(v, st.camera);
    const hit = ray.intersectObjects(cubes, false)[0];
    if (hit) go(hit.object.userData.n);
  });
  cv.style.cursor = "pointer";
  return () => st.dispose();
}
