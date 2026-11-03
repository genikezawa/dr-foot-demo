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

const state = { sample: 0, tab: "result", side: "right", heat: null, design: null, method: null, color: "black" };
let dx, content, sample;

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

function selectSample(i) {
  state.sample = i;
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
  if (viewer) viewer.update();
}

function renderSamples() {
  $("samples").innerHTML = SAMPLES.map(
    (s, i) => `<button class="sample-chip" data-sample="${i}" aria-pressed="${i === state.sample}">${s.name}・${s.tag}</button>`
  ).join("");
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
  const type = [dx.rigidity, dx.thickness].filter((a) => a !== "standard")
    .map((a) => (RIGIDITY_LABEL[a] ?? THICKNESS_LABEL[a]).replace("足", "")).join("・") || "標準";
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

// ---- タブ・イベント ----

function showTab(tab) {
  state.tab = tab;
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === `screen-${tab}`));
  document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", t.dataset.tab === tab));
  window.scrollTo({ top: 0 });
  if (tab === "report" && !viewer) {
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
  if (t.dataset.sample) { selectSample(Number(t.dataset.sample)); return; }
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
  if (t.id === "order-btn") { $("modal").classList.add("open"); return; }
  if (t.id === "modal-close") { $("modal").classList.remove("open"); return; }
});
$("modal").addEventListener("click", (e) => { if (e.target.id === "modal") e.currentTarget.classList.remove("open"); });

const qs = Number(new URLSearchParams(location.search).get("s"));
selectSample(SAMPLES[qs] ? qs : 0);
// 旧URL(#3d・#text)は統合した診断画面に寄せる
const hashTab = { "3d": "report", text: "report" }[location.hash.slice(1)] ?? location.hash.slice(1);
if (["result", "report", "order"].includes(hashTab)) showTab(hashTab);
