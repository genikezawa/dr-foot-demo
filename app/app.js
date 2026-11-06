import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";
import {
  CATEGORIES, CATEGORY_LABEL, SUSPECT_ONLY, THRESHOLD, RIGIDITY_LABEL, THICKNESS_LABEL,
  combine, generateContent, jisWidthCode,
} from "./diagnosis.js";

// ---- ダミーデータ(実在の人物ではない) ----
// length/width/girth は mm、prob は診断AIの確率(左右別)。
const SAMPLES = [
  {
    name: "サンプルA",
    tag: "女性 23.6cm",
    gender: "female",
    right: { length: 236, width: 98, girth: 222, prob: { hallux_valgus: 0.71, flat_arch: 0.66, high_arch: 0.05, adducted_forefoot: 0.18 } },
    left: { length: 233, width: 97, girth: 221, prob: { hallux_valgus: 0.38, flat_arch: 0.72, high_arch: 0.04, adducted_forefoot: 0.11 } },
  },
  {
    name: "サンプルB",
    tag: "男性 26.8cm",
    gender: "male",
    right: { length: 266, width: 106, girth: 268, prob: { hallux_valgus: 0.12, flat_arch: 0.09, high_arch: 0.81, adducted_forefoot: 0.07 } },
    left: { length: 268, width: 107, girth: 270, prob: { hallux_valgus: 0.1, flat_arch: 0.06, high_arch: 0.58, adducted_forefoot: 0.09 } },
  },
  {
    name: "サンプルC",
    tag: "男性 25.5cm",
    gender: "male",
    right: { length: 252, width: 101, girth: 241, prob: { hallux_valgus: 0.22, flat_arch: 0.31, high_arch: 0.12, adducted_forefoot: 0.63 } },
    left: { length: 255, width: 102, girth: 244, prob: { hallux_valgus: 0.26, flat_arch: 0.35, high_arch: 0.09, adducted_forefoot: 0.44 } },
  },
  {
    name: "サンプルD",
    tag: "女性 22.8cm",
    gender: "female",
    right: { length: 228, width: 92, girth: 216, prob: { hallux_valgus: 0.14, flat_arch: 0.22, high_arch: 0.18, adducted_forefoot: 0.08 } },
    left: { length: 227, width: 92, girth: 217, prob: { hallux_valgus: 0.11, flat_arch: 0.27, high_arch: 0.15, adducted_forefoot: 0.06 } },
  },
];

const DESIGNS = [
  {
    id: "derby",
    name: "外羽根プレーントゥ",
    desc: "紐で甲の締め具合を調整しやすい定番。普段履きから仕事まで。",
    price: 44000,
    icon: '<path d="M4 30c0-4 3-6 8-7l14-3 8-9c2-2 5-2 7 0l4 5c2 2 4 3 7 3h4c2 0 4 2 4 4v7c0 1-1 2-2 2H6c-1 0-2-1-2-2z"/><path d="M26 20l8 3M30 16l7 3M34 12l6 3"/>',
  },
  {
    id: "captoe",
    name: "ストレートチップ",
    desc: "内羽根のフォーマル。ビジネスや冠婚葬祭に。",
    price: 48000,
    icon: '<path d="M4 30c0-4 3-6 8-7l14-3 8-9c2-2 5-2 7 0l4 5c2 2 4 3 7 3h4c2 0 4 2 4 4v7c0 1-1 2-2 2H6c-1 0-2-1-2-2z"/><path d="M14 22c1 3 1 6 0 9M32 13l9 4"/>',
  },
  {
    id: "walking",
    name: "ウォーキングダービー",
    desc: "クッション性のあるラバーソール。長く歩く日に。",
    price: 42000,
    icon: '<path d="M4 28c0-4 3-6 8-7l14-3 8-9c2-2 5-2 7 0l4 5c2 2 4 3 7 3h4c2 0 4 2 4 4v5H4z"/><path d="M3 29h58v4c0 1-1 3-3 3H6c-2 0-3-2-3-3z"/><path d="M28 18l8 3M32 14l7 3"/>',
  },
];

const METHODS = [
  {
    id: "easy",
    name: "イージーオーダー",
    desc: "既存の木型から、計測したサイズ・ウィズに合うものを選んで製作します。",
    extra: 0,
    lead: "約3〜4週間",
  },
  {
    id: "fitting",
    name: "足型フィッティング",
    desc: "スキャンデータから足型を3Dプリントし、木型で仮縫いした仮靴に入れて形を合わせます。",
    extra: 12000,
    lead: "約5〜6週間",
  },
];

const COLORS = [
  { id: "black", name: "ブラック", hex: "#1c1c1c" },
  { id: "brown", name: "ダークブラウン", hex: "#4a2e1f" },
  { id: "tan", name: "タン", hex: "#a8703f" },
];

// sample が null のときは「はじめて(未スキャン)」の状態。scans は計測タブでスキャン済みの足。
const state = { sample: 0, tab: "home", side: "right", heat: null, design: null, method: null, color: "black", scans: { right: true, left: true } };
let dx, content, sample;
// 未スキャンの状態から両足をスキャンし終えたときに、診断結果として使うサンプル
const FIRST_RUN_SAMPLE = 0;

