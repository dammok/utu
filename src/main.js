import { createGame, drainEvents } from "./core/game.js";
import { tick } from "./core/tick.js";
import { throwYut, useResult } from "./core/actions.js";
import { nodeAt, simulate } from "./core/move.js";
import { aiTick, AI_LEVELS } from "./ai/ai.js";
import { buildBoard, renderBoard, showGhost, hideGhost } from "./ui/render-board.js";
import { buildPanels, renderPanels, renderEnergy } from "./ui/render-panel.js";
import { initEffects, playEvents, notify } from "./ui/effects.js";
import { bindInput } from "./ui/input.js";

let state = null;
let selection = null;   // { resultId, v } | null
let level = 1;
let dirty = true;       // 이번 프레임에 패널을 다시 그려야 하는가
let lastTs = 0;
// 결과 화면을 이미 띄웠는가. state.over는 클릭 핸들러(clickPiece)처럼
// loop() 바깥에서도 true로 바뀔 수 있어, 프레임 시작 시점의 스냅샷(wasOver)만으로는
// "방금 끝남"을 놓친다 — 청군이 마지막 말을 클릭해 골인시키는 순간이 그 경우다.
// 이 플래그는 프레임 경계와 무관하게 전환을 안정적으로 잡아낸다.
let shownOver = false;
// 청군(내 말) 위치 스냅샷: pieceId -> 화면에 마지막으로 그려진 노드(nodeAt 값).
// renderBoard가 호출될 때마다 갱신된다 — 렌더는 dirty인 프레임에만 일어나므로
// 이 값은 항상 정확히 "지금 화면에 보이는 상태"다.
let blueSnapshot = {};

const svg = document.getElementById("board");

const markDirty = () => { dirty = true; };

function newGame() {
  state = createGame();
  selection = null;
  lastTs = 0;
  shownOver = false;
  blueSnapshot = {};
  document.body.dataset.phase = "0";
  document.getElementById("over").classList.remove("on");
  initEffects();
  buildBoard(svg, state, {
    onPieceClick: (owner, pieceId) => { if (owner === 0) clickPiece(pieceId); },
    onPieceHover: (owner, pieceId) => {
      if (owner !== 0 || selection === null) return;
      const r = simulate(state.players[0].pieces[pieceId], selection.v);
      if (r && !r.done) showGhost(r.node);
      else hideGhost();
    },
    onPieceLeave: hideGhost,
  });
  buildPanels(state);
  markDirty();
}

function clickPiece(pieceId) {
  if (selection === null || state.over) return;
  // expectedNode는 "클릭한 순간의 실제 위치"가 아니라 "플레이어가 화면에서 본 위치"여야
  // 한다. JS는 단일 스레드라 nodeAt(piece)를 클릭 직후 여기서 다시 읽으면 그 사이에
  // 아무도 끼어들 수 없으므로 현재 위치와 항상 같아져 버려 — 무효화 판정
  // (nodeAt(piece) !== expectedNode)이 구조적으로 절대 참이 될 수 없다. 한 프레임 낡은
  // 값처럼 보이지만 의도한 것이다: blueSnapshot은 renderBoard가 마지막으로 그린,
  // 즉 플레이어가 실제로 보고 클릭을 결정한 그 위치를 담는다. 그 사이 AI가 이 말을
  // 잡았다면 스냅샷과 지금의 실제 위치가 어긋나고, 코어가 의도대로 무효 처리한다.
  const expectedNode = blueSnapshot[pieceId] ?? null;
  const r = useResult(state, 0, selection.resultId, pieceId, expectedNode);
  if (r.ok || r.reason === "invalidated") {
    // 성공이든 무효든 선택은 푼다. 칩을 남길지는 코어가 결정한다.
    selection = null;
    hideGhost();
  } else if (r.reason === "illegal") {
    // 칩이 소모되지 않았으니 선택은 유지한다 — 플레이어가 다른 말을 바로 클릭할 수 있게.
    notify("그 말은 이 수로 움직일 수 없습니다", "bad");
  }
  markDirty();
}

function finishScreen() {
  const t = document.getElementById("overTitle");
  t.textContent = state.winner === 0 ? "청군 승리!" : "홍군 승리";
  t.style.color = state.winner === 0 ? "var(--blue)" : "var(--red)";
  document.getElementById("overSub").textContent = state.winner === 0
    ? "말 4개를 모두 골인시켰습니다"
    : "AI가 먼저 말 4개를 완주시켰습니다";
  document.getElementById("over").classList.add("on");
}

const panelHandlers = {
  onChipClick: (resultId, v) => {
    selection = resultId === null ? null : { resultId, v };
    hideGhost();
    markDirty();
  },
  onWaitPieceClick: (pieceId) => clickPiece(pieceId),
};

bindInput({
  onThrow: () => { if (throwYut(state, 0).ok) markDirty(); },
  onPiece: (pieceId) => clickPiece(pieceId),
  onCancel: () => { selection = null; hideGhost(); markDirty(); },
  onRestart: newGame,
  onDifficulty: (d) => { level = d; newGame(); },
});

function loop(ts) {
  const dt = lastTs ? ts - lastTs : 0;
  lastTs = ts;

  tick(state, dt);
  aiTick(state, 1, AI_LEVELS[level]);

  const events = drainEvents(state);
  if (events.length) { playEvents(events); markDirty(); }

  // 고른 칩이 만료되어 사라졌으면 선택을 푼다
  if (selection !== null
      && !state.players[0].results.some((r) => r.id === selection.resultId)) {
    selection = null;
    hideGhost();
    markDirty();
  }

  renderEnergy(state);
  if (dirty) {
    renderBoard(state, selection);
    renderPanels(state, selection, panelHandlers);
    // 방금 그린 화면을 스냅샷으로 남긴다 — clickPiece가 "화면에서 본 위치"를
    // 읽을 수 있는 유일한 출처. 상대 말은 클릭 대상이 아니므로 청군만 기록한다.
    for (const p of state.players[0].pieces) blueSnapshot[p.id] = nodeAt(p);
    dirty = false;
  }
  if (state.over && !shownOver) { shownOver = true; finishScreen(); }

  requestAnimationFrame(loop);
}

newGame();
requestAnimationFrame(loop);
