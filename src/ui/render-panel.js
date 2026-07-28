import { ENERGY_MAX } from "../core/board.js";
import { PHASES, doneCount } from "../core/game.js";
import { YUT } from "../core/yut.js";
import { canMove } from "../core/move.js";
import { canThrow } from "../core/actions.js";
import { drawMiniStatue } from "./render-board.js";
import { chipIcon } from "./animal-icons.js";

const SVGNS = "http://www.w3.org/2000/svg";
/** drawMiniStatue(s=0.85, baseY=0)의 실측 bbox(양 진영 모두 대략 -11~14.5 x, -37~0 y)에
 *  여백을 살짝 더한 viewBox. render-board.js와 같은 그림을 그리므로 여기서 바꾸지 않는다. */
const WP_ICON_VIEWBOX = "-14 -40 32 44";

const $ = (id) => document.getElementById(id);

export function buildPanels(state) {
  for (const P of state.players) {
    const wrap = $("en" + P.id);
    wrap.innerHTML = "";
    for (let i = 0; i < ENERGY_MAX; i++) {
      const s = document.createElement("div");
      s.className = "eseg";
      const f = document.createElement("div");
      f.className = "efill";
      s.appendChild(f);
      wrap.appendChild(s);
    }
  }
}

/** 매 프레임 호출된다. DOM 생성 없이 style/class만 건드린다. */
export function renderEnergy(state) {
  for (const P of state.players) {
    const segs = $("en" + P.id).children;
    for (let i = 0; i < ENERGY_MAX; i++) {
      const fill = Math.max(0, Math.min(1, P.energy - i));
      segs[i].firstChild.style.transform = `scaleX(${fill})`;
      segs[i].classList.toggle("full", fill >= 1);
    }
  }
  const me = state.players[0];
  const btn = $("throwBtn");
  const bonus = me.bonus > 0;
  btn.disabled = !canThrow(state, 0);
  btn.classList.toggle("bonus", bonus && !btn.disabled);
  $("throwLabel").textContent = bonus ? `보너스 던지기 ×${me.bonus}` : "윷 던지기";
  $("phaseLabel").textContent = PHASES[state.phase].name;
}

/** 상태가 바뀐 프레임에만 호출한다. */
export function renderPanels(state, selection, handlers) {
  renderChips(state, selection, handlers);
  renderWaiting(state, selection, handlers);
  for (const P of state.players)
    $("goal" + P.id).textContent = doneCount(state, P.id);
}

function renderChips(state, selection, handlers) {
  for (const P of state.players) {
    const box = $("chip" + P.id);
    box.innerHTML = "";
    if (!P.results.length) {
      const d = document.createElement("div");
      d.className = "empty-hint";
      d.textContent = P.id === 0 ? "윷을 던져 결과를 모으세요" : "—";
      box.appendChild(d);
      continue;
    }

    // 같은 값끼리 묶어 보여준다. 선택은 그 묶음의 첫 결과 id로 한다.
    const groups = new Map();
    for (const r of P.results) {
      if (!groups.has(r.v)) groups.set(r.v, []);
      groups.get(r.v).push(r);
    }
    [...groups.entries()].sort((a, b) => a[0] - b[0]).forEach(([v, list]) => {
      const c = document.createElement("div");
      const selected = P.id === 0 && selection !== null
        && list.some((r) => r.id === selection.resultId);
      c.className = "chip" + (v < 0 ? " back" : "") + (P.id === 1 ? " static" : "")
        + (selected ? " sel" : "");
      c.innerHTML =
        chipIcon(v) +
        `<span>${YUT[v].name}</span>` +
        `<span class="v">${v > 0 ? "+" : ""}${v}</span>` +
        (list.length > 1 ? `<span class="n">×${list.length}</span>` : "");
      if (P.id === 0) {
        c.addEventListener("click", () =>
          handlers.onChipClick(selected ? null : list[0].id, v));
      }
      box.appendChild(c);
    });
  }
}

function renderWaiting(state, selection, handlers) {
  for (const P of state.players) {
    const box = $("wait" + P.id);
    box.innerHTML = "";
    const lbl = document.createElement("span");
    lbl.className = "lbl";
    lbl.textContent = "말";
    box.appendChild(lbl);

    const v = P.id === 0 && selection !== null ? selection.v : null;
    for (const p of P.pieces) {
      const d = document.createElement("div");
      // 상태 세 가지 — 대기 중(석상 아이콘) / 판 위(같은 아이콘, 흐리게) / 골인(체크).
      // 숫자 배지는 쓰지 않는다 — 판의 말과 같은 조각상으로 보여야 한다.
      if (p.state === "done") { d.className = "wp done"; d.textContent = "✓"; }
      else if (p.state === "board") { d.className = "wp dead"; appendWpIcon(d, P.id); }
      else {
        d.className = "wp";
        appendWpIcon(d, P.id);
        if (v !== null && canMove(p, v)) {
          d.classList.add("can");
          d.title = "출발시키기";
          d.addEventListener("click", () => handlers.onWaitPieceClick(p.id));
        }
      }
      box.appendChild(d);
    }
  }
}

function appendWpIcon(container, teamId) {
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("viewBox", WP_ICON_VIEWBOX);
  svg.setAttribute("class", "wp-icon");
  drawMiniStatue(svg, teamId);
  container.appendChild(svg);
}
