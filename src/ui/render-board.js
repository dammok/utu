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
 * SVG viewBox 기준. 위쪽 여백이 필요한 이유: 말이 이제 세워진 석탑이라 밑동(칸 중심)
 * 위로 자란다. 맨 윗줄 칸(y=62)에 3층 탑을 놓아도 상륜 꼭대기가 잘리지 않으려면
 * (자세한 계산은 폴리시 보고서 참고, 대략 탑 높이 94px + 여유) 62 - 50 = 12까지는
 * 커버해야 한다. 40px 여유를 더 얹어 필터(drop-shadow) 번짐까지 흡수한다.
 * effects.js가 좌표를 %로 바꿀 때 이 값을 그대로 참조한다 — 여기서만 바꾸면 된다.
 */
export const VIEW = { minY: -50, w: 600, h: 650 };

const STONE = "#efe4c8";
/** 석탑 크기 배율. mockup-towers.html의 drawPagoda 원본 치수에 곱한다. */
const PAGODA_SCALE = 1.3;
const TEAM_MAIN = { 0: "var(--blue)", 1: "var(--red)" };

/** mockup-towers.html의 drawPagoda를 그대로 이식 — 치수만 PAGODA_SCALE배. n=쌓인 말 개수(층수). */
function drawPagoda(parent, teamId, n) {
  const s = PAGODA_SCALE;
  const main = TEAM_MAIN[teamId];
  el("ellipse", { cx: 0, cy: 9 * s, rx: 17 * s, ry: 4.5 * s, fill: "var(--brush)", opacity: 0.18 }, parent);
  el("path", {
    d: `M${-17 * s},${8 * s} L${-14 * s},0 L${14 * s},0 L${17 * s},${8 * s} Z`,
    fill: STONE, stroke: "var(--brush)", "stroke-width": 1.8 * s, "stroke-linejoin": "round",
  }, parent);
  el("path", { d: `M${-14.5 * s},0 L${14.5 * s},0`, stroke: "var(--brush)", "stroke-width": 1.4 * s, opacity: 0.55 }, parent);

  let y = 0;
  for (let i = 0; i < n; i++) {
    const k = 1 - i * 0.12;
    const bw = 10.5 * k * s, rw = 15.5 * k * s;
    el("rect", {
      x: -bw, y: y - 13 * s, width: bw * 2, height: 13 * s, rx: 1.2 * s,
      fill: STONE, stroke: "var(--brush)", "stroke-width": 1.7 * s,
    }, parent);
    el("path", {
      d: `M${-rw},${y - 13.5 * s} L${-rw * 0.66},${y - 19.5 * s} L${rw * 0.66},${y - 19.5 * s} `
        + `L${rw},${y - 13.5 * s} L${rw * 0.78},${y - 11.8 * s} L${-rw * 0.78},${y - 11.8 * s} Z`,
      fill: main, stroke: "var(--brush)", "stroke-width": 1.7 * s, "stroke-linejoin": "round",
    }, parent);
    y -= 20.5 * s;
  }
  el("path", { d: `M0,${y} v${-5 * s}`, stroke: "var(--brush)", "stroke-width": 2 * s, "stroke-linecap": "round" }, parent);
  el("circle", { cx: 0, cy: y - 7.5 * s, r: 3.2 * s, fill: main, stroke: "var(--brush)", "stroke-width": 1.6 * s }, parent);
}

export function buildBoard(svgEl, state, handlers) {
  svg = svgEl;
  svg.innerHTML = "";
  pieceEls = {};
  targetEls = {};

  el("rect", { x: 0, y: VIEW.minY, width: VIEW.w, height: VIEW.h, rx: 10, fill: "var(--hanji)" }, svg);

  const lines = el("g", {
    stroke: "var(--brush)", "stroke-width": 3.4, "stroke-linecap": "round",
    fill: "none", opacity: 0.7,
  }, svg);
  el("path", { d: `M${P_START} L${P_TR} L${P_TL} L${P_BL} Z` }, lines);
  el("path", { d: `M${P_TR} L${P_BL}` }, lines);
  el("path", { d: `M${P_TL} L${P_START}` }, lines);

  const nodesG = el("g", {}, svg);
  for (const k in NODE) {
    const id = +k, [x, y] = NODE[k], big = BIG.has(id);
    el("circle", {
      cx: x, cy: y, r: big ? 27 : 17, fill: "var(--hanji)",
      stroke: "var(--brush)", "stroke-width": big ? 3.4 : 2.6,
    }, nodesG);
    if (big)
      el("circle", { cx: x, cy: y, r: 20, fill: "none", stroke: "var(--brush)",
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
      // 강조 링 — 탑에는 circle.body가 없으니 "이동 가능"/"잡기 가능" 표시는
      // 이 바닥 링 하나로 대신한다 (game.css의 .piece.can/.piece.capture 참고).
      el("circle", {
        class: "ring", cx: 0, cy: 9 * PAGODA_SCALE, r: 26 * PAGODA_SCALE,
        fill: "none", stroke: "none", "stroke-width": 0,
      }, gg);
      el("g", { class: "tower" }, gg);
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
          const tower = e.querySelector(".tower");
          tower.innerHTML = "";
          drawPagoda(tower, P.id, list.length); // 층수 = 업힌 말 개수
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
