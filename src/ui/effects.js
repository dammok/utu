import { YUT } from "../core/yut.js";
import { NODE } from "../core/board.js";
import { PHASES } from "../core/game.js";
import { VIEW } from "./render-board.js";

/** SVG viewBox 좌표(x,y)를 #fx(일반 div, 겹쳐진 오버레이) 위의 %로 바꾼다.
 *  VIEW는 render-board.js 한 곳에서 정의되고 여기서 그대로 참조한다 — 어긋나면
 *  달리는 동물과 잡기 이펙트가 엉뚱한 자리에 뜬다. */
const pctX = (x) => `${(x / VIEW.w) * 100}%`;
const pctY = (y) => `${((y - VIEW.minY) / VIEW.h) * 100}%`;

/** 던지기 모션. 종반 충전 3800ms 대비 6.6%. 이보다 길면 보드를 보는 시간이 줄어든다. */
const THROW_MS = 250;

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

/**
 * 도개걸윷모 다섯 동물 — 먹 실루엣. OS마다 다르게 보이는 이모지(🐖🐕🐑🐄🐎) 대신
 * 굵고 단순한 실루엣으로 그린다. 작게 렌더되므로 세부 대신 크기 차이를 우선한다:
 * 돼지(1) < 개(2) < 양(3) < 소(4) < 말(5) 순으로 실제 픽셀 크기 자체를 키운다 —
 * 도개걸윷모가 원래 가축의 크기·속도 순서를 딴 이름이라, 크기만으로도 "몇 칸"인지
 * 형태를 몰라도 전달된다. 결정적 특징 하나씩만: 돼지=뭉툭한 주둥이+둥근 몸,
 * 개=쫑긋 귀+올린 꼬리, 양=복슬복슬한 등+말린 뿔, 소=뿔+육중한 몸, 말=긴 다리+갈기.
 * 진영색은 코·이마의 작은 반점에만 살짝 섞어 누구 말인지 알게 한다.
 * 백도(-1)는 도(1)와 같은 돼지를 쓴다 — 방향은 이동 방향에 따라 자동으로 뒤집힌다.
 */
const ANIMAL_SVG = {
  1: (t) => `<svg viewBox="0 0 34 20" width="24" height="14">
    <ellipse cx="14" cy="10" rx="11" ry="7" fill="var(--brush)"/>
    <rect x="4" y="15" width="3" height="4.5" rx="1.3" fill="var(--brush)"/>
    <rect x="10" y="15.5" width="3" height="4.5" rx="1.3" fill="var(--brush)"/>
    <rect x="17" y="15.5" width="3" height="4.5" rx="1.3" fill="var(--brush)"/>
    <rect x="22" y="15" width="3" height="4.5" rx="1.3" fill="var(--brush)"/>
    <rect x="23" y="5" width="8" height="7" rx="3.2" fill="var(--brush)"/>
    <ellipse cx="30.5" cy="9" rx="2.4" ry="2" fill="${t}"/>
    <path d="M3,7 q-3,-3.4 -0.6,-6.2" stroke="var(--brush)" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  </svg>`,
  2: (t) => `<svg viewBox="0 0 40 24" width="28" height="17">
    <ellipse cx="17" cy="14" rx="13" ry="6.5" fill="var(--brush)"/>
    <rect x="5" y="19" width="3" height="5" rx="1.3" fill="var(--brush)"/>
    <rect x="12" y="19.5" width="3" height="5" rx="1.3" fill="var(--brush)"/>
    <rect x="20" y="19.5" width="3" height="5" rx="1.3" fill="var(--brush)"/>
    <rect x="27" y="19" width="3" height="5" rx="1.3" fill="var(--brush)"/>
    <circle cx="30" cy="9" r="6" fill="var(--brush)"/>
    <path d="M25,4 L27,-1 L30,5 Z" fill="var(--brush)"/>
    <path d="M33.5,2 q6,-4 5,-9" stroke="var(--brush)" stroke-width="2" fill="none" stroke-linecap="round"/>
    <ellipse cx="33" cy="9.5" rx="2" ry="1.7" fill="${t}"/>
  </svg>`,
  3: (t) => `<svg viewBox="0 0 46 26" width="32" height="18">
    <ellipse cx="19" cy="15" rx="15" ry="7" fill="var(--brush)"/>
    <circle cx="8" cy="7" r="5.4" fill="var(--brush)"/>
    <circle cx="17" cy="4.6" r="5.8" fill="var(--brush)"/>
    <circle cx="27" cy="6" r="5.4" fill="var(--brush)"/>
    <rect x="6" y="20" width="3" height="5" rx="1.3" fill="var(--brush)"/>
    <rect x="14" y="20.5" width="3" height="5" rx="1.3" fill="var(--brush)"/>
    <rect x="23" y="20.5" width="3" height="5" rx="1.3" fill="var(--brush)"/>
    <rect x="31" y="20" width="3" height="5" rx="1.3" fill="var(--brush)"/>
    <circle cx="37" cy="12" r="6" fill="var(--brush)"/>
    <path d="M39,7 q4,-1 3,4" stroke="var(--brush)" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <ellipse cx="39.5" cy="13" rx="2.1" ry="1.7" fill="${t}"/>
  </svg>`,
  4: (t) => `<svg viewBox="0 0 54 30" width="38" height="21">
    <rect x="8" y="8" width="34" height="16" rx="6" fill="var(--brush)"/>
    <rect x="6" y="23" width="4" height="6" rx="1.4" fill="var(--brush)"/>
    <rect x="16" y="23.5" width="4" height="6" rx="1.4" fill="var(--brush)"/>
    <rect x="30" y="23.5" width="4" height="6" rx="1.4" fill="var(--brush)"/>
    <rect x="40" y="23" width="4" height="6" rx="1.4" fill="var(--brush)"/>
    <circle cx="45" cy="12" r="7" fill="var(--brush)"/>
    <path d="M41,6 q-4,-6 1,-8" stroke="var(--brush)" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M49,6 q4,-6 -1,-8" stroke="var(--brush)" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <ellipse cx="47.5" cy="13" rx="2.4" ry="1.9" fill="${t}"/>
  </svg>`,
  5: (t) => `<svg viewBox="0 0 64 40" width="46" height="29">
    <ellipse cx="26" cy="22" rx="18" ry="8" fill="var(--brush)"/>
    <rect x="8" y="29" width="4.4" height="10" rx="1.5" fill="var(--brush)"/>
    <rect x="20" y="30" width="4.4" height="10" rx="1.5" fill="var(--brush)"/>
    <rect x="34" y="30" width="4.4" height="10" rx="1.5" fill="var(--brush)"/>
    <rect x="44" y="29" width="4.4" height="10" rx="1.5" fill="var(--brush)"/>
    <path d="M40,16 C48,10 56,8 60,2 C58,10 52,14 46,18 Z" fill="var(--brush)"/>
    <circle cx="55" cy="10" r="6.5" fill="var(--brush)"/>
    <path d="M42,8 q6,-4 12,-2 M40,12 q7,-3 13,-1" stroke="var(--brush)" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <ellipse cx="58" cy="11" rx="2.2" ry="1.8" fill="${t}"/>
  </svg>`,
};
ANIMAL_SVG["-1"] = ANIMAL_SVG[1];

