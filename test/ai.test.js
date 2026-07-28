import { test } from "node:test";
import assert from "node:assert/strict";
import { bestMove, aiTick, AI_MIN_DELAY_MS, AI_LEVELS } from "../src/ai/ai.js";
import { createGame } from "../src/core/game.js";
import { nodeAt } from "../src/core/move.js";

const give = (s, owner, v) => {
  const r = { id: s.nextResultId++, v, born: s.now };
  s.players[owner].results.push(r);
  return r;
};

test("AI 판단 지연 하한은 400ms이고 어려움에서도 그 아래로 내려가지 않는다", () => {
  assert.equal(AI_MIN_DELAY_MS, 400);
  for (const lv of AI_LEVELS)
    assert.ok(lv.thinkMs[0] >= AI_MIN_DELAY_MS, `${lv.name}: ${lv.thinkMs[0]}`);
});

test("쓸 결과가 없으면 bestMove는 null이다", () => {
  const s = createGame();
  assert.equal(bestMove(s, 1, 0), null);
});

test("잡을 수 있으면 잡는 수를 고른다", () => {
  const s = createGame();
  const mine = s.players[1].pieces[0];
  const other = s.players[1].pieces[1];
  Object.assign(mine, { state: "board", path: 0, idx: 4 });
  Object.assign(other, { state: "board", path: 0, idx: 12 });
  Object.assign(s.players[0].pieces[0], { state: "board", path: 0, idx: 6 });
  give(s, 1, 2);

  const m = bestMove(s, 1, 0);
  assert.equal(m.pieceId, mine.id, "잡을 수 있는 말을 골라야 한다");
  assert.equal(m.expectedNode, nodeAt(mine));
});

test("골인 가능한 수는 높은 점수를 받는다", () => {
  const s = createGame();
  const mine = s.players[1].pieces[0];
  Object.assign(mine, { state: "board", path: 3, idx: 10 });
  give(s, 1, 3);
  const m = bestMove(s, 1, 0);
  assert.equal(m.pieceId, mine.id);
});

test("판이 비어 있으면 말을 출발시킨다", () => {
  const s = createGame();
  give(s, 1, 3);
  const m = bestMove(s, 1, 0);
  assert.ok(m, "대기 말이라도 내보내야 한다");
  assert.equal(m.expectedNode, null);
});

test("aiTick은 지연 시간 전에는 아무것도 하지 않는다", () => {
  const s = createGame();
  s.players[1].energy = 3;
  s.aiNextAt = 1000;
  s.now = 500;
  aiTick(s, 1, AI_LEVELS[1]);
  assert.equal(s.players[1].results.length, 0);
});

test("aiTick은 쓸 결과가 없으면 던진다", () => {
  const s = createGame();
  s.players[1].energy = 3;
  s.now = 5000;
  s.aiNextAt = 0;
  aiTick(s, 1, AI_LEVELS[1]);
  assert.equal(s.players[1].results.length, 1);
  assert.ok(s.aiNextAt >= s.now + AI_MIN_DELAY_MS, "다음 행동은 최소 지연 이후여야 한다");
});

test("aiTick은 결과가 있으면 말을 움직인다", () => {
  const s = createGame();
  s.now = 5000;
  s.aiNextAt = 0;
  give(s, 1, 3);
  aiTick(s, 1, AI_LEVELS[1]);
  assert.equal(s.players[1].results.length, 0);
  assert.equal(s.players[1].pieces.filter((p) => p.state === "board").length, 1);
});

test("게임이 끝나면 aiTick은 아무것도 하지 않는다", () => {
  const s = createGame();
  s.over = true;
  s.players[1].energy = 3;
  s.now = 9999;
  aiTick(s, 1, AI_LEVELS[1]);
  assert.equal(s.players[1].results.length, 0);
});
