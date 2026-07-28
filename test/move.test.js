import { test } from "node:test";
import assert from "node:assert/strict";
import { nodeAt, remain, canMove, simulate, applyMove } from "../src/core/move.js";
import { GOAL, PATHS } from "../src/core/board.js";

const piece = (over = {}) => ({ id: 0, owner: 0, state: "wait", path: 0, idx: 0, ...over });
const twoPlayers = (mine = [], theirs = []) => [{ pieces: mine }, { pieces: theirs }];

test("대기 말은 백도를 쓸 수 없다", () => {
  assert.equal(canMove(piece(), -1), false);
  assert.equal(canMove(piece(), 1), true);
});

test("출발점(idx 0)에 있는 말도 백도를 쓸 수 없다", () => {
  assert.equal(canMove(piece({ state: "board", idx: 0 }), -1), false);
});

test("골인한 말은 움직일 수 없다", () => {
  assert.equal(canMove(piece({ state: "done" }), 3), false);
});

test("대기 말은 외곽 경로의 v번째 칸에서 출발한다", () => {
  const r = simulate(piece(), 3);
  assert.deepEqual({ path: r.path, idx: r.idx, node: r.node }, { path: 0, idx: 3, node: 3 });
});

test("우상 모서리에 정확히 멈추면 지름길 A로 전환된다", () => {
  const r = simulate(piece({ state: "board", path: 0, idx: 3 }), 2); // idx 5 = 노드 5
  assert.equal(r.node, 5);
  assert.equal(r.path, 1);
  assert.equal(r.idx, 5); // 분기점 인덱스는 경로 간 동일하므로 보존된다
});

test("우상 모서리를 지나치면 외곽을 유지한다", () => {
  const r = simulate(piece({ state: "board", path: 0, idx: 3 }), 3); // idx 6
  assert.equal(r.path, 0);
  assert.equal(r.node, 6);
});

test("좌상 모서리에 정확히 멈추면 지름길 B로 전환된다", () => {
  const r = simulate(piece({ state: "board", path: 0, idx: 8 }), 2);
  assert.equal(r.node, 10);
  assert.equal(r.path, 2);
});

test("지름길 A에서 중앙에 정확히 멈추면 최단로로 전환된다", () => {
  const r = simulate(piece({ state: "board", path: 1, idx: 5 }), 3); // idx 8 = 노드 23
  assert.equal(r.node, 23);
  assert.equal(r.path, 3);
});

test("골을 넘어서도 완주로 인정한다", () => {
  const last = PATHS[0].length - 1;
  const r = simulate(piece({ state: "board", path: 0, idx: last - 1 }), 5);
  assert.equal(r.done, true);
  assert.equal(r.node, GOAL);
});

test("같은 칸의 아군 말은 업혀서 함께 이동한다", () => {
  const a = piece({ id: 0, state: "board", path: 0, idx: 4 });
  const b = piece({ id: 1, state: "board", path: 0, idx: 4 });
  const players = twoPlayers([a, b]);
  const res = applyMove(players, 0, a, 2);
  assert.equal(res.stack, 2);
  assert.equal(nodeAt(a), nodeAt(b));
  assert.equal(a.idx, b.idx);
});

test("다른 칸의 아군 말은 업히지 않는다", () => {
  const a = piece({ id: 0, state: "board", path: 0, idx: 4 });
  const b = piece({ id: 1, state: "board", path: 0, idx: 7 });
  applyMove(twoPlayers([a, b]), 0, a, 2);
  assert.equal(b.idx, 7);
});

test("상대 말을 잡으면 대기로 돌려보낸다", () => {
  const mine = piece({ id: 0, state: "board", path: 0, idx: 4 });
  const theirs = piece({ id: 0, owner: 1, state: "board", path: 0, idx: 6 });
  const res = applyMove(twoPlayers([mine], [theirs]), 0, mine, 2);
  assert.equal(res.caught, 1);
  assert.equal(theirs.state, "wait");
  assert.equal(theirs.idx, 0);
  assert.equal(theirs.path, 0);
});

test("업힌 상대 말은 한꺼번에 잡힌다", () => {
  const mine = piece({ id: 0, state: "board", path: 0, idx: 4 });
  const t1 = piece({ id: 0, owner: 1, state: "board", path: 0, idx: 6 });
  const t2 = piece({ id: 1, owner: 1, state: "board", path: 0, idx: 6 });
  const res = applyMove(twoPlayers([mine], [t1, t2]), 0, mine, 2);
  assert.equal(res.caught, 2);
});

test("다른 경로라도 같은 노드에 있으면 잡는다", () => {
  // 지름길 A의 중앙(노드 23)과 지름길 B의 중앙은 같은 칸이다
  const mine = piece({ id: 0, state: "board", path: 1, idx: 6 });   // 노드 22
  const theirs = piece({ id: 0, owner: 1, state: "board", path: 2, idx: 13 }); // 노드 23
  const res = applyMove(twoPlayers([mine], [theirs]), 0, mine, 2);
  assert.equal(res.caught, 1);
});

test("골인 이동에서는 잡기가 발생하지 않는다", () => {
  const last = PATHS[0].length - 1;
  const mine = piece({ id: 0, state: "board", path: 0, idx: last - 1 });
  const theirs = piece({ id: 0, owner: 1, state: "board", path: 0, idx: 0 });
  const res = applyMove(twoPlayers([mine], [theirs]), 0, mine, 3);
  assert.equal(res.done, true);
  assert.equal(res.caught, 0);
  assert.equal(theirs.state, "board");
});

test("remain은 골까지 남은 칸을 센다", () => {
  assert.equal(remain(piece({ state: "board", path: 0, idx: 0 })), 20);
  assert.equal(remain(piece({ state: "done" })), 0);
});

test("판 위가 아닌 말의 nodeAt은 null이다", () => {
  assert.equal(nodeAt(piece()), null);
  assert.equal(nodeAt(piece({ state: "done" })), null);
});
