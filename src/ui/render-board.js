import { NODE, BIG, P_START, P_TR, P_TL, P_BL, P_MID } from "../core/board.js";
import { nodeAt, canMove, simulate } from "../core/move.js";

let svg = null;
let pieceEls = {};
let ghostEl = null;
let targetEls = {};

function el(tag, attrs, parent) {
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

/**
 * 판의 붓질 — 선과 원을 미세하게 흐트러뜨려 손으로 그린 먹선처럼 보이게 한다.
 * feTurbulence/feDisplacementMap 같은 SVG 필터는 프레임마다 다시 계산돼 비싸므로 쓰지 않는다.
 * 대신 판이 buildBoard에서 딱 한 번 그려질 때 이 값들을 빌드 시점에 계산해 path로
 * 굳혀버린다 — 그린 뒤로는 정적인 벡터라 필터와 달리 런타임 비용이 전혀 없다.
 * 시드 고정 mulberry32라 재게임해도 흔들림 모양이 바뀌지 않는다(판 구조 인지에 중요).
 */
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260726);

/**
 * 직선 한 구간을 살짝 흔든 곡선으로. 양 끝은 흔들지 않는다(edge=0) — 칸 중심과
 * 정확히 맞물려야 사각형·대각선 구조가 흐려지지 않는다. 중간만 최대 jitter만큼 흔든다.
 */
function roughLine(p0, p1, jitter, n = 5) {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const edge = Math.sin(Math.PI * t); // 0(양 끝) ~ 1(중간)
    const off = (rng() - 0.5) * 2 * jitter * edge;
    pts.push([p0[0] + dx * t + nx * off, p0[1] + dy * t + ny * off]);
  }
  let d = `M${pts[0][0]},${pts[0][1]} `;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1], cur = pts[i];
    const mid = [(prev[0] + cur[0]) / 2, (prev[1] + cur[1]) / 2];
    d += `Q${prev[0]},${prev[1]} ${mid[0]},${mid[1]} `;
  }
  d += `L${pts[pts.length - 1][0]},${pts[pts.length - 1][1]}`;
  return d;
}

/** 여러 점을 지나는 폐곡선 — 꼭짓점 노드를 완벽한 원이 아니라 살짝 삐뚤한 원으로 그린다. */
function roughCircle(cx, cy, r, jitterRatio, n = 10) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 + (rng() - 0.5) * 2 * jitterRatio);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  let d = `M${(pts[0][0] + pts[n - 1][0]) / 2},${(pts[0][1] + pts[n - 1][1]) / 2} `;
  for (let i = 0; i < n; i++) {
    const cur = pts[i], next = pts[(i + 1) % n];
    const mid = [(cur[0] + next[0]) / 2, (cur[1] + next[1]) / 2];
    d += `Q${cur[0]},${cur[1]} ${mid[0]},${mid[1]} `;
  }
  return d + "Z";
}

/**
 * SVG viewBox 기준. 위쪽 여백이 필요한 이유: 말이 이제 진영 동물 석상이라 밑동(칸 중심)
 * 위로 자라고, 업기는 그 위에 조금 더 작은 석상을 얹는 방식이라 층이 늘수록 더 높이 자란다.
 * mockup-statues.html의 B안(stack shrink=0.74, plinth=true)으로 계산하면 맨 윗줄 칸
 * (y=62)에서 청군 3겹의 꼭대기(귀 끝)는 절대좌표로 약 -69, 4겹도 약 -94까지 올라간다.
 * -110까지 잡아 3겹은 41px, 4겹도 16px 여유를 남겨 drop-shadow 필터 번짐까지 흡수한다.
 * effects.js가 좌표를 %로 바꿀 때 이 값을 그대로 참조한다 — 여기서만 바꾸면 된다.
 */
export const VIEW = { minY: -110, w: 600, h: 710 };

/** 대좌·받침돌에 쓰는 중립 석재색 (한지 위에서 살짝 어두운 크림) */
const STONE = "#efe4c8";
/** 진영 동물 몸통을 깎아낸 돌 — 크림색 한 가지이던 걸 진영색으로 바꿔 판 위에서
 *  0.2초 안에 청/홍이 갈리게 한다. 채도는 낮춰 "돌"로 남게 하고, 명도까지 갈라
 *  색맹도 구분할 수 있게 했다 (청 쪽을 더 어둡게, 홍 쪽을 더 밝게). */
const TEAM_STONE = {
  0: { body: "var(--stone-b)", light: "var(--stone-b-lt)" },
  1: { body: "var(--stone-r)", light: "var(--stone-r-lt)" },
};
const INK = "var(--brush)";
const TEAM_MAIN = { 0: "var(--blue)", 1: "var(--red)" };

