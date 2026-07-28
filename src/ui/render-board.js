import { NODE, BIG, P_START, P_TR, P_TL, P_BL, P_MID } from "../core/board.js";
import { nodeAt, canMove, simulate } from "../core/move.js";

let svg = null;
let pieceEls = {};
let ghostEl = null;
let targetEls = {};

export const nodeXY = (node) => NODE[node];

function el(tag, attrs, parent) {
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

export function buildBoard(svgEl, state, handlers) {
  svg = svgEl;
  svg.innerHTML = "";
  pieceEls = {};
  targetEls = {};

  el("rect", { x: 0, y: 0, width: 600, height: 600, rx: 10, fill: "var(--hanji)" }, svg);

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
      el("circle", {
        class: "body", cx: 0, cy: 0, r: 15,
        fill: P.id === 0 ? "var(--blue-d)" : "var(--red-d)",
        stroke: P.id === 0 ? "#7db8ea" : "#f0a294", "stroke-width": 2.4,
      }, gg);
      el("circle", { cx: 0, cy: -4, r: 6, fill: "#fff", opacity: 0.16 }, gg);
      const t = el("text", {
        class: "cnt", x: 0, y: 5, "text-anchor": "middle", "font-size": 13,
        "font-weight": 900, fill: "#fff", "font-family": "inherit",
      }, gg);
      t.textContent = "";
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
      const off = P.id === 0 ? -2 : 2;   // 두 진영이 완전히 겹쳐 보이지 않도록
      list.forEach((p, i) => {
        const e = pieceEls[P.id + "-" + p.id];
        if (i === 0) {
          e.classList.remove("hidden");
          e.setAttribute("transform", `translate(${x + off},${y})`);
          e.querySelector(".cnt").textContent = list.length > 1 ? list.length : "";
        } else {
          e.classList.add("hidden");
        }
      });
      leaders[P.id + "|" + n] = list[0];
    }
  }

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
