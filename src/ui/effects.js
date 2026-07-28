import { YUT } from "../core/yut.js";
import { NODE } from "../core/board.js";

/** 던지기 모션. 종반 충전 3800ms 대비 6.6%. 이보다 길면 보드를 보는 시간이 줄어든다. */
export const THROW_MS = 250;

let fx = null;
let toast = null;

export function initEffects() {
  fx = document.getElementById("fx");
  toast = document.getElementById("toast");
  fx.innerHTML = "";
  toast.innerHTML = "";
}

/** #fx에 요소를 띄우고 ms 뒤 스스로 사라지게 한다 */
function spawn(html, className, style, ms) {
  const d = document.createElement("div");
  d.className = className;
  d.innerHTML = html;
  Object.assign(d.style, style);
  fx.appendChild(d);
  setTimeout(() => d.remove(), ms);
  return d;
}

function say(text, tone = "") {
  const d = document.createElement("div");
  d.className = "toast-line " + tone;
  d.textContent = text;
  toast.appendChild(d);
  setTimeout(() => d.remove(), 1600);
  while (toast.children.length > 3) toast.firstChild.remove();
}

/**
 * 던지기 연출. 보드 구석 작은 영역에서만 재생되고 오버레이를 만들지 않는다.
 * 이미 확정된 결과를 250ms 동안 보여줄 뿐이다.
 */
function playThrow(ev) {
  const sticks = ev.sticks
    .map((f, i) => `<i class="${f ? "flat" : ""}${i === 0 ? " mark" : ""}"></i>`)
    .join("");
  const el = spawn(
    `<div class="sticks">${sticks}</div><div class="rname">${ev.name}</div>`,
    "fx-throw" + (ev.v === 4 || ev.v === 5 ? " bonus" : ""),
    { bottom: "12px" },
    THROW_MS + 500
  );
  if (ev.owner === 0) el.style.left = "12px";
  else el.style.right = "12px";
}

/** 동물이 출발 칸에서 도착 칸으로 달린다. 여러 마리가 겹쳐도 서로 막지 않는다. */
function playRunner(ev) {
  if (ev.from == null || !NODE[ev.from] || !NODE[ev.to]) return;
  const [x0, y0] = NODE[ev.from];
  const [x1, y1] = NODE[ev.to];
  const dur = 260 + Math.abs(ev.v) * 40;
  const el = spawn(YUT[ev.v].glyph, "fx-runner", {
    left: `${x0 / 600 * 100}%`,
    top: `${y0 / 600 * 100}%`,
    transform: `translate(-50%,-50%) scaleX(${x1 >= x0 ? 1 : -1})`,
  }, dur + 120);
  requestAnimationFrame(() => {
    el.style.transition = `left ${dur}ms ease-in-out, top ${dur}ms ease-in-out`;
    el.style.left = `${x1 / 600 * 100}%`;
    el.style.top = `${y1 / 600 * 100}%`;
  });
}

function playCapture(ev) {
  if (NODE[ev.node]) {
    const [x, y] = NODE[ev.node];
    spawn("", "fx-hit", { left: `${x / 600 * 100}%`, top: `${y / 600 * 100}%` }, 620);
  }
  say(ev.owner === 0 ? `${ev.count}말 잡았다! 한 번 더!` : `${ev.count}말 잡혔다`,
    ev.owner === 0 ? "good" : "bad");
}

function playPhase(ev) {
  document.body.dataset.phase = ev.to;
  const names = ["도입", "전개", "종반"];
  spawn(
    `<b>${names[ev.to]}</b><span>${ev.to === 2 ? "속도가 크게 오릅니다" : "속도가 오릅니다"}</span>`,
    "fx-phase", {}, 1800);
}

/**
 * 확정된 이벤트들을 연출한다. 상태를 읽지도 쓰지도 않는다.
 * @param {Array<{type:string}>} events
 */
export function playEvents(events) {
  for (const ev of events) {
    switch (ev.type) {
      case "throw": playThrow(ev); break;
      case "move": playRunner(ev); break;
      case "capture": playCapture(ev); break;
      case "goal":
        say(ev.owner === 0 ? "골인!" : "홍군 골인", ev.owner === 0 ? "good" : "bad");
        break;
      case "bonus":
        if (ev.owner === 0) say(`${ev.cause}! 한 번 더`, "good");
        break;
      case "expire":
        if (ev.owner === 0) say(`${YUT[ev.v].name} 사라짐`, "bad");
        break;
      case "invalid":
        // 침묵하면 버그로 인식되고, 알려주면 드라마가 된다
        say("잡혔습니다 — 간발의 차!", "bad");
        break;
      case "phase": playPhase(ev); break;
      default: break;
    }
  }
}