/**
 * 정면으로 앉은 석수 한 마리. baseY(엉덩이가 닿는 높이)에서 위로 자란다.
 * teamId 0=청군(호랑이·뾰족 귀·줄무늬) 1=홍군(곰·둥근 귀). mockup-statues.html의
 * sitting()을 그대로 이식했다 — 몸통/머리/다리 색만 중립 STONE에서 진영 석재색으로 바꿨다.
 * 반환값은 이 조각상이 차지한 높이(위쪽으로) — 다음 층을 어디에 올릴지 계산하는 데 쓴다.
 */
function sitting(parent, teamId, baseY, s) {
  const stone = TEAM_STONE[teamId];
  const ink = { stroke: INK, "stroke-width": 1.7 * s, "stroke-linejoin": "round" };
  // 꼬리
  el("path", {
    d: `M${11 * s},${baseY - 6 * s} C${18 * s},${baseY - 8 * s} ${19 * s},${baseY - 19 * s} ${13.5 * s},${baseY - 23 * s}`,
    fill: "none", stroke: INK, "stroke-width": 2.5 * s, "stroke-linecap": "round", opacity: 0.85,
  }, parent);
  // 몸통 — 앉은 자세라 아래가 넓다
  el("path", {
    d: `M${-12 * s},${baseY} L${-8.5 * s},${baseY - 21 * s} L${8.5 * s},${baseY - 21 * s} L${12 * s},${baseY} Z`,
    fill: stone.body, ...ink,
  }, parent);
  // 앞다리
  el("rect", { x: -8.6 * s, y: baseY - 10.5 * s, width: 5.4 * s, height: 10.5 * s, rx: 2 * s, fill: stone.light, ...ink }, parent);
  el("rect", { x: 3.2 * s, y: baseY - 10.5 * s, width: 5.4 * s, height: 10.5 * s, rx: 2 * s, fill: stone.light, ...ink }, parent);
  // 귀 — 호랑이 뾰족 / 곰 둥글
  const hy = baseY - 31 * s;
  if (teamId === 0) {
    el("path", { d: `M${-8.6 * s},${hy - 4 * s} L${-11.5 * s},${hy - 12.5 * s} L${-2.8 * s},${hy - 8.4 * s} Z`, fill: stone.body, ...ink }, parent);
    el("path", { d: `M${8.6 * s},${hy - 4 * s} L${11.5 * s},${hy - 12.5 * s} L${2.8 * s},${hy - 8.4 * s} Z`, fill: stone.body, ...ink }, parent);
  } else {
    el("circle", { cx: -8.4 * s, cy: hy - 7 * s, r: 4.3 * s, fill: stone.body, ...ink }, parent);
    el("circle", { cx: 8.4 * s, cy: hy - 7 * s, r: 4.3 * s, fill: stone.body, ...ink }, parent);
  }
  // 머리
  el("circle", { cx: 0, cy: hy, r: 10.6 * s, fill: stone.body, ...ink }, parent);
  const k = el("g", { stroke: INK, "stroke-width": 1.6 * s, "stroke-linecap": "round", fill: "none" }, parent);
  if (teamId === 0) {
    el("path", { d: `M${-9.6 * s},${hy - 3.2 * s} h${3.8 * s} M${-10 * s},${hy + 1.4 * s} h${3.2 * s}` }, k);
    el("path", { d: `M${9.6 * s},${hy - 3.2 * s} h${-3.8 * s} M${10 * s},${hy + 1.4 * s} h${-3.2 * s}` }, k);
    el("path", { d: `M${-2.2 * s},${hy - 9.2 * s} l${1.1 * s},${3.1 * s} M${2.2 * s},${hy - 9.2 * s} l${-1.1 * s},${3.1 * s}` }, k);
  }
  el("circle", { cx: -3.9 * s, cy: hy - 1.5 * s, r: 1.5 * s, fill: INK }, parent);
  el("circle", { cx: 3.9 * s, cy: hy - 1.5 * s, r: 1.5 * s, fill: INK }, parent);
  el("ellipse", {
    cx: 0, cy: hy + 4.6 * s, rx: (teamId === 0 ? 5.1 : 5.9) * s, ry: (teamId === 0 ? 3.5 : 4.1) * s,
    fill: stone.light, ...ink,
  }, parent);
  el("ellipse", { cx: 0, cy: hy + 3 * s, rx: 1.7 * s, ry: 1.2 * s, fill: INK }, parent);
  // 이 조각상의 총 높이 (귀 끝까지)
  return (teamId === 0 ? 43.5 : 42) * s;
}

/**
 * 대기 말 패널용 축소 석상 한 마리 (대좌 없이 몸통만, s=0.85). 판의 sitting()과
 * 완전히 같은 그림을 그려 패널과 판이 같은 조각상으로 보이게 한다
 * (render-panel.js에서 가져다 쓴다). svg의 viewBox는 "-15 -42 34 46" 기준으로 맞췄다.
 */
