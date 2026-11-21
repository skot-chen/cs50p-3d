// Page rendering: home (#/) and lecture pages (#/lecture/N). Data comes from data/lectures.json (built by scripts/build.py).
import { mount, mountHome } from "./scenes.js";

const app = document.getElementById("app");
const KEY = "cs50p3d:v1";
const state = (() => { try { return { done: {}, quiz: {}, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return { done: {}, quiz: {} }; } })();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode: progress just isn't kept */ } };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const h = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const fmt = (s) => { const m = Math.floor(s / 60), x = s % 60, hh = Math.floor(m / 60); return hh ? `${hh}:${String(m % 60).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`; };
const norm = (s) => String(s).replace(/\r/g, "").split("\n").map((l) => l.replace(/\s+$/, "")).join("\n").trim();

function speak(text) {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US"; u.rate = 0.9;
    speechSynthesis.speak(u);
  } catch { /* no speech on this browser */ }
}

// ---------- Python runner (Pyodide in a worker, loaded only when needed) ----------
let worker = null, seq = 0;
const pending = new Map();
function getWorker() {
  if (worker) return worker;
  worker = new Worker("worker.js");
  worker.onmessage = ({ data }) => {
    if (data.fatal) { pending.forEach((p) => p.resolve({ out: "", err: "Python 加载失败：" + data.fatal })); pending.clear(); worker = null; return; }
    const p = pending.get(data.id);
    if (p) { pending.delete(data.id); clearTimeout(p.timer); p.resolve(data); }
  };
  return worker;
}
function runPython(code, stdin) {
  return new Promise((resolve) => {
    const id = ++seq;
    const w = getWorker();
    // 60 s covers the first ~10 MB download; after that a stuck loop is stopped.
    const timer = setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id); w.terminate(); worker = null;
      resolve({ out: "", err: "运行超时（可能是死循环），已停止。" });
    }, 60000);
    pending.set(id, { resolve, timer });
    w.postMessage({ id, code, stdin });
  });
}

// ---------- shared bits ----------
let disposeScene = null;
function cleanup() {
  if (disposeScene) { disposeScene(); disposeScene = null; }
  try { speechSynthesis.cancel(); } catch { /* ignore */ }
}

function codeBlock(code, output, stdin) {
  const el = h(`<div class="code">
    <textarea spellcheck="false" autocapitalize="off" autocomplete="off"></textarea>
    <div class="code-bar">
      <button type="button" class="run">▶ 运行</button>
      <button type="button" class="reset" hidden>还原</button>
      ${stdin ? `<span class="stdin">模拟输入：${esc(stdin.replace(/\n/g, " ⏎ "))}</span>` : ""}
      <span class="hint">可以直接改代码再运行</span>
    </div>
    <pre class="out" hidden></pre>
  </div>`);
  const ta = el.querySelector("textarea"), out = el.querySelector(".out"), reset = el.querySelector(".reset"), run = el.querySelector(".run");
  const fit = () => { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + 2 + "px"; };
  ta.value = code;
  requestAnimationFrame(fit);
  ta.addEventListener("input", () => { fit(); reset.hidden = ta.value === code; });
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Tab") { e.preventDefault(); ta.setRangeText("    ", ta.selectionStart, ta.selectionEnd, "end"); ta.dispatchEvent(new Event("input")); }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) run.click();
  });
  reset.onclick = () => { ta.value = code; ta.dispatchEvent(new Event("input")); out.hidden = true; };
  run.onclick = async () => {
    out.hidden = false;
    out.className = "out";
    if (ta.value === code) { out.textContent = output; out.dataset.note = "已用真实 Python 3.12 运行验证"; return; }
    out.dataset.note = "";
    out.textContent = worker ? "运行中…" : "第一次运行要下载 Python（约 10 MB），请稍等…";
    run.disabled = true;
    const r = await runPython(ta.value, stdin || "");
    run.disabled = false;
    out.textContent = r.out + (r.err ? (r.out ? "\n" : "") + r.err.trim() : "");
    if (r.err) out.classList.add("err");
    if (!out.textContent) out.textContent = "（没有输出）";
    out.dataset.note = "你的代码 · 浏览器里的 Python";
  };
  return el;
}

