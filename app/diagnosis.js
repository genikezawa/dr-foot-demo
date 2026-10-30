// 診断文の組み立て。FootScanner の DiagnosisContentGenerator.swift の移植
// (設計: foot-diagnosis/アプリ用診断と症状.md 5〜8章)。
// 公開デモ用に、外反母趾・内転足の所見文は断定を避けた「疑い」表記にしている(偽陽性が多いため)。

export const CATEGORIES = ["hallux_valgus", "flat_arch", "high_arch", "adducted_forefoot"];

export const CATEGORY_LABEL = {
  hallux_valgus: "外反母趾",
  flat_arch: "扁平足",
  high_arch: "ハイアーチ",
  adducted_forefoot: "内転足",
};

// 本番の判定閾値(DiagnosisInferenceEngine と同じ)
export const THRESHOLD = { hallux_valgus: 0.5, flat_arch: 0.6, high_arch: 0.5, adducted_forefoot: 0.5 };

// 断定を避けて「疑い」と表記するカテゴリ
export const SUSPECT_ONLY = new Set(["hallux_valgus", "adducted_forefoot"]);

const CATEGORY_FINDING = {
  hallux_valgus: "親指の付け根が外側に傾いている可能性があります(外反母趾の疑い)。",
  flat_arch: "内側の縦アーチが低い形状です(扁平足の傾向)。",
  high_arch: "土踏まずが高く、標準より接地面積が小さい形状です(ハイアーチの傾向)。",
  adducted_forefoot: "前足部が内側を向いている可能性があります(内転足の疑い)。",
};

// ---- JIS S 5037 ウィズ表(JISWidthTables.swift と同じ値。男性・女性のみ) ----

function row(base, step, n, start) {
  return Array.from({ length: n }, (_, i) => start + base + i * step);
}

const MEN = {
  symbols: ["A", "B", "C", "D", "E", "EE", "EEE", "EEEE", "F", "G"],
  girth: Object.fromEntries(
    Array.from({ length: 21 }, (_, k) => [200 + k * 5, row(189, 6, 10, k * 3)])
  ),
  width: {
    200: [79, 81, 83, 85, 87, 89, 91, 93, 96, 98], 205: [81, 83, 85, 87, 89, 91, 93, 95, 97, 99],
    210: [82, 84, 86, 88, 90, 92, 94, 96, 98, 100], 215: [83, 85, 87, 89, 91, 93, 95, 97, 99, 101],
    220: [84, 86, 88, 90, 92, 94, 96, 98, 100, 102], 225: [85, 87, 89, 92, 94, 96, 98, 100, 102, 104],
    230: [87, 89, 91, 93, 95, 97, 99, 101, 103, 105], 235: [88, 90, 92, 94, 96, 98, 100, 102, 104, 106],
    240: [89, 91, 93, 95, 97, 99, 101, 103, 105, 107], 245: [90, 92, 94, 96, 98, 100, 103, 105, 107, 109],
    250: [92, 94, 96, 98, 100, 102, 104, 106, 108, 110], 255: [93, 95, 97, 99, 101, 103, 105, 107, 109, 111],
    260: [94, 96, 98, 100, 102, 104, 106, 108, 110, 112], 265: [95, 97, 99, 101, 103, 105, 107, 109, 111, 114],
    270: [96, 99, 101, 103, 105, 107, 109, 111, 113, 115], 275: [98, 100, 102, 104, 106, 108, 110, 112, 114, 116],
    280: [99, 101, 103, 105, 107, 109, 111, 113, 115, 117], 285: [100, 102, 104, 106, 108, 110, 112, 114, 116, 118],
    290: [101, 103, 105, 107, 110, 112, 114, 116, 118, 120], 295: [103, 105, 107, 109, 111, 113, 115, 117, 119, 121],
    300: [104, 106, 108, 110, 112, 114, 116, 118, 120, 122],
  },
};

const WOMEN = {
  symbols: ["A", "B", "C", "D", "E", "EE", "EEE", "EEEE", "F"],
  girth: Object.fromEntries(
    Array.from({ length: 16 }, (_, k) => [195 + k * 5, row(183, 6, 9, k * 3)])
  ),
  width: {
    195: [76, 78, 81, 83, 85, 87, 89, 91, 93], 200: [78, 80, 82, 84, 86, 88, 90, 92, 94],
    205: [79, 81, 83, 85, 87, 89, 91, 93, 96], 210: [80, 82, 84, 86, 88, 91, 93, 95, 97],
    215: [81, 83, 86, 88, 90, 92, 94, 96, 98], 220: [83, 85, 87, 89, 91, 93, 95, 97, 99],
    225: [84, 86, 88, 90, 92, 94, 96, 99, 101], 230: [85, 87, 89, 91, 94, 96, 98, 100, 102],
    235: [86, 89, 91, 93, 95, 97, 99, 101, 103], 240: [88, 90, 92, 94, 96, 98, 100, 102, 104],
    245: [89, 91, 93, 95, 97, 99, 101, 104, 106], 250: [90, 92, 94, 96, 99, 101, 103, 105, 107],
    255: [91, 94, 96, 98, 100, 102, 104, 106, 108], 260: [93, 95, 97, 99, 101, 103, 105, 107, 109],
    265: [94, 96, 98, 100, 102, 104, 107, 109, 111], 270: [95, 97, 99, 102, 104, 106, 108, 110, 112],
  },
};

