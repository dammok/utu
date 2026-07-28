import { PIECES_PER_PLAYER } from "./board.js";

/**
 * 국면. 전환 기준은 시간이 아니라 진행도다(기획서 4장).
 * 접전이면 저절로 길어지고, 승부가 기울면 빨리 끝난다.
 */
export const PHASES = [
  { name: "도입", chargeMs: 6500, expireMs: null },
  { name: "전개", chargeMs: 5000, expireMs: 15000 },
  { name: "종반", chargeMs: 3800, expireMs: 10000 },
];

export function createGame() {
  return {
    now: 0,
    over: false,
    winner: null,
    phase: 0,
    nextResultId: 1,
    aiNextAt: 0,
    events: [],
    players: [0, 1].map((id) => ({
      id,
      energy: 0,
      bonus: 0,
      results: [],
      pieces: Array.from({ length: PIECES_PER_PLAYER }, (_, i) => ({
        id: i, owner: id, state: "wait", path: 0, idx: 0,
      })),
    })),
  };
}

export function doneCount(state, owner) {
  return state.players[owner].pieces.filter((p) => p.state === "done").length;
}

/**
 * 진행도로 국면을 판정한다. 완주 말은 되돌아가지 않으므로 국면도 역행하지 않는다.
 * @returns {0|1|2}
 */
export function phaseOf(state) {
  const a = doneCount(state, 0);
  const b = doneCount(state, 1);
  if (a + b >= 4 || a >= 3 || b >= 3) return 2;
  if (a + b >= 2) return 1;
  return 0;
}

export function checkWin(state) {
  for (const owner of [0, 1])
    if (doneCount(state, owner) === PIECES_PER_PLAYER) return owner;
  return null;
}

export function emit(state, event) {
  state.events.push(event);
}

/** UI가 소비한 이벤트를 비운다. 코어는 절대 호출하지 않는다. */
export function drainEvents(state) {
  const out = state.events;
  state.events = [];
  return out;
}