const $ = (id) => document.getElementById(id);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const yen = (n) => "¥" + n.toLocaleString("ja-JP");

// ---- 共通 ----

function recommendedSize() {
  const longer = sample.right.length >= sample.left.length ? sample.right : sample.left;
  return {
    cm: (Math.ceil(longer.length / 5) * 5) / 10,
    width: jisWidthCode(longer.length, longer.girth, sample.gender),
  };
}

function recommendedDesign() {
  if (dx.thickness === "thick" || dx.rigidity === "soft") return "derby";
  if (dx.thickness === "thin" || dx.rigidity === "stiff") return "walking";
  return "derby";
}

function footType() {
  return [dx.rigidity, dx.thickness].filter((a) => a !== "standard")
    .map((a) => (RIGIDITY_LABEL[a] ?? THICKNESS_LABEL[a]).replace("足", "")).join("・") || "標準";
}

function selectSample(i) {
  state.sample = i;
  document.querySelector(".shell").classList.toggle("no-data", i === null);
  if (i === null) {
    sample = dx = content = null;
    state.scans = { right: false, left: false };
    renderSamples();
    renderHome();
    renderMeasure();
    return;
  }
  state.scans = { right: true, left: true };
  sample = SAMPLES[i];
  dx = combine(sample);
  content = generateContent(sample, dx);
  // 色は説明を開いた1症状の分だけ出す(全症状を同時に塗ると範囲が広すぎて意味が分からない。仕様書10.6)
  state.heat = CATEGORIES.find((c) => dx.positives.has(c)) || "none";
  state.design = recommendedDesign();
  state.method = content.customReasons.length ? "fitting" : "easy";
  renderSamples();
  renderResult();
  renderHeatChips();
  renderReport();
  renderOrder();
  renderHome();
  renderMeasure();
  if (viewer) viewer.update();
}

function renderSamples() {
  $("samples").innerHTML = `<button class="sample-chip" data-sample="new" aria-pressed="${state.sample === null}">はじめて・未スキャン</button>` + SAMPLES.map(
    (s, i) => `<button class="sample-chip" data-sample="${i}" aria-pressed="${i === state.sample}">${s.name}・${s.tag}</button>`
  ).join("");
}

// ---- ホーム ----

const today = (() => { const d = new Date(); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; })();
const SIDE_LABEL = { right: "右足", left: "左足" };

function renderHome() {
  const nScanned = Object.values(state.scans).filter(Boolean).length;
  $("hero-cta").textContent = sample ? "もう一度スキャンする" : nScanned ? "スキャンのつづきへ" : "スキャンをはじめる";
  if (!sample) return;

  const rec = recommendedSize();
  const tags = CATEGORIES.filter((c) => dx.positives.has(c))
    .map((c) => `<span class="tag pos">${CATEGORY_LABEL[c]}${SUSPECT_ONLY.has(c) ? "の疑い" : "の傾向"}</span>`);
  if (!tags.length) tags.push('<span class="tag ok">目立つ所見なし</span>');
  tags.push(`<span class="tag type">${footType()}タイプ</span>`);
  $("latest").innerHTML = `
    <div class="latest-head"><b>前回の診断</b><span>${today}</span></div>
    <div class="latest-size"><b>${rec.cm.toFixed(1)}<small>cm</small></b><em>推奨サイズ・ウィズ ${rec.width}</em></div>
    <div class="latest-tags">${tags.join("")}</div>
    <button class="link-row" data-goto="result">計測結果と所見</button>
    <button class="link-row" data-goto="report">3D足型とAI診断</button>`;

  $("teaser-text").textContent = content.customReasons.length
    ? "既製靴が合いにくい傾向があります。足型フィッティングでのオーダーがおすすめです。"
    : `計測した ${rec.cm.toFixed(1)}cm / ${rec.width} で、既存の木型から選ぶイージーオーダーができます。`;
}

// ---- 計測(今のスキャナーアプリの Scan Right / Scan Left / Export を統合) ----

function scannedFoot(side) {
  if (!state.scans[side]) return null;
  return (sample ?? SAMPLES[FIRST_RUN_SAMPLE])[side];
}

function renderMeasure() {
  const n = Object.values(state.scans).filter(Boolean).length;
  $("scan-progress").style.width = `${(n / 2) * 100}%`;
  $("scan-count").textContent = `${n} / 2 足`;
  $("scan-feet").innerHTML = ["right", "left"].map((side) => {
    const m = scannedFoot(side);
    return `<div class="scan-foot${m ? " done" : ""}">
      <img src="img/guide_${side}.png" alt="">
      <div class="side">${SIDE_LABEL[side]}</div>
      <div class="state">${m ? `✓ 完了・足長 ${(m.length / 10).toFixed(1)}cm` : "未スキャン"}</div>
      <button data-scan="${side}">${m ? "スキャンし直す" : "スキャンする"}</button>
    </div>`;
  }).join("");
  $("analyze-btn").disabled = n < 2;
  $("analyze-note").textContent = n < 2
    ? `${n ? "もう片方の足" : "両足"}のスキャンが終わると、AIで診断できます。`
    : sample ? `前回の診断: ${today}` : "両足のスキャンが終わりました。";
}

