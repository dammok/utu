import { test } from "node:test";
import assert from "node:assert/strict";
import { throwYut, useResult, canThrow } from "../src/core/actions.js";
import { createGame, drainEvents } from "../src/core/game.js";
import { nodeAt } from "../src/core/move.js";

const fixed = (...values) => { let i = 0; return () => values[i++ % values.length]; };
const ALL_FLAT = fixed(0.1);   // 배 4개 = 윷
const NO_FLAT = fixed(0.9);    // 배 0개 = 모
const TWO_FLAT = fixed(0.1, 0.1, 0.9, 0.9); // 개

/** 결과 하나를 직접 심는다 */
const give = (s, owner, v) => {
  const r = { id: s.nextResultId++, v, born: s.now };
  s.players[owner].results.push(r);
  return r;
};

test("에너지가 없으면 던질 수 없다", () => {
  const s = createGame();
  assert.equal(canThrow(s, 0), false);
  assert.equal(throwYut(s, 0, TWO_FLAT).ok, false);
});

test("에너지 1칸을 소모해 던지고 결과가 쌓인다", () => {
  const s = createGame();
  s.players[0].energy = 1;
  const r = throwYut(s, 0, TWO_FLAT);
  assert.equal(r.ok, true);
  assert.equal(r.v, 2);
  assert.equal(s.players[0].energy, 0);
  assert.equal(s.players[0].results.length, 1);
  assert.equal(s.players[0].results[0].v, 2);
});

test("결과에는 생성 시각이 기록된다", () => {
  const s = createGame();
  s.now = 4321;
  s.players[0].energy = 1;
  throwYut(s, 0, TWO_FLAT);
  assert.equal(s.players[0].results[0].born, 4321);
});

test("윷이 나오면 보너스 던지기가 1회 생긴다", () => {
  const s = createGame();
  s.players[0].energy = 1;
  throwYut(s, 0, ALL_FLAT);
  assert.equal(s.players[0].bonus, 1);
});

test("모가 나와도 보너스는 1회다", () => {
  const s = createGame();
  s.players[0].energy = 1;
  throwYut(s, 0, NO_FLAT);
  assert.equal(s.players[0].bonus, 1);
});

test("보너스는 에너지를 쓰지 않고 먼저 소모된다", () => {
  const s = createGame();
  s.players[0].energy = 0;
  s.players[0].bonus = 1;
  assert.equal(canThrow(s, 0), true);
  throwYut(s, 0, TWO_FLAT);
  assert.equal(s.players[0].bonus, 0);
  assert.equal(s.players[0].energy, 0);
});

test("에너지가 가득 차 있어도 보너스는 증발하지 않는다", () => {
  const s = createGame();
  s.players[0].energy = 3;
  throwYut(s, 0, ALL_FLAT);  // 윷 → 보너스
  assert.equal(s.players[0].bonus, 1, "상한과 무관하게 보너스가 남아야 한다");
});

test("잡으면 에너지가 아니라 보너스 던지기를 받는다", () => {
  const s = createGame();
  const mine = s.players[0].pieces[0];
  Object.assign(mine, { state: "board", path: 0, idx: 4 });
  Object.assign(s.players[1].pieces[0], { state: "board", path: 0, idx: 6 });
  s.players[0].energy = 3;
  const r = give(s, 0, 2);

  const res = useResult(s, 0, r.id, mine.id, nodeAt(mine));
  assert.equal(res.ok, true);
  assert.equal(res.caught, 1);
  assert.equal(s.players[0].bonus, 1);
  assert.equal(s.players[0].energy, 3, "에너지는 건드리지 않는다");
});

test("결과를 쓰면 그 결과만 큐에서 사라진다", () => {
  const s = createGame();
  const mine = s.players[0].pieces[0];
  const a = give(s, 0, 2);
  give(s, 0, 3);
  useResult(s, 0, a.id, mine.id, null);
  assert.deepEqual(s.players[0].results.map((r) => r.v), [3]);
});

test("이동할 수 없는 조합이면 결과가 소모되지 않는다", () => {
  const s = createGame();
  const mine = s.players[0].pieces[0]; // 대기 말
  const r = give(s, 0, -1);            // 백도
  const res = useResult(s, 0, r.id, mine.id, null);
  assert.equal(res.ok, false);
  assert.equal(res.reason, "illegal");
  assert.equal(s.players[0].results.length, 1);
});

test("선착순: 그 사이 잡힌 말로 이동하면 무효이고 칩은 남는다", () => {
  const s = createGame();
  const mine = s.players[0].pieces[0];
  Object.assign(mine, { state: "board", path: 0, idx: 4 });
  const clickedNode = nodeAt(mine);
  const r = give(s, 0, 2);

  // 상대가 먼저 잡아갔다
  Object.assign(mine, { state: "wait", path: 0, idx: 0 });

  const res = useResult(s, 0, r.id, mine.id, clickedNode);
  assert.equal(res.ok, false);
  assert.equal(res.reason, "invalidated");
  assert.equal(s.players[0].results.length, 1, "칩은 소모되지 않아야 한다");
  const ev = drainEvents(s).find((e) => e.type === "invalid");
  assert.equal(ev.owner, 0);
});

test("대기 말 이동은 expectedNode가 null이면 정상 처리된다", () => {
  const s = createGame();
  const mine = s.players[0].pieces[0];
  const r = give(s, 0, 3);
  const res = useResult(s, 0, r.id, mine.id, null);
  assert.equal(res.ok, true);
  assert.equal(mine.state, "board");
  assert.equal(mine.idx, 3);
});

test("말 4개를 모두 골인시키면 게임이 끝나고 win 이벤트가 나온다", () => {
  const s = createGame();
  const me = s.players[0];
  for (let i = 0; i < 3; i++) me.pieces[i].state = "done";
  const last = me.pieces[3];
  Object.assign(last, { state: "board", path: 3, idx: 10 }); // 최단로 끝 직전
  const r = give(s, 0, 5);
  drainEvents(s);

  const res = useResult(s, 0, r.id, last.id, nodeAt(last));
  assert.equal(res.done, true);
  assert.equal(s.over, true);
  assert.equal(s.winner, 0);
  const ev = drainEvents(s).find((e) => e.type === "win");
  assert.equal(ev.owner, 0);
});

test("게임이 끝난 뒤에는 던지지도 움직이지도 못한다", () => {
  const s = createGame();
  s.over = true;
  s.players[0].energy = 3;
  assert.equal(throwYut(s, 0, TWO_FLAT).ok, false);
  const r = give(s, 0, 2);
  assert.equal(useResult(s, 0, r.id, 0, null).ok, false);
});

test("없는 결과 id를 쓰면 조용히 실패한다", () => {
  const s = createGame();
  const res = useResult(s, 0, 999, 0, null);
  assert.equal(res.ok, false);
  assert.equal(res.reason, "gone");
});