const tableFor = (gender) => (gender === "female" ? WOMEN : MEN);

function nearestRow(rows, footLengthMM) {
  const keys = Object.keys(rows).map(Number).sort((a, b) => a - b);
  const clamped = Math.min(Math.max(Math.round(footLengthMM), keys[0]), keys[keys.length - 1]);
  const nearest = keys.reduce((best, k) => (Math.abs(k - clamped) < Math.abs(best - clamped) ? k : best));
  return rows[nearest];
}

export function jisWidthCode(footLengthMM, girthMM, gender) {
  const t = tableFor(gender);
  const r = nearestRow(t.girth, footLengthMM);
  const i = r.findIndex((upper) => girthMM <= upper);
  return t.symbols[i < 0 ? t.symbols.length - 1 : i];
}

// ---- 体質軸(§5) ----

const THICKNESS_THIN_MM = -9.7;
const THICKNESS_THICK_MM = -1.0;
const SPLAY_WIDTH_RATIO = 0.415;

export function thicknessResidualMM(m, gender) {
  const t = tableFor(gender);
  const e = t.symbols.indexOf("E");
  const eGirth = nearestRow(t.girth, m.length)[e];
  const eWidth = nearestRow(t.width, m.length)[e];
  return m.girth - (eGirth + 3.0 * (m.width - eWidth));
}

export function combine(sample) {
  const positives = new Set();
  const confidence = {};
  for (const foot of [sample.right, sample.left]) {
    for (const c of CATEGORIES) {
      confidence[c] = Math.max(confidence[c] ?? 0, foot.prob[c]);
      if (foot.prob[c] >= THRESHOLD[c]) positives.add(c);
    }
  }

  let rigidity = "standard";
  const hi = positives.has("high_arch"), fl = positives.has("flat_arch");
  if (hi && fl) rigidity = confidence.high_arch >= confidence.flat_arch ? "stiff" : "soft";
  else if (hi) rigidity = "stiff";
  else if (fl || positives.has("hallux_valgus")) rigidity = "soft";

  const residuals = [sample.right, sample.left].map((m) => thicknessResidualMM(m, sample.gender));
  const avg = residuals.reduce((a, b) => a + b, 0) / residuals.length;
  const thickness = avg > THICKNESS_THICK_MM ? "thick" : avg < THICKNESS_THIN_MM ? "thin" : "standard";

  const splayFoot = [sample.right, sample.left].some((m) => m.width / m.length >= SPLAY_WIDTH_RATIO);

  return { positives, confidence, rigidity, thickness, thicknessResidual: avg, splayFoot };
}

// ---- 診断文(§6・§7) ----

const STIFF_FUTURE = [
  ["足の指が反り返る(浮きゆび)"],
  ["指の関節が曲がって固まる(ハンマートゥ)"],
  ["爪先が靴に当たって削れる"],
  ["横アーチが低下し、指の付け根の幅が広がる(開張足)"],
  ["足裏の一部に負担が集中し、痛みが出る"],
  ["肩こり・腰痛・頭痛"],
  ["歩行が不安定になる、着地音が大きくなる"],
];
const SOFT_FUTURE = [
  ["親指の付け根が外側に傾く(外反母趾)", "hallux_valgus"],
  ["小指の付け根が内側に傾く(内反小趾)"],
  ["指の付け根の幅が広がる(開張足)"],
  ["タコ・魚の目ができやすい"],
  ["巻き爪や爪の変形"],
  ["踵が外側に倒れる"],
  ["足の指が反り返る(浮きゆび)"],
  ["猫背・反り腰、ペタペタと歩く"],
  ["捻挫やつまずきが多い"],
  ["膝・腰・股関節の痛み、首こり・肩こり"],
];
const THICK_FUTURE = [
  ["足の指が反り返る(浮きゆび)"],
  ["巻き爪や爪の肥厚"],
  ["後傾姿勢、外股、左右にブレる歩き方"],
  ["腰痛・肩こり、膝が外を向く"],
];
const THIN_FUTURE = [
  ["母趾・小趾・踵など骨の出っ張りが靴に当たって痛む"],
  ["タコ・魚の目ができやすい"],
  ["親指の付け根が外側に傾く(外反母趾)", "hallux_valgus"],
  ["小指の付け根が内側に傾く(内反小趾)"],
  ["踵や足裏の痛み"],
  ["猫背・反り腰、腰痛・膝痛・肩こり、偏頭痛"],
];