// ---- 結果 ----

function renderResult() {
  $("feet").innerHTML = [["右足", sample.right], ["左足", sample.left]].map(([label, m]) => `
    <div class="foot-box">
      <div class="foot-label">${label}</div>
      <div class="foot-len">${(m.length / 10).toFixed(1)}<small>cm</small></div>
      <div class="foot-rows">
        <div>足幅<b>${m.width}mm</b></div>
        <div>足囲<b>${m.girth}mm</b></div>
        <div>ウィズ<b>${jisWidthCode(m.length, m.girth, sample.gender)}</b></div>
      </div>
    </div>`).join("");
  const rec = recommendedSize();
  $("rec-size").textContent = `${rec.cm.toFixed(1)}cm / ${rec.width}`;

  $("findings").innerHTML = CATEGORIES.map((c) => {
    const pos = dx.positives.has(c);
    const p = dx.confidence[c];
    const badge = pos ? (SUSPECT_ONLY.has(c) ? "疑いあり" : "傾向あり") : "所見なし";
    return `<div class="finding">
      <span class="finding-name">${CATEGORY_LABEL[c]}</span>
      <div class="bar${pos ? " pos" : ""}" title="確信度 ${Math.round(p * 100)}%(判定の目安 ${Math.round(THRESHOLD[c] * 100)}%)"><span style="width:${Math.round(p * 100)}%"></span></div>
      <span class="badge ${pos ? "pos" : "neg"}">${badge}</span>
    </div>`;
  }).join("");

  // 体質マップ: 横=剛性(かたい↔やわらかい)、縦=厚み(あつい↑ うすい↓)
  const cols = ["stiff", "standard", "soft"];
  const rows = ["thick", "standard", "thin"];
  const names = {
    "thick-stiff": "かたく<br>あつい", "thick-standard": "あつい", "thick-soft": "やわらかく<br>あつい",
    "standard-stiff": "かたい", "standard-standard": "標準", "standard-soft": "やわらかい",
    "thin-stiff": "かたく<br>うすい", "thin-standard": "うすい", "thin-soft": "やわらかく<br>うすい",
  };
  const axisLabel = ["あつい", "", "うすい"];
  let html = "";
  rows.forEach((r, ri) => {
    html += `<div class="axis-y">${axisLabel[ri]}</div>`;
    cols.forEach((c) => {
      const on = dx.rigidity === c && dx.thickness === r;
      html += `<div class="cell${on ? " on" : ""}">${names[`${r}-${c}`]}</div>`;
    });
  });
  html += `<div></div><div class="axis-x">かたい</div><div class="axis-x">← 剛性 →</div><div class="axis-x">やわらかい</div>`;
  $("const-grid").innerHTML = html;

  const parts = [];
  if (dx.rigidity !== "standard") parts.push(RIGIDITY_LABEL[dx.rigidity]);
  if (dx.thickness !== "standard") parts.push(THICKNESS_LABEL[dx.thickness]);
  $("const-summary").innerHTML = parts.length
    ? `あなたは<b>「${parts.join("・")}」</b>タイプです。${esc(content.feature.slice(2).join(""))}`
    : `あなたは<b>標準</b>タイプです。体質的な偏りが小さく、標準的なバランスの足です。`;
}

// ---- 診断文 ----

function renderReport() {
  const li = (items, warm) => items.length
    ? `<ul class="list${warm ? " warm" : ""}">${items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`
    : `<p class="empty">特にありません。</p>`;

  let html = "";
  if (content.customReasons.length) {
    html += `<div class="custom-box">
      <h3>オーダーメイドをおすすめします</h3>
      <p>${content.customReasons.map(esc).join("。<br>")}。</p>
      <button class="cta" data-goto="order">この足型で靴をつくる</button>
    </div>`;
  }
  html += `
    <div class="block">
      <p class="block-num">01</p>
      <h2 class="block-title">あなたの足の特徴</h2>
      ${content.feature.map((t) => `<p>${esc(t)}</p>`).join("")}
    </div>
    <div class="block">
      <p class="block-num">02</p>
      <h2 class="block-title">起こりやすいこと</h2>
      <p class="sub-title">すでに兆候が見られるもの</p>
      ${observedList()}
      <p class="sub-title">今後注意したいこと</p>
      ${li(content.future, false)}
    </div>
    <div class="block">
      <p class="block-num">03</p>
      <h2 class="block-title">なぜそうなるのか</h2>
      ${content.mechanism.map((t) => `<p>${esc(t)}</p>`).join("")}
    </div>
    <div class="block">
      <p class="block-num">04</p>
      <h2 class="block-title">靴選びの指針</h2>
      ${li(content.guidance, false)}
    </div>`;
  $("report").innerHTML = html;
  syncSee3d();
}

