import { YUT } from "../core/yut.js";
import { NODE } from "../core/board.js";

/** 던지기 모션. 종반 충전 3800ms 대비 6.6%. 이보다 길면 보드를 보는 시간이 줄어든다. */
export const THROW_MS = 250;

let fx = null;
let toast = null;
/** 진영별(0/1) 던지기 카드 요소. 보너스 연쇄에서 카드를 새로 만들지 않고 재사용한다. */
let throwCard = [null, null];
/** 진영별 던지기 카드 소멸 타이머. 재사용 시 이전 타이머를 취소해야 한다. */
let throwTimer = [null, null];

export function initEffects() {
  fx = document.getElementById("fx");
  toast = document.getElementById("toast");
  fx.innerHTML = "";
  toast.innerHTML = "";
  throwCard = [null, null];
  throwTimer = [null, null];
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
 *
 * 진영당 카드 하나를 재사용한다. 윷/모 보너스 연쇄는 수백 밀리초 안에 여러 번
 * 이어질 수 있는데, 매번 새 카드를 만들면 같은 자리에 겹쳐 쌓여 읽을 수 없다.
 */
function playThrow(ev) {
  const sticks = ev.sticks
    .map((f, i) => `<i class="${f ? "flat" : ""}${i === 0 ? " mark" : ""}"></i>`)
    .join("");
  const owner = ev.owner === 0 ? 0 : 1;
  const className = "fx-throw" + (ev.v === 4 || ev.v === 5 ? " bonus" : "");
  let el = throwCard[owner];
  if (!el || !el.isConnected) {
    el = document.createElement("div");
    el.style.bottom = "12px";
    el.style[owner === 0 ? "left" : "right"] = "12px";
    fx.appendChild(el);
    throwCard[owner] = el;
  }
  // 내용을 새로 심어야 <i>의 flip 애니메이션이 다시 재생된다.
  // 같은 요소에 같은 클래스를 다시 대입해도 CSS 애니메이션은 재시작하지 않는다.
  el.className = className;
  el.innerHTML = `<div class="sticks">${sticks}</div><div class="rname">${ev.name}</div>`;

  clearTimeout(throwTimer[owner]);
  throwTimer[owner] = setTimeout(() => {
    el.remove();
    if (throwCard[owner] === el) throwCard[owner] = null;
  }, THROW_MS + 500);
}

/**
 * 이동 이벤트의 from/to를 좌표로 바꾼다.
 * 노드 0은 판에서 "출발 · 골"이 함께 표시된 한 칸이다. 대기 말이 처음 나올 때는
 * from이 null인데 개념적으로 노드 0에서 출발한 것이고, 골인 이동은 to가 "G"인데
 * 이 역시 노드 0과 같은 칸이다. 그래서 null과 "G"가 둘 다 노드 0으로 풀린다 —
 * 우연이 아니라 같은 칸을 가리키는 두 가지 표기일 뿐이다.
 */
function nodeOf(id) {
  if (id == null || id === "G") return NODE[0];
  return NODE[id];
}

/** 동물이 출발 칸에서 도착 칸으로 달린다. 여러 마리가 겹쳐도 서로 막지 않는다. */
function playRunner(ev) {
  const from = nodeOf(ev.from);
  const to = nodeOf(ev.to);
  if (!from || !to) return;
  const [x0, y0] = from;
  const [x1, y1] = to;
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

/** 이벤트 큐와 무관하게 토스트 한 줄을 띄운다. UI 메시지 통로를 effects.js 하나로 유지하기 위한 창구. */
export function notify(text, tone = "") {
  say(text, tone);
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
