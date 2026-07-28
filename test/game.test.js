import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, phaseOf, doneCount, checkWin, PHASES, emit, drainEvents } from "../src/core/game.js";

/** owner의 말 n개를 골인 상태로 만든다 */
const finish = (s, owner, n) => {
  for (let i = 0; i < n; i++) s.players[owner].pieces[i].state = "done";
};

test("새 게임은 양쪽에 말 4개, 에너지 0으로 시작한다", () => {
  const s = createGame();
  assert.equal(s.players.length, 2);
  for (const p of s.players) {
    assert.equal(p.pieces.length, 4);
    assert.equal(p.energy, 0);
    assert.equal(p.bonus, 0);
    assert.deepEqual(p.results, []);
    assert.ok(p.pieces.every((q) => q.state === "wait"));
  }
  assert.equal(s.phase, 0);
  assert.equal(s.over, false);
});

test("국면 수치는 기획서 값과 일치한다", () => {
  assert.deepEqual(PHASES.map((p) => p.chargeMs), [6500, 5000, 3800]);
  assert.deepEqual(PHASES.map((p) => p.expireMs), [null, 15000, 10000]);
});

test("도입 국면은 완주 0~1말 구간이다", () => {
  const s = createGame();
  assert.equal(phaseOf(s), 0);
  finish(s, 0, 1);
  assert.equal(phaseOf(s), 0);
});

test("양쪽 합쳐 2말 완주면 전개다", () => {
  const s = createGame();
  finish(s, 0, 1);
  finish(s, 1, 1);
  assert.equal(phaseOf(s), 1);
});

test("양쪽 합쳐 4말 완주면 종반이다", () => {
  const s = createGame();
  finish(s, 0, 2);
  finish(s, 1, 2);
  assert.equal(phaseOf(s), 2);
});

test("한쪽이 3말 완주하면 합계가 3이어도 종반이다", () => {
  const s = createGame();
  finish(s, 0, 3);
  assert.equal(doneCount(s, 0), 3);
  assert.equal(phaseOf(s), 2);
});

test("국면은 되돌아가지 않는다 — 잡혀도 완주 말은 줄지 않기 때문", () => {
  const s = createGame();
  finish(s, 0, 2);
  finish(s, 1, 2);
  assert.equal(phaseOf(s), 2);
  // 판 위의 말이 잡혀 대기로 돌아가도 done 상태는 영향받지 않는다
  s.players[0].pieces[3].state = "wait";
  assert.equal(phaseOf(s), 2);
});

test("말 4개를 모두 골인시킨 쪽이 승자다", () => {
  const s = createGame();
  assert.equal(checkWin(s), null);
  finish(s, 1, 4);
  assert.equal(checkWin(s), 1);
});

test("drainEvents는 큐를 비우고 반환한다", () => {
  const s = createGame();
  emit(s, { type: "throw", owner: 0, v: 3 });
  emit(s, { type: "move", owner: 0 });
  const first = drainEvents(s);
  assert.equal(first.length, 2);
  assert.deepEqual(drainEvents(s), []);
});
