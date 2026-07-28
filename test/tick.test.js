import { test } from "node:test";
import assert from "node:assert/strict";
import { tick, MAX_DT_MS } from "../src/core/tick.js";
import { createGame, drainEvents } from "../src/core/game.js";
import { ENERGY_MAX } from "../src/core/board.js";

/** dt를 여러 조각으로 나눠 진행시킨다 (실제 프레임 루프를 흉내낸다) */
const advance = (s, ms, step = 100) => {
  for (let t = 0; t < ms; t += step) tick(s, Math.min(step, ms - t));
};

test("도입 국면에서 6500ms에 에너지 1칸이 찬다", () => {
  const s = createGame();
  advance(s, 6500);
  assert.ok(Math.abs(s.players[0].energy - 1) < 0.01, `energy=${s.players[0].energy}`);
});

test("에너지는 상한 3을 넘지 않는다", () => {
  const s = createGame();
  advance(s, 60_000);
  assert.equal(s.players[0].energy, ENERGY_MAX);
});

test("종반 국면에서는 3800ms에 1칸이 찬다", () => {
  const s = createGame();
  for (let i = 0; i < 3; i++) s.players[0].pieces[i].state = "done"; // 종반 진입
  tick(s, 0);
  assert.equal(s.phase, 2);
  s.players[0].energy = 0;
  advance(s, 3800);
  assert.ok(Math.abs(s.players[0].energy - 1) < 0.01, `energy=${s.players[0].energy}`);
});

test("국면이 바뀌면 phase 이벤트가 나온다", () => {
  const s = createGame();
  tick(s, 16);
  drainEvents(s);
  s.players[0].pieces[0].state = "done";
  s.players[1].pieces[0].state = "done";
  tick(s, 16);
  const ev = drainEvents(s).find((e) => e.type === "phase");
  assert.deepEqual(ev, { type: "phase", from: 0, to: 1 });
});

test("도입 국면에서는 결과가 만료되지 않는다", () => {
  const s = createGame();
  s.players[0].results.push({ id: 1, v: 3, born: 0 });
  advance(s, 30_000);
  assert.equal(s.players[0].results.length, 1);
});

test("전개 국면에서는 15초 지난 결과가 사라진다", () => {
  const s = createGame();
  s.players[0].pieces[0].state = "done";
  s.players[1].pieces[0].state = "done";
  tick(s, 0);
  assert.equal(s.phase, 1);
  s.players[0].results.push({ id: 1, v: 3, born: s.now });
  advance(s, 14_000);
  assert.equal(s.players[0].results.length, 1, "14초에는 아직 남아 있어야 한다");
  advance(s, 2_000);
  assert.equal(s.players[0].results.length, 0);
});

test("만료되면 expire 이벤트가 나온다", () => {
  const s = createGame();
  s.players[0].pieces[0].state = "done";
  s.players[1].pieces[0].state = "done";
  tick(s, 0);
  s.players[0].results.push({ id: 1, v: 5, born: s.now });
  drainEvents(s);
  advance(s, 16_000);
  const ev = drainEvents(s).find((e) => e.type === "expire");
  assert.deepEqual(ev, { type: "expire", owner: 0, v: 5 });
});

test("게임이 끝나면 시간이 흐르지 않는다", () => {
  const s = createGame();
  s.over = true;
  advance(s, 10_000);
  assert.equal(s.players[0].energy, 0);
});

test("한 번에 들어온 큰 dt는 MAX_DT_MS로 잘린다", () => {
  const s = createGame();
  tick(s, 5_000); // 탭을 오래 비활성화한 경우
  assert.equal(s.now, MAX_DT_MS);
});

test("dt가 NaN이면 상태가 영구 오염되지 않는다", () => {
  const s = createGame();
  const initialNow = s.now;
  tick(s, NaN);
  assert.ok(Number.isFinite(s.now), "state.now는 유한한 수여야 한다");
  assert.equal(s.now, initialNow, "NaN dt는 시간을 진행시키지 않아야 한다");
});

test("dt가 NaN인 후에도 에너지 충전이 정상 동작한다", () => {
  const s = createGame();
  s.players[0].energy = 0;
  tick(s, NaN);
  assert.ok(Number.isFinite(s.players[0].energy), "에너지는 유한한 수여야 한다");
  advance(s, 6500);
  assert.ok(Math.abs(s.players[0].energy - 1) < 0.01, `에너지 충전이 정상인지 확인: energy=${s.players[0].energy}`);
});
