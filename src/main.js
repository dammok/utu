import { createGame, drainEvents } from "./core/game.js";
import { tick } from "./core/tick.js";
import { throwYut, useResult } from "./core/actions.js";
import { nodeAt, simulate } from "./core/move.js";
import { aiTick, AI_LEVELS } from "./ai/ai.js";
import { buildBoard, renderBoard, showGhost, hideGhost } from "./ui/render-board.js";
import { buildPanels, renderPanels, renderEnergy } from "./ui/render-panel.js";
import { initEffects, playEvents } from "./ui/effects.js";
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

const svg = document.getElementById("board");

const markDirty = () => { dirty = true; };

function newGame() {
  state = createGame();
  selection = null;
  lastTs = 0;
  shownOver = false;
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
  const piece = state.players[0].pieces[pieceId];
  // 클릭 시점의 위치를 함께 넘긴다 — 그 사이 잡혔다면 코어가 무효로 판정한다
  useResult(state, 0, selection.resultId, pieceId, nodeAt(piece));
  // 성공이든 무효든 선택은 푼다. 칩을 남길지는 코어가 결정한다.
  selection = null;
  hideGhost();
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
    dirty = false;
  }
  if (state.over && !shownOver) { shownOver = true; finishScreen(); }

  requestAnimationFrame(loop);
}

newGame();
requestAnimationFrame(loop);