export function drawMiniStatue(svgEl, teamId) {
  const g = el("g", {}, svgEl);
  sitting(g, teamId, 0, 0.85);
}

/** 층 사이에 끼는 얇은 받침돌. 폭은 위 조각상 크기에 맞춘다 */
function slab(parent, teamId, y, s) {
  const w = 13 * s;
  el("rect", { x: -w, y: y - 4.6, width: w * 2, height: 4.6, rx: 1.4, fill: TEAM_MAIN[teamId], stroke: INK, "stroke-width": 1.6 }, parent);
}

/**
 * 진영 동물 석상 더미. mockup-statues.html B안(대좌 + 완만하게 작아짐, shrink=0.74)을
 * 그대로 이식했다. n=쌓인 말 개수(층수) — 맨 아래 대좌 위에 조각상을 쌓고, 업힌 말마다
 * 74% 크기로 하나씩 더 올린다. 층 사이 받침돌이 "쌓아 올린 것"으로 읽히게 한다.
 */
function drawStatue(parent, teamId, n) {
  const main = TEAM_MAIN[teamId];
  el("ellipse", { cx: 0, cy: 9, rx: 19, ry: 4.8, fill: INK, opacity: 0.18 }, parent);
  let y = -7.4;
  el("path", { d: "M-18,8 L-15,-3 L15,-3 L18,8 Z", fill: STONE, stroke: INK, "stroke-width": 1.8, "stroke-linejoin": "round" }, parent);
  el("rect", { x: -19, y: -7.4, width: 38, height: 4.6, rx: 1.4, fill: main, stroke: INK, "stroke-width": 1.6 }, parent);

  let s = 1.15;
  const shrink = 0.74;
  for (let i = 0; i < n; i++) {
    if (i > 0) { slab(parent, teamId, y, s / shrink); y -= 4.6; }
    const h = sitting(parent, teamId, y, s);
    y -= h;
    s *= shrink;
  }
}

export function buildBoard(svgEl, state, handlers) {
  svg = svgEl;
  svg.innerHTML = "";
  pieceEls = {};
  targetEls = {};

  el("rect", { x: 0, y: VIEW.minY, width: VIEW.w, height: VIEW.h, rx: 10, fill: "var(--hanji)" }, svg);

  // 판의 붓질 — 사각형(외곽 4변)과 대각선 2개를 미세하게 흔든 곡선으로 그린다.
  // 양 끝(칸 중심)은 흔들지 않아 구조는 그대로 또렷하다. 굵기 변화는 본 획 위에
  // 옅고 가는 마른붓 자국을 한 겹 더 겹쳐 흉내낸다 — 둘 다 buildBoard에서 한 번만 계산.
  const EDGES = [
    [P_START, P_TR], [P_TR, P_TL], [P_TL, P_BL], [P_BL, P_START],
    [P_TR, P_BL], [P_TL, P_START],
  ];
  const lines = el("g", {
    stroke: "var(--brush)", "stroke-width": 3.4, "stroke-linecap": "round",
    fill: "none", opacity: 0.72,
  }, svg);
  let mainD = "";
  for (const [a, b] of EDGES) mainD += roughLine(a, b, 2.4) + " ";
  el("path", { d: mainD }, lines);
  let grainD = "";
  for (const [a, b] of EDGES) grainD += roughLine(a, b, 3.3) + " ";
  el("path", { d: grainD, "stroke-width": 1.4, opacity: 0.24, "stroke-dasharray": "1 3.6" }, lines);

  const nodesG = el("g", {}, svg);
  for (const k in NODE) {
    const id = +k, [x, y] = NODE[k], big = BIG.has(id);
    el("path", {
      d: roughCircle(x, y, big ? 27 : 17, big ? 0.035 : 0.05),
      fill: "var(--hanji)", stroke: "var(--brush)", "stroke-width": big ? 3.4 : 2.6,
    }, nodesG);
    if (big)
      el("path", { d: roughCircle(x, y, 20, 0.05), fill: "none", stroke: "var(--brush)",
        "stroke-width": 1.6, opacity: 0.5 }, nodesG);
  }

  const lab = (x, y, t, sz) => {
    const n = el("text", {
      x, y: y + sz * 0.34, "text-anchor": "middle", "font-size": sz,
      "font-weight": 800, fill: "var(--brush)", opacity: 0.5, "font-family": "inherit",
    }, svg);
    n.textContent = t;
  };
  lab(P_START[0], P_START[1] - 44, "출발 · 골", 14);
  lab(P_MID[0], P_MID[1], "방", 15);

  // 도착 지점 표시 레이어 — 칩을 고르면 갈 수 있는 칸이 여기에 켜진다
  const tg = el("g", { class: "targets" }, svg);
  for (const k in NODE) {
    const [x, y] = NODE[k];
    targetEls[k] = el("circle", {
      class: "target", cx: x, cy: y, r: 24, fill: "none",
      stroke: "var(--gold)", "stroke-width": 3, "stroke-dasharray": "6 5", opacity: 0,
    }, tg);
  }

  ghostEl = el("g", { class: "ghost" }, svg);
  el("circle", { cx: 0, cy: 0, r: 22, fill: "none", stroke: "var(--gold)",
    "stroke-width": 4, "stroke-dasharray": "7 5" }, ghostEl);

  const pg = el("g", { class: "pieces" }, svg);
  for (const P of state.players) {
    for (const p of P.pieces) {
      const gg = el("g", { class: "piece hidden" }, pg);
      // 강조 링 — 석상에는 circle.body가 없으니 "이동 가능"/"잡기 가능" 표시는
      // 이 바닥 링 하나로 대신한다 (game.css의 .piece.can/.piece.capture 참고).
      // 반지름은 대좌 폭(±19)보다 조금 크게 잡아 대좌를 넉넉히 감싼다.
      el("circle", {
        class: "ring", cx: 0, cy: 9, r: 26,
        fill: "none", stroke: "none", "stroke-width": 0,
      }, gg);
      el("g", { class: "statue" }, gg);
      gg.addEventListener("click", () => handlers.onPieceClick(P.id, p.id));
      gg.addEventListener("mouseenter", () => handlers.onPieceHover(P.id, p.id));
      gg.addEventListener("mouseleave", () => handlers.onPieceLeave());
      pieceEls[P.id + "-" + p.id] = gg;
    }
  }
}

