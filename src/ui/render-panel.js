import { ENERGY_MAX } from "../core/board.js";
import { PHASES } from "../core/game.js";
import { YUT } from "../core/yut.js";
import { canMove } from "../core/move.js";
import { canThrow } from "../core/actions.js";

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
    $("goal" + P.id).textContent = P.pieces.filter((p) => p.state === "done").length;
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
        `<span class="g">${YUT[v].glyph}</span>` +
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
      if (p.state === "done") { d.className = "wp done"; d.textContent = "✓"; }
      else if (p.state === "board") { d.className = "wp dead"; d.textContent = p.id + 1; }
      else {
        d.className = "wp";
        d.textContent = p.id + 1;
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