/** 동물이 출발 칸에서 도착 칸으로 달린다. 여러 마리가 겹쳐도 서로 막지 않는다. */
function playRunner(ev) {
  const from = nodeOf(ev.from);
  const to = nodeOf(ev.to);
  if (!from || !to) return;
  const [x0, y0] = from;
  const [x1, y1] = to;
  const dur = 260 + Math.abs(ev.v) * 40;
  const teamTint = ev.owner === 0 ? "var(--blue)" : "var(--red)";
  const el = spawn(ANIMAL_SVG[ev.v](teamTint), "fx-runner", {
    left: pctX(x0),
    top: pctY(y0),
    transform: `translate(-50%,-50%) scaleX(${x1 >= x0 ? 1 : -1})`,
  }, dur + 120);
  requestAnimationFrame(() => {
    el.style.transition = `left ${dur}ms ease-in-out, top ${dur}ms ease-in-out`;
    el.style.left = pctX(x1);
    el.style.top = pctY(y1);
  });
}

/**
 * 잡기 연출 — 짧고 강하게, 그 칸에서만. 판이 한지·먹이라 재료를 맞춘다:
 * 먹 방울이 방사형으로 튀고, 잡은 쪽 진영색 충격 링이 한 번 확 퍼지고,
 * 아주 짧은 섬광이 겹친다. 전체 300ms, 임팩트는 앞쪽에 몰린다(감속 이징).
 * count(업혀서 함께 잡힌 수)가 많을수록 방울이 늘고 링이 커진다.
 */
function playCapture(ev) {
  if (NODE[ev.node]) {
    const [x, y] = NODE[ev.node];
    const team = ev.owner === 0 ? "b" : "r";
    const extra = Math.min(2, ev.count - 1);
    // 방울이 화면에서 거의 안 보이던 문제 — 개수·크기·궤적 거리를 모두 키웠다.
    // count가 늘수록 방울도 늘고(9~13개) 더 멀리 튄다.
    const dropN = 9 + extra * 2;             // 9~13개
    const distScale = 1 + extra * 0.16;
    const ringEnd = (2.6 + extra * 0.3).toFixed(2);
    let drops = "";
    for (let i = 0; i < dropN; i++) {
      const ang = (360 / dropN) * i + (i % 2 ? 14 : -10); // 정확히 균등하지 않게 — 먹이 튄 느낌
      const dist = (32 + (i % 3) * 11) * distScale;        // 칸 반경 50px 남짓까지 튄다
      const sz = 8 + (i % 3) * 3;                          // 7~14px — 크기를 섞어 튄 느낌
      const rad = (ang * Math.PI) / 180;
      const dx = (Math.cos(rad) * dist).toFixed(1);
      const dy = (Math.sin(rad) * dist).toFixed(1);
      drops += `<span class="fx-drop" style="--dx:${dx}px;--dy:${dy}px;--rot:${ang.toFixed(0)}deg;--sz:${sz}px"></span>`;
    }
    spawn(
      `<div class="fx-flash"></div><div class="fx-ring ${team}" style="--ringend:${ringEnd}"></div>${drops}`,
      "fx-capture", { left: pctX(x), top: pctY(y) }, 300);
  }
  say(ev.owner === 0 ? `${ev.count}말 잡았다! 한 번 더!` : `${ev.count}말 잡혔다`,
    ev.owner === 0 ? "good" : "bad");
}

function playPhase(ev) {
  document.body.dataset.phase = ev.to;
  spawn(
    `<b>${PHASES[ev.to].name}</b><span>${ev.to === 2 ? "속도가 크게 오릅니다" : "속도가 오릅니다"}</span>`,
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
