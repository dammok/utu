import { PATHS, GOAL } from "./board.js";

/** 판 위에 있으면 그 노드 id, 아니면 null */
export function nodeAt(piece) {
  return piece.state === "board" ? PATHS[piece.path][piece.idx] : null;
}

/** 골까지 남은 칸 수 */
export function remain(piece) {
  return piece.state === "done" ? 0 : PATHS[piece.path].length - 1 - piece.idx;
}

export function canMove(piece, v) {
  if (piece.state === "done") return false;
  if (piece.state === "wait") return v > 0;  // 대기 말은 백도 사용 불가
  return piece.idx + v >= 0;                 // 출발점 말도 백도 불가
}

/**
 * 이동 결과를 미리 계산만 한다. 상태를 바꾸지 않는다.
 * @returns {{done:boolean, path:number, idx:number, node:number|"G"}|null} 불가능하면 null
 */
export function simulate(piece, v) {
  if (!canMove(piece, v)) return null;

  let path, idx;
  if (piece.state === "wait") { path = 0; idx = v; }
  else { path = piece.path; idx = piece.idx + v; }

  const len = PATHS[path].length;
  if (idx >= len - 1) return { done: true, path, idx: len - 1, node: GOAL };

  const node = PATHS[path][idx];
  // 분기점에 정확히 멈추면 지름길로 전환한다. 인덱스는 경로 간 동일하므로 보존된다.
  let next = path;
  if (node === 5 && path === 0) next = 1;
  else if (node === 10 && path === 0) next = 2;
  else if (node === 23 && path === 1) next = 3;
  return { done: false, path: next, idx, node };
}

/**
 * 실제 이동. 업기와 잡기까지 처리한다.
 * 잡기 보상은 주지 않는다 — 보상 지급은 actions.js의 책임이다.
 * @param {Array<{pieces:Array}>} players 길이 2
 * @returns {{done:boolean, caught:number, stack:number, node:number|"G"}|null}
 */
export function applyMove(players, owner, piece, v) {
  const r = simulate(piece, v);
  if (!r) return null;

  // 업기: 출발 칸에 함께 있던 아군 말은 한 뭉치로 움직인다
  const from = nodeAt(piece);
  const group = [piece];
  if (from !== null) {
    for (const q of players[owner].pieces)
      if (q !== piece && q.state === "board" && nodeAt(q) === from) group.push(q);
  }
  for (const q of group) {
    q.state = r.done ? "done" : "board";
    q.path = r.path;
    q.idx = r.idx;
  }

  // 잡기: 골인 이동에서는 발생하지 않는다
  let caught = 0;
  if (!r.done) {
    for (const q of players[1 - owner].pieces)
      if (q.state === "board" && nodeAt(q) === r.node) {
        q.state = "wait";
        q.path = 0;
        q.idx = 0;
        caught++;
      }
  }
  return { done: r.done, caught, stack: group.length, node: r.node };
}