// 「すでに兆候」の各所見に、3D足型の該当部位を表示するボタンを付ける
function observedList() {
  const cats = CATEGORIES.filter((c) => dx.positives.has(c));
  if (!cats.length) return `<p class="empty">特にありません。</p>`;
  return `<ul class="list warm">${cats.map((c, i) => `<li>${esc(content.observed[i])}<button class="see3d" data-heat="${c}" data-scroll="1">3Dで見る</button></li>`).join("")}</ul>`;
}

function syncSee3d() {
  document.querySelectorAll(".see3d").forEach((b) => b.setAttribute("aria-pressed", b.dataset.heat === state.heat));
}

// ---- 注文 ----

function renderOrder() {
  const rec = recommendedSize();
  const diffMM = Math.abs(sample.right.length - sample.left.length);
  const type = footType();
  $("order-spec").innerHTML = `
    <div><span>サイズ</span><b>${rec.cm.toFixed(1)}cm</b></div>
    <div><span>ウィズ</span><b>${rec.width}</b></div>
    <div><span>足のタイプ</span><b>${type}</b></div>
    <div><span>左右の足長差</span><b>${diffMM}mm</b></div>`;

  const recDesign = recommendedDesign();
  $("designs").innerHTML = DESIGNS.map((d) => `
    <button class="option" data-design="${d.id}" aria-pressed="${state.design === d.id}">
      <svg viewBox="0 0 64 40" fill="none" stroke="#0d0d0d" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${d.icon}</svg>
      <div>
        <div class="option-name">${d.name}${d.id === recDesign ? '<span class="rec-tag">あなたにおすすめ</span>' : ""}</div>
        <div class="option-desc">${d.desc}</div>
        <div class="option-price">${yen(d.price)}〜</div>
      </div>
    </button>`).join("");

  const recMethod = content.customReasons.length ? "fitting" : "easy";
  $("methods").innerHTML = METHODS.map((m) => `
    <button class="option no-icon" data-method="${m.id}" aria-pressed="${state.method === m.id}">
      <div>
        <div class="option-name">${m.name}${m.id === recMethod ? '<span class="rec-tag">あなたにおすすめ</span>' : ""}</div>
        <div class="option-desc">${m.desc}</div>
        <div class="option-price">${m.extra ? "+" + yen(m.extra) : "追加料金なし"}・納期 ${m.lead}</div>
      </div>
    </button>`).join("");

  $("colors").innerHTML = COLORS.map((c) => `
    <button class="color" data-color="${c.id}" aria-pressed="${state.color === c.id}"><i style="background:${c.hex}"></i>${c.name}</button>`).join("");

  const fitting = state.method === "fitting";
  const steps = [
    ["足をスキャン・診断", "完了しています。足型データが注文に引き継がれます。", true],
    ["足型を3Dプリント", "スキャンデータから、あなたの足の形をした足型をつくります。", fitting],
    ["デザインの木型で仮縫い", "選んだデザインの既存木型で、仮の靴(仮靴)を縫製します。", true],
    ["仮靴に足型を入れて調整", "仮靴に3Dプリント足型を入れ、当たる場所・余る場所を職人が合わせます。", fitting],
    ["本縫い・仕上げ", "調整した形で本縫いし、底付けして仕上げます。", true],
    ["お届け", `納期の目安は${METHODS.find((m) => m.id === state.method).lead}です。`, true],
  ];
  $("flow").innerHTML = steps.map(([t, d, on]) => `
    <div class="flow-step${on ? "" : " dim"}">
      <div class="flow-rail"><i></i></div>
      <div class="flow-body"><b>${t}</b><span>${on ? d : "足型フィッティングを選ぶと行います。"}</span></div>
    </div>`).join("");

  const design = DESIGNS.find((d) => d.id === state.design);
  const method = METHODS.find((m) => m.id === state.method);
  const color = COLORS.find((c) => c.id === state.color);
  $("summary").innerHTML = `
    <div class="summary-row"><span>デザイン</span><b>${design.name}</b></div>
    <div class="summary-row"><span>つくり方</span><b>${method.name}</b></div>
    <div class="summary-row"><span>色</span><b>${color.name}</b></div>
    <div class="summary-row"><span>サイズ / ウィズ</span><b>${rec.cm.toFixed(1)}cm / ${rec.width}</b></div>
    <div class="summary-row"><span>納期の目安</span><b>${method.lead}</b></div>`;
  $("total").textContent = yen(design.price + method.extra);
}

// ---- 3D ----

const HEAT_STOPS = [
  [0.0, [0.925, 0.894, 0.855]],
  [0.45, [0.949, 0.722, 0.294]],
  [0.75, [0.898, 0.38, 0.184]],
  [1.0, [0.722, 0.114, 0.141]],
];

function heatColor(t, out, o) {
  for (let k = 1; k < HEAT_STOPS.length; k++) {
    const [t1, c1] = HEAT_STOPS[k];
    if (t <= t1 || k === HEAT_STOPS.length - 1) {
      const [t0, c0] = HEAT_STOPS[k - 1];
      const u = Math.min(Math.max((t - t0) / (t1 - t0), 0), 1);
      for (let j = 0; j < 3; j++) out[o + j] = c0[j] + (c1[j] - c0[j]) * u;
      return;
    }
  }
}