// ---------- home ----------
function renderHome(data) {
  const L = data.lectures;
  const doneCount = L.filter((l) => state.done[l.n]).length;
  app.innerHTML = "";
  const page = h(`<div class="home">
    <section class="hero">
      <div class="hero-stage"></div>
      <div class="hero-text">
        <h1>每一讲，一张能动的 3D 记忆图</h1>
        <p>CS50P 是哈佛的 Python 入门课，一共 10 讲（Lecture 0–9）。这里把每一讲最该记住的那个概念做成一个 3D 小场景：你动手推一下，它就演给你看。</p>
        <p class="en">One lecture, one 3D picture you can play with.</p>
        <div class="progress"><b>${doneCount}</b> / ${L.length} 讲已学完 <span class="bar"><i style="width:${(doneCount / L.length) * 100}%"></i></span></div>
      </div>
    </section>
    <section class="how">
      <div><b>① 玩 3D</b><span>先玩场景，记住一个画面</span></div>
      <div><b>② 看视频</b><span>按章节跳到想看的部分</span></div>
      <div><b>③ 读 + 跑代码</b><span>每个例子都能改、能运行</span></div>
      <div><b>④ 先猜再看</b><span>猜输出，检查自己真懂了没</span></div>
    </section>
    <section class="grid"></section>
  </div>`);
  const grid = page.querySelector(".grid");
  L.forEach((l) => {
    const q = state.quiz[l.n];
    grid.appendChild(h(`<a class="card${state.done[l.n] ? " done" : ""}" href="#/lecture/${l.n}">
      <span class="num">${l.n}</span>
      <span class="t"><b>${esc(l.title)}</b><em>${esc(l.zh)}</em></span>
      <span class="hk">${esc(l.hook.split("。")[0])}。</span>
      <span class="meta">${state.done[l.n] ? "✓ 已学完" : "未学"}${q ? ` · 猜对 ${q}/${l.quiz.length}` : ""}</span>
    </a>`));
  });
  app.appendChild(page);
  disposeScene = mountHome(page.querySelector(".hero-stage"), L, state.done, (n) => (location.hash = `#/lecture/${n}`));
}