const RIGIDITY_CONTENT = {
  stiff: {
    feature: "体重がかかっても形が変わりにくい、支持性の高い足です。土踏まずが高く、標準より小さい接地面積で体を支えています。",
    future: STIFF_FUTURE,
    mechanism: "接地面積が小さいぶん、足裏の一部に圧力が集中します。また衝撃を吸収するための初期の回内(足が内側に倒れ込む動き)が起きにくいため、足で吸収しきれなかった衝撃が膝・腰・首など上の関節に回りやすくなります。",
  },
  soft: {
    feature: "体重がかかると形が変わりやすい、しなやかな足です。立っているときと足を浮かせたときで、足幅や足囲の寸法が大きく変わります。",
    future: SOFT_FUTURE,
    mechanism: "足が内側に倒れ込みやすく、蹴り出すときに中足部が硬い梃子に切り替わりません。親指側の列が不安定になり、母趾球にねじれる力がかかって親指が外側に押されます。また荷重時と非荷重時で寸法が変わるため、靴のサイズが決めにくい足でもあります。",
  },
};

const THICKNESS_CONTENT = {
  thick: {
    feature: "足裏の軟部組織が豊かで、天然のクッションを備えた足です。甲も高めです。",
    future: THICK_FUTURE,
    mechanism: "足底の脂肪層が天然のインソールとして圧を分散するため、タコや魚の目はできにくい傾向があります。一方でその厚みが足指の接地を甘くし、浮きゆびを助長することがあります。",
  },
  thin: {
    feature: "骨格が浮き出やすく、クッションの薄い足です。足裏の高さが出にくいタイプです。",
    future: THIN_FUTURE,
    mechanism: "踵や指の付け根の脂肪層が薄いと、衝撃が直接骨に伝わります。足で吸収しきれなかった衝撃は膝や腰が肩代わりするため、足以外の場所に痛みが出ることがあります。また骨が出っ張った部分に圧力が集中するため、その位置にタコや魚の目ができやすくなります。",
  },
};

const COMMON_MECHANISM =
  "靴と足の間に隙間があると、体重が踵側に移りやすくなり、足の指が浮いた状態(浮きゆび)になります。すると踵が左右に転がりやすくなり、内側の縦アーチが落ちて、親指の付け根に圧力が集中しやすくなります。";

export function generateContent(sample, dx) {
  const rig = RIGIDITY_CONTENT[dx.rigidity];
  const thk = THICKNESS_CONTENT[dx.thickness];

  const measurement = [["右足は", sample.right], ["左足は", sample.left]].map(
    ([label, m]) =>
      `${label} 足長${(m.length / 10).toFixed(1)}cm、足囲${Math.round(m.girth)}mm(${jisWidthCode(m.length, m.girth, sample.gender)}相当)です。`
  );
  const feature = [...measurement];
  if (rig) feature.push(rig.feature);
  if (thk) feature.push(thk.feature);
  if (!rig && !thk) feature.push("体質的な偏りが小さく、標準的なバランスの足です。");

  const observed = CATEGORIES.filter((c) => dx.positives.has(c)).map((c) => CATEGORY_FINDING[c]);

  const seen = new Set();
  const future = [];
  for (const [text, implied] of [...(rig?.future ?? []), ...(thk?.future ?? [])]) {
    if (implied && dx.positives.has(implied)) continue;
    if (!seen.has(text)) { seen.add(text); future.push(text); }
  }

  const mechanism = [COMMON_MECHANISM];
  if (rig) mechanism.push(rig.mechanism);
  if (thk) mechanism.push(thk.mechanism);

  const guidance = ["靴選びは踵から始まり踵に終わる、と言われます。踵がしっかり固定される靴を選び、紐やベルトは毎回きちんと締めましょう。"];
  if (dx.rigidity === "soft")
    guidance.push("座って測った寸法より、歩いているときの足はひとまわり大きくなります。ウィズは実測値ちょうどではなく、締め具合を調整できる紐靴を選ぶことが特に重要です。");
  if (dx.thickness === "thick")
    guidance.push("甲が高く足囲が大きいため、ウィズの大きい靴、または甲の締め具合を調整できる構造(紐・ベルト)が必要です。長さだけで選ぶと甲が圧迫されます。");
  if (dx.thickness === "thin")
    guidance.push("骨の出っ張りに靴が当たりやすいため、インソールでの圧分散と、内部の縫い目・素材の柔らかさを確認しましょう。");
  if (dx.positives.has("adducted_forefoot"))
    guidance.push("前足部が内側を向いている傾向があるため、既成靴の木型(まっすぐな前足部)と形が合わず、指先が当たったり踵が浮いたりしやすい足です。");

  const customReasons = [];
  if (dx.positives.has("adducted_forefoot")) customReasons.push("内転足の傾向があり、既成靴の木型と形が合いにくいため");
  if (dx.splayFoot && dx.thickness === "thin") customReasons.push("前足部が広く踵が細いため、既成靴では前足部と踵のサイズを両立しにくいため");

  return { feature, observed, future, mechanism, guidance, customReasons };
}

export const RIGIDITY_LABEL = { stiff: "かたい足", soft: "やわらかい足", standard: "標準" };
export const THICKNESS_LABEL = { thick: "あつい足", thin: "うすい足", standard: "標準" };