function renderHeatChips() {
  // 色は陽性と判定された所見にだけ付ける(判定と図を食い違わせない。仕様書10.6)
  const pos = CATEGORIES.filter((c) => dx.positives.has(c));
  const opts = [];
  for (const c of pos) opts.push([c, CATEGORY_LABEL[c]]);
  if (pos.length) opts.push(["none", "色なし"]);
  $("heat-chips").innerHTML = opts.map(([k, label]) => {
    const dot = CATEGORIES.includes(k) ? '<span class="dot"></span>' : "";
    return `<button class="chip" data-heat="${k}" aria-pressed="${state.heat === k}">${dot}${label}</button>`;
  }).join("");

  const n = window.FOOT_DATA.n;
  let cap;
  if (!pos.length) {
    cap = "所見が検出されなかったため、色分けはしていません。";
  } else if (state.heat === "none") {
    cap = "色分けをしていない3D足型です。";
  } else {
    const label = CATEGORY_LABEL[state.heat];
    const [np_, nn] = n[state.heat];
    cap = `${label}で、メッシュ上で目立つ形の特徴を色で示しています。${label}のある足とない足(${np_}足と${nn}足の比較)を見分けるときに、特に効いている部位です。`;
  }
  document.querySelector(".legend").hidden = !pos.length || state.heat === "none";
  syncSee3d();
  $("heat-caption").textContent = cap + (pos.length ? "色は多数の足型から求めた傾向で、あなた個人の診断の根拠ではありません。" : "") + "3Dモデルは計測値から作ったデモ用の形状です。";
}

let viewer = null;

function createViewer() {
  const el = $("viewer");
  const data = window.FOOT_DATA;
  const V = data.v.length / 3;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  el.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 1, 5000);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b2a8, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(-300, 500, -200);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.6);
  fill.position.set(300, 200, 300);
  scene.add(fill);

  // 接地影
  const shadowTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, "rgba(0,0,0,0.28)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);

  const geom = new THREE.BufferGeometry();
  const pos = new Float32Array(V * 3);
  const col = new Float32Array(V * 3);
  geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geom.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geom.setIndex(data.f);
  const mesh = new THREE.Mesh(
    geom,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, side: THREE.DoubleSide })
  );
  scene.add(mesh);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.2;
  controls.minDistance = 250;
  controls.maxDistance = 900;
  controls.addEventListener("start", () => { controls.autoRotate = false; });

  // 平均形状の足幅/足長(正規化座標)。足幅の合成スケールの基準にする。
  let xmin = Infinity, xmax = -Infinity, zmin = Infinity, zmax = -Infinity;
  for (let i = 0; i < V; i++) {
    xmin = Math.min(xmin, data.v[i * 3]); xmax = Math.max(xmax, data.v[i * 3]);
    zmin = Math.min(zmin, data.v[i * 3 + 2]); zmax = Math.max(zmax, data.v[i * 3 + 2]);
  }
  const meanRatio = (xmax - xmin) / (zmax - zmin);

  function updateShape() {
    const foot = sample[state.side];
    // 平均足型 + 陽性所見の典型的な形の違い(強調して表示)
    const shift = new Float32Array(V * 3);
    for (const c of dx.positives) {
      const d = data.diff[c];
      for (let k = 0; k < V * 3; k++) shift[k] += 1.8 * d[k];
    }
    const s = foot.length / (zmax - zmin);
    const wx = Math.min(Math.max(foot.width / foot.length / meanRatio, 0.9), 1.1);
    const hy = dx.thickness === "thick" ? 1.05 : dx.thickness === "thin" ? 0.95 : 1;
    let ymin = Infinity, cx = 0, cz = 0;
    for (let i = 0; i < V; i++) {
      pos[i * 3] = (data.v[i * 3] + shift[i * 3]) * s * wx;
      pos[i * 3 + 1] = (data.v[i * 3 + 1] + shift[i * 3 + 1]) * s * hy;
      pos[i * 3 + 2] = (data.v[i * 3 + 2] + shift[i * 3 + 2]) * s;
      ymin = Math.min(ymin, pos[i * 3 + 1]);
      cx += pos[i * 3]; cz += pos[i * 3 + 2];
    }
    cx /= V; cz /= V;
    for (let i = 0; i < V; i++) {
      pos[i * 3] -= cx; pos[i * 3 + 1] -= ymin; pos[i * 3 + 2] -= cz;
    }
    geom.attributes.position.needsUpdate = true;
    geom.computeVertexNormals();
    geom.computeBoundingSphere();
    // 左足は右足の鏡像(x反転)で表示する
    mesh.scale.x = state.side === "left" ? -1 : 1;
    shadow.scale.set(foot.width * 1.6, foot.length * 1.25, 1);
    shadow.position.set(0, 0.5, 0);
    controls.target.set(0, 35, 0);
  }

  function updateColors() {
    const keys = dx.positives.has(state.heat) ? [state.heat] : [];
    for (let i = 0; i < V; i++) {
      let t = 0;
      for (const k of keys) t = Math.max(t, data.heat[k][i] / 100);
      heatColor(t, col, i * 3);
    }
    geom.attributes.color.needsUpdate = true;
  }

  function resize() {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(el);

  // 内側・斜め上から見る初期視点(母趾側が手前)
  camera.position.set(-300, 200, -200);

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });

  $("viewer-loading").remove();
  const api = {
    update() { updateShape(); updateColors(); },
    colors: updateColors,
    resetView() {
      const sign = state.side === "left" ? -1 : 1;
      camera.position.set(-300 * sign, 200, -200);
      controls.autoRotate = true;
    },
  };
  api.update();
  resize();
  return api;
}