// ---------- lecture ----------
function renderLecture(data, n) {
  const L = data.lectures;
  const l = L.find((x) => x.n === n);
  if (!l) { location.hash = "#/"; return; }
  const prev = L.find((x) => x.n === n - 1), next = L.find((x) => x.n === n + 1);
  app.innerHTML = "";
  const page = h(`<article class="lecture">
    <nav class="crumbs"><a href="#/">← 全部 10 讲</a>
      <span>${prev ? `<a href="#/lecture/${prev.n}">‹ ${prev.n}</a>` : ""}${next ? `<a href="#/lecture/${next.n}">${next.n} ›</a>` : ""}</span></nav>
    <header class="lhead">
      <span class="lnum">Lecture ${l.n}</span>
      <h1>${esc(l.title)} <small>${esc(l.zh)}</small></h1>
      <p class="hook">${esc(l.hook)}</p>
      <p class="hook-en"><button type="button" class="say" title="朗读">🔊</button> ${esc(l.hook_en)}</p>
    </header>
    <section class="block scene-block">
      <h2><span>1</span>3D 记忆图</h2>
      <p class="tip">${esc(l.scene_tip)}<br><small>拖动画面可以转视角，滚轮缩放。</small></p>
      <div class="scene"></div>
    </section>
    <section class="block">
      <h2><span>2</span>看视频</h2>
      <div class="video"><button type="button" class="play" style="background-image:url(https://i.ytimg.com/vi/${l.video}/hqdefault.jpg)"><b>▶ 播放 Lecture ${l.n}</b></button></div>
      <details class="chapters"><summary>章节（${l.chapters.length} 段，点一下跳过去）</summary><ol></ol></details>
    </section>
    <section class="block">
      <h2><span>3</span>核心概念</h2>
      <div class="concepts"></div>
    </section>
    <section class="block">
      <h2><span>4</span>先猜再看</h2>
      <p class="tip">先不要运行。看代码，把你认为会打印出来的内容写在框里，再点「对答案」。</p>
      <div class="quiz"></div>
    </section>
    <section class="block">
      <h2><span>5</span>这一讲的英文词</h2>
      <p class="tip">点一下听发音。</p>
      <div class="words"></div>
    </section>
    <section class="block finish">
      <a class="pset" href="${l.pset}" target="_blank" rel="noopener">官方作业 Problem Set ${l.n} ↗</a>
      <button type="button" class="mark"></button>
    </section>
  </article>`);
  app.appendChild(page);
  window.scrollTo(0, 0);

  page.querySelector(".say").onclick = () => speak(l.hook_en);

  // video: load the player only when asked, then let chapters seek it
  const vbox = page.querySelector(".video");
  const play = (t = 0) => {
    vbox.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${l.video}?autoplay=1&start=${t}&list=${data.playlist}" title="CS50P Lecture ${l.n}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
    vbox.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  page.querySelector(".play").onclick = () => play(0);
  const ol = page.querySelector(".chapters ol");
  l.chapters.forEach(([t, title]) => {
    const li = h(`<li><button type="button"><time>${fmt(t)}</time> ${esc(title)}</button></li>`);
    li.firstElementChild.onclick = () => play(t);
    ol.appendChild(li);
  });

  const cbox = page.querySelector(".concepts");
  l.concepts.forEach((c, i) => {
    const el = h(`<div class="concept">
      <div class="chead"><span class="ci">${i + 1}</span><b>${esc(c.zh)}</b><code>${esc(c.term)}</code></div>
      <p>${esc(c.say)}</p>
      <p class="en"><button type="button" class="say" title="朗读">🔊</button> ${esc(c.en)}</p>
    </div>`);
    el.querySelector(".say").onclick = () => speak(c.en);
    el.appendChild(codeBlock(c.code, c.output, c.stdin));
    cbox.appendChild(el);
  });

  const qbox = page.querySelector(".quiz");
  const results = new Array(l.quiz.length).fill(null);
  l.quiz.forEach((q, i) => {
    const el = h(`<div class="q">
      <pre class="qcode">${esc(q.code)}</pre>
      <textarea rows="2" placeholder="你猜会打印什么？" spellcheck="false" autocapitalize="off"></textarea>
      <div class="qbar"><button type="button" class="check">对答案</button><button type="button" class="giveup">直接看答案</button></div>
      <div class="qres" hidden></div>
    </div>`);
    const ta = el.querySelector("textarea"), res = el.querySelector(".qres");
    const reveal = (guessed) => {
      const ok = guessed && norm(ta.value) === norm(q.answer);
      if (results[i] === null) results[i] = ok;
      res.hidden = false;
      res.className = "qres " + (ok ? "ok" : "no");
      res.innerHTML = `<b>${ok ? "✓ 猜对了" : guessed ? "✗ 不太对，正确输出是：" : "正确输出是："}</b><pre>${esc(q.answer.replace(/\n$/, ""))}</pre><p>${esc(q.why)}</p>`;
      if (results.every((r) => r !== null)) {
        state.quiz[n] = results.filter(Boolean).length;
        save();
      }
    };
    el.querySelector(".check").onclick = () => reveal(true);
    el.querySelector(".giveup").onclick = () => reveal(false);
    qbox.appendChild(el);
  });

  const wbox = page.querySelector(".words");
  l.words.forEach((w) => {
    const b = h(`<button type="button" class="word"><b>${esc(w.en)}</b><span>${esc(w.zh)}</span></button>`);
    b.onclick = () => speak(w.en);
    wbox.appendChild(b);
  });

  const mark = page.querySelector(".mark");
  const paint = () => { mark.textContent = state.done[n] ? "✓ 已学完（再点取消）" : "这一讲我学完了"; mark.classList.toggle("on", !!state.done[n]); };
  mark.onclick = () => { state.done[n] = !state.done[n]; if (!state.done[n]) delete state.done[n]; save(); paint(); };
  paint();

  disposeScene = mount(page.querySelector(".scene"), l.scene);
}

// ---------- router ----------
let data = null;
async function route() {
  cleanup();
  try {
    data = data || (await fetch("data/lectures.json").then((r) => r.json()));
  } catch {
    app.innerHTML = `<p class="loading">数据加载失败，请刷新。</p>`;
    return;
  }
  const m = location.hash.match(/^#\/lecture\/(\d+)/);
  if (m) renderLecture(data, +m[1]); else renderHome(data);
}
window.addEventListener("hashchange", route);
route();