/**
 * @param {{resultId:number, v:number}|null} selection 고른 결과 칩
 */
export function renderBoard(state, selection) {
  const leaders = {};
  const visible = []; // z-order 정렬용 — {e, y}

  for (const P of state.players) {
    const byNode = {};
    for (const p of P.pieces) {
      const e = pieceEls[P.id + "-" + p.id];
      e.classList.remove("can", "capture");
      if (p.state !== "board") { e.classList.add("hidden"); continue; }
      const n = nodeAt(p);
      (byNode[n] = byNode[n] || []).push(p);
    }
    for (const n in byNode) {
      const list = byNode[n], [x, y] = NODE[n];
      const off = P.id === 0 ? -3 : 3;   // 두 진영이 완전히 겹쳐 보이지 않도록
      list.forEach((p, i) => {
        const e = pieceEls[P.id + "-" + p.id];
        if (i === 0) {
          e.classList.remove("hidden");
          e.setAttribute("transform", `translate(${x + off},${y})`);
          const statue = e.querySelector(".statue");
          statue.innerHTML = "";
          drawStatue(statue, P.id, list.length); // 층수 = 업힌 말 개수
          visible.push({ e, y });
        } else {
          e.classList.add("hidden");
        }
      });
      leaders[P.id + "|" + n] = list[0];
    }
  }

  // 겹치는 순서: 위쪽(y가 작은) 칸의 탑부터 그려야 아래쪽 탑이 위로 온다.
  visible.sort((a, b) => a.y - b.y);
  for (const { e } of visible) e.parentNode.appendChild(e);

  for (const k in targetEls) targetEls[k].style.opacity = 0;
  if (!selection) return;

  // 칩을 고르면: 움직일 수 있는 말과 도착 지점을 즉시 보여준다.
  // 잡을 수 있는 수는 따로 강조한다 (기획서 9장 — 종반 속도의 전제 조건).
  const enemy = state.players[1].pieces;
  for (const p of state.players[0].pieces) {
    if (!canMove(p, selection.v)) continue;
    const r = simulate(p, selection.v);
    if (!r) continue;

    const lead = p.state === "board" ? leaders["0|" + nodeAt(p)] : null;
    if (lead) pieceEls["0-" + lead.id].classList.add("can");

    if (!r.done && targetEls[r.node]) {
      const willCapture = enemy.some((q) => q.state === "board" && nodeAt(q) === r.node);
      targetEls[r.node].style.opacity = 1;
      targetEls[r.node].setAttribute("stroke", willCapture ? "var(--red)" : "var(--gold)");
      targetEls[r.node].setAttribute("stroke-width", willCapture ? 5 : 3);
      if (willCapture && lead) pieceEls["0-" + lead.id].classList.add("capture");
    }
  }
}

export function showGhost(node) {
  if (!ghostEl || !NODE[node]) return;
  const [x, y] = NODE[node];
  ghostEl.setAttribute("transform", `translate(${x},${y})`);
  ghostEl.classList.add("on");
}

export function hideGhost() {
  ghostEl?.classList.remove("on");
}