// ---- ホームのヒーロー(平均足型の点群に走査線を当てる) ----

function footPoints() {
  // 平均足型の頂点を、中心0・足長1に揃えた座標で返す
  const v = window.FOOT_DATA.v;
  const V = v.length / 3;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < V; i++) for (let j = 0; j < 3; j++) { lo[j] = Math.min(lo[j], v[i * 3 + j]); hi[j] = Math.max(hi[j], v[i * 3 + j]); }
  const s = 1 / (hi[2] - lo[2]);
  const p = new Float32Array(V * 3);
  for (let i = 0; i < V; i++) {
    p[i * 3] = (v[i * 3] - (lo[0] + hi[0]) / 2) * s;
    p[i * 3 + 1] = (v[i * 3 + 1] - lo[1]) * s - 0.12;
    p[i * 3 + 2] = (v[i * 3 + 2] - (lo[2] + hi[2]) / 2) * s;
  }
  return { p, V };
}

const GOLD = [0.788, 0.659, 0.298];

function pointsScene(el, size) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 20);
  const { p, V } = footPoints();
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(p, 3));
  const col = new Float32Array(V * 3);
  geom.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geom, new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true }));
  scene.add(pts);
  const resize = () => {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();
  return {
    renderer, scene, camera, geom, pts, p, V, col,
    dispose() { ro.disconnect(); renderer.setAnimationLoop(null); geom.dispose(); renderer.dispose(); renderer.domElement.remove(); },
  };
}

function createHero() {
  const h = pointsScene($("hero-canvas"), 2.2);
  h.camera.position.set(0, 0.42, 1.25);
  h.camera.lookAt(0, 0.08, 0);
  h.renderer.setAnimationLoop((t) => {
    if (state.tab !== "home") return;
    const sec = t / 1000;
    h.pts.rotation.y = sec * 0.35;
    const sweep = ((sec / 2.6) % 1) * 1.3 - 0.65;   // つま先→かかとへ走査線
    for (let i = 0; i < h.V; i++) {
      const d = (h.p[i * 3 + 2] - sweep) / 0.035;
      const g = Math.exp(-d * d);
      for (let j = 0; j < 3; j++) h.col[i * 3 + j] = GOLD[j] * 0.5 + (1 - GOLD[j] * 0.5) * g;
    }
    h.geom.attributes.color.needsUpdate = true;
    h.renderer.render(h.scene, h.camera);
  });
}

// ---- スキャン(実アプリの音声ガイドの文言を使った流れのデモ) ----

const SCAN_STEPS = ["prep", "guide", "detect", "scan", "process", "done"];
const SCAN_DOT = { prep: 0, guide: 0, detect: 1, scan: 2, process: 3, done: 3 };
const SCAN_MS = 9000;
const scan = { side: "right", step: 0, timers: [], view: null };

function narration(key) {
  const foot = SIDE_LABEL[scan.side];
  const outer = scan.side === "right" ? "右" : "左";
  const inner = scan.side === "right" ? "左" : "右";
  return {
    intro: `これから${foot}をスキャンします。音声ガイドに従って操作してください。まず、イスに座り、裸足の状態の${foot}を平らな床の上に置いてください。準備できましたら、次へ、を押してください。`,
    align: `iPhoneを膝のところに持っていき、枠の中の半透明の足に、${foot}を重ねてください。できましたら、次へ、を押してください。`,
    detect: `カメラを準備しています。iPhoneを${foot}の真上、およそ三十センチの高さで、そのまま静止させてください。`,
    found: `${foot}を認識しました。スタートを押してください。`,
    side: `これから${foot}の周りを、ゆっくりと二周します。iPhoneを${foot}の${outer}側、踵の高さまで下げてください。スキャン中は${foot}を動かさないでください。`,
    toe: `つま先まで来ましたか？それではiPhoneを${foot}の${outer}側、踵の近くまで移動してください。`,
    lap1: `一周目、お疲れ様でした。ここからは反対回りで進みます。iPhoneを少し低い位置に構え直して、${inner}側を通ってつま先の方向へ戻ってください。`,
    lap2: "二周、お疲れ様でした。最後に踵の裏側だけもう一度撮影します。できるだけ低く構えて、踵の左右の側面を映してください。",
    lap3: "確認できました。終了ボタンを押してください。",
    processing: "三次元モデルを作成しています。完了するまで、そのままお待ちください。",
    done: `${foot}のスキャンが完了しました。モデルを確認して、問題なければ、OKを押してください。`,
  }[key];
}

