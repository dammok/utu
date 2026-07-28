import { PATHS } from "../core/board.js";
import { simulate, nodeAt, remain } from "../core/move.js";
import { throwYut, useResult, canThrow } from "../core/actions.js";

/**
 * AI 판단 지연 하한.
 * AI는 이론상 0ms에 반응해 선착순 경합에서 항상 이긴다.
 * 이건 난이도 값이 아니라 공정성 하한이므로 어려움에서도 내리지 않는다.
 */
export const AI_MIN_DELAY_MS = 400;

export const AI_LEVELS = [
  { name: "쉬움", thinkMs: [1100, 2000], noise: 0.60 },
  { name: "보통", thinkMs: [700, 1300], noise: 0.22 },
  { name: "어려움", thinkMs: [AI_MIN_DELAY_MS, 800], noise: 0.00 },
];

const randRange = (rng, a, b) => a + rng() * (b - a);

/** 한 수의 가치. 클수록 좋다. */
function score(state, owner, piece, r) {
  let s = 0;
  if (r.done) {
    s += 95;
  } else {
    // 잡기 — 상대가 많이 전진했을수록 이득이 크다
    for (const q of state.players[1 - owner].pieces)
      if (q.state === "board" && nodeAt(q) === r.node)
        s += 110 + (PATHS[q.path].length - 1 - remain(q)) * 4;
    // 업기
    for (const q of state.players[owner].pieces)
      if (q !== piece && q.state === "board" && nodeAt(q) === r.node) s += 22;
    // 지름길 진입
    if (r.node === 5 || r.node === 10) s += 26;
    if (r.node === 23) s += 34;
    // 골까지 줄어든 거리
    s += remain(piece) - (PATHS[r.path].length - 1 - r.idx);
  }
  if (piece.state === "wait") {
    s += 8;
    // 판이 비면 반드시 출발한다. 아니면 결과만 쌓이고 아무 일도 일어나지 않는다.
    if (state.players[owner].pieces.every((q) => q.state !== "board")) s += 45;
  }
  return s;
}

/**
 * @returns {{score:number, resultId:number, pieceId:number, expectedNode:number|null}|null}
 */
export function bestMove(state, owner, noise, rng = Math.random) {
  const p = state.players[owner];
  let best = null;
  for (const result of p.results) {
    for (const piece of p.pieces) {
      const r = simulate(piece, result.v);
      if (!r) continue;
      const sc = score(state, owner, piece, r) + (noise ? (rng() - 0.5) * 220 * noise : 0);
      if (!best || sc > best.score)
        best = { score: sc, resultId: result.id, pieceId: piece.id, expectedNode: nodeAt(piece) };
    }
  }
  return best;
}

/**
 * AI의 한 프레임. state.now를 기준으로 스스로 지연을 지킨다.
 * 사람과 같은 규칙·같은 충전 속도를 쓰고, 차이는 지연과 노이즈로만 낸다.
 */
export function aiTick(state, owner, level, rng = Math.random) {
  if (state.over || state.now < state.aiNextAt) return;

  const move = bestMove(state, owner, level.noise, rng);
  if (move) {
    useResult(state, owner, move.resultId, move.pieceId, move.expectedNode);
    state.aiNextAt = state.now + randRange(rng, level.thinkMs[0], level.thinkMs[1]);
    return;
  }
  if (canThrow(state, owner)) {
    throwYut(state, owner, rng);
    // 던지는 동작 자체도 사람이라면 시간이 걸린다
    state.aiNextAt = state.now + randRange(rng, AI_MIN_DELAY_MS, AI_MIN_DELAY_MS + 300);
  }
}