function openScan(side) {
  scan.side = side;
  $("scan").classList.add("open");
  $("scan-dots").innerHTML = "<i></i><i></i><i></i><i></i>";
  goScanStep(0);
}

function clearScan() {
  scan.timers.forEach((t) => { clearTimeout(t); cancelAnimationFrame(t); });
  scan.timers = [];
  scan.view?.dispose();
  scan.view = null;
}

function closeScan() {
  clearScan();
  $("scan").classList.remove("open");
}

function finishScan() {
  state.scans[scan.side] = true;
  closeScan();
  renderMeasure();
  renderHome();
}

function scanButton(label, enabled = true) {
  const b = $("scan-next");
  b.textContent = label;
  b.disabled = !enabled;
}

function goScanStep(i) {
  clearScan();
  scan.step = i;
  const step = SCAN_STEPS[i];
  $("scan-title").textContent = `${SIDE_LABEL[scan.side]}のスキャン`;
  document.querySelectorAll("#scan-dots i").forEach((d, k) => d.classList.toggle("on", k <= SCAN_DOT[step]));
  $("scan-skip").hidden = step === "done";
  const stage = $("scan-stage");
  const cap = (key) => { $("scan-caption").textContent = narration(key); };
  const guide = (cls) => `<div class="floor"></div><img class="guide" src="img/guide_${scan.side}.png" alt=""><div class="frame ${cls}"></div>`;

  if (step === "prep") {
    stage.innerHTML = '<img class="chair" src="img/chair.png" alt="">';
    cap("intro");
    scanButton("次へ");
  } else if (step === "guide") {
    stage.innerHTML = guide("");
    cap("align");
    scanButton("次へ");
  } else if (step === "detect") {
    stage.innerHTML = guide("detecting");
    cap("detect");
    scanButton("認識中…", false);
    scan.timers.push(setTimeout(() => {
      stage.querySelector(".frame").className = "frame found";
      cap("found");
      scanButton("スタート");
    }, 1800));
  } else if (step === "scan") {
    stage.innerHTML = `<div class="three"></div>
      <div class="ring"><svg viewBox="0 0 64 64"><circle class="bg" cx="32" cy="32" r="27"/><circle class="fg" cx="32" cy="32" r="27" stroke-dasharray="169.6" stroke-dashoffset="169.6"/></svg><b>0%</b></div>
      <div class="lap">1周目</div>`;
    cap("side");
    scanButton("終了", false);
    startScanView(stage.querySelector(".three"), false);
  } else if (step === "process") {
    stage.innerHTML = '<div class="spinner"><i></i>3Dモデルを作成中</div>';
    cap("processing");
    scanButton("作成中…", false);
    scan.timers.push(setTimeout(() => goScanStep(i + 1), 1800));
  } else if (step === "done") {
    const m = (sample ?? SAMPLES[FIRST_RUN_SAMPLE])[scan.side];
    stage.innerHTML = `<div class="three"></div><div class="done-badge">足長<b>${(m.length / 10).toFixed(1)}</b>cm・足幅<b>${(m.width / 10).toFixed(1)}</b>cm</div>`;
    cap("done");
    scanButton("OK");
    startScanView(stage.querySelector(".three"), true);
  }
}

// スキャン中は、iPhoneが足のまわりを回る順(足の中心からの方位角)に点が現れる。完了後は全点を回転表示。
function startScanView(el, complete) {
  let v;
  try { v = pointsScene(el, 2.6); } catch (e) { console.error(e); return; }
  scan.view = v;
  const mirror = scan.side === "left" ? -1 : 1;
  v.pts.scale.x = mirror;
  const order = Array.from({ length: v.V }, (_, k) => k)
    .map((k) => [k, (Math.atan2(v.p[k * 3] * mirror, -v.p[k * 3 + 2]) + Math.PI * 2.5) % (Math.PI * 2)])
    .sort((a, b) => a[1] - b[1]).map((a) => a[0]);
  const rank = new Float32Array(v.V);
  order.forEach((k, r) => { rank[k] = r / v.V; });
  const t0 = performance.now();
  const ringFg = $("scan-stage").querySelector(".fg");
  const ringTxt = $("scan-stage").querySelector(".ring b");
  const lap = $("scan-stage").querySelector(".lap");
  let lastKey = "side";

  v.renderer.setAnimationLoop(() => {
    const t = performance.now();
    const p = complete ? 1 : Math.min(Math.max((t - t0) / SCAN_MS, 0), 1);
    // 1周目で約7割、2周目で残り、最後にかかと
    const shown = complete ? 1 : p < 0.5 ? p / 0.5 * 0.7 : 0.7 + (p - 0.5) / 0.5 * 0.3;
    for (let k = 0; k < v.V; k++) {
      const age = shown - rank[k];
      const c = v.col;
      if (age < 0) { c[k * 3] = c[k * 3 + 1] = c[k * 3 + 2] = 0.16; continue; }
      const flash = complete ? 0 : Math.exp(-age * 40);
      for (let j = 0; j < 3; j++) c[k * 3 + j] = GOLD[j] + (1 - GOLD[j]) * flash;
    }
    v.geom.attributes.color.needsUpdate = true;
    const ang = complete ? t / 2500 : -0.6 + p * Math.PI * 4 * 0.9;
    const r = 1.85, hgt = complete ? 0.9 : 0.55 + 0.25 * Math.sin(p * Math.PI);
    v.camera.position.set(Math.sin(ang) * r, hgt, Math.cos(ang) * r);
    v.camera.lookAt(0, 0.05, 0);
    v.renderer.render(v.scene, v.camera);
    if (complete) return;

    ringFg.setAttribute("stroke-dashoffset", (169.6 * (1 - p)).toFixed(1));
    ringTxt.textContent = `${Math.round(p * 100)}%`;
    lap.textContent = p < 0.5 ? "1周目" : p < 0.85 ? "2周目" : "かかと";
    const key = p >= 1 ? "lap3" : p >= 0.85 ? "lap2" : p >= 0.5 ? "lap1" : p >= 0.22 ? "toe" : "side";
    if (key !== lastKey) { lastKey = key; $("scan-caption").textContent = narration(key); }
    if (p >= 1) { scanButton("終了"); v.renderer.setAnimationLoop(() => { v.renderer.render(v.scene, v.camera); }); }
  });
}

function scanNext() {
  const step = SCAN_STEPS[scan.step];
  if (step === "done") finishScan();
  else goScanStep(scan.step + 1);
}

// ---- AI解析 ----

function runAnalysis() {
  const items = [...document.querySelectorAll("#analyze-steps li")];
  items.forEach((li) => { li.className = ""; });
  $("analyzing").classList.add("open");
  items.forEach((li, k) => {
    setTimeout(() => {
      if (k) items[k - 1].className = "ok";
      li.className = "run";
    }, k * 650);
  });
  setTimeout(() => {
    items[items.length - 1].className = "ok";
    setTimeout(() => {
      $("analyzing").classList.remove("open");
      if (state.sample === null) selectSample(FIRST_RUN_SAMPLE);
      showTab("result");
    }, 350);
  }, items.length * 650);
}

function showModal(title, html) {
  $("modal-title").textContent = title;
  $("modal-text").innerHTML = html;
  $("modal").classList.add("open");
}

// ---- タブ・イベント ----

function showTab(tab) {
  state.tab = tab;
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === `screen-${tab}`));
  document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", t.dataset.tab === tab));
  window.scrollTo({ top: 0 });
  if (tab === "report" && !viewer && sample) {
    try {
      viewer = createViewer();
    } catch (e) {
      $("viewer-loading").textContent = "この端末では3D表示ができません。";
      console.error(e);
    }
  }
}

document.addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.dataset.sample) { selectSample(t.dataset.sample === "new" ? null : Number(t.dataset.sample)); return; }
  if (t.dataset.scan) { openScan(t.dataset.scan); return; }
  if (t.id === "scan-next") { scanNext(); return; }
  if (t.id === "scan-skip") { goScanStep(SCAN_STEPS.indexOf("done")); return; }
  if (t.id === "scan-close") { closeScan(); return; }
  if (t.id === "analyze-btn") { runAnalysis(); return; }
  if (t.id === "export-btn") {
    showModal("スキャンデータの書き出し", "両足の3Dモデル(OBJ / USDZ)をZIPにまとめて、AirDropやファイルに保存できます。<br>これはデモ画面のため、実際のファイルは作成されません。");
    return;
  }
  if (t.dataset.tab) { showTab(t.dataset.tab); return; }
  if (t.dataset.goto) { showTab(t.dataset.goto); return; }
  if (t.dataset.heat) {
    state.heat = t.dataset.heat;
    renderHeatChips();
    viewer?.colors();
    if (t.dataset.scroll) $("viewer").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (t.dataset.side) {
    state.side = t.dataset.side;
    document.querySelectorAll("[data-side]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.side === state.side));
    viewer?.update();
    viewer?.resetView();
    return;
  }
  if (t.dataset.design) { state.design = t.dataset.design; renderOrder(); return; }
  if (t.dataset.method) { state.method = t.dataset.method; renderOrder(); return; }
  if (t.dataset.color) { state.color = t.dataset.color; renderOrder(); return; }
  if (t.id === "order-btn") {
    showModal("ご注文ありがとうございます", "これはデモ画面のため、実際の注文は送信されていません。<br>本番では、足型データと注文内容が工房に届き、仮縫いの準備に入ります。");
    return;
  }
  if (t.id === "modal-close") { $("modal").classList.remove("open"); return; }
});
$("modal").addEventListener("click", (e) => { if (e.target.id === "modal") e.currentTarget.classList.remove("open"); });

const qsRaw = new URLSearchParams(location.search).get("s");
const qs = Number(qsRaw);
selectSample(qsRaw === "new" ? null : SAMPLES[qs] ? qs : 0);
try { createHero(); } catch (e) { console.error(e); }
// 旧URL(#3d・#text)は統合した診断画面に寄せる
const hashTab = { "3d": "report", text: "report" }[location.hash.slice(1)] ?? location.hash.slice(1);
if (["home", "measure", "result", "report", "order"].includes(hashTab)) showTab(hashTab);
