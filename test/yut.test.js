import { test } from "node:test";
import assert from "node:assert/strict";
import { rollYut, YUT } from "../src/core/yut.js";

/** 지정한 값들을 순서대로 뱉는 가짜 난수기 */
const seq = (...values) => {
  let i = 0;
  return () => values[i++];
};

test("배 0개면 모(5)이고 보너스다", () => {
  const r = rollYut(seq(0.9, 0.9, 0.9, 0.9)); // 전부 0.6 이상 = 등
  assert.equal(r.v, 5);
  assert.equal(r.name, "모");
  assert.equal(r.bonus, true);
});

test("배 4개면 윷(4)이고 보너스다", () => {
  const r = rollYut(seq(0.1, 0.1, 0.1, 0.1));
  assert.equal(r.v, 4);
  assert.equal(r.bonus, true);
});

test("표식 가락만 배면 백도(-1)다", () => {
  const r = rollYut(seq(0.1, 0.9, 0.9, 0.9)); // 0번 가락만 배
  assert.equal(r.v, -1);
  assert.equal(r.name, "백도");
  assert.equal(r.bonus, false);
});

test("표식 아닌 가락 하나만 배면 도(1)다", () => {
  const r = rollYut(seq(0.9, 0.1, 0.9, 0.9));
  assert.equal(r.v, 1);
  assert.equal(r.name, "도");
});

test("배 2개는 개, 3개는 걸이다", () => {
  assert.equal(rollYut(seq(0.1, 0.1, 0.9, 0.9)).v, 2);
  assert.equal(rollYut(seq(0.1, 0.1, 0.1, 0.9)).v, 3);
});

test("도개걸윷모에는 동물이 배정되어 있다", () => {
  assert.equal(YUT[1].animal, "돼지");
  assert.equal(YUT[2].animal, "개");
  assert.equal(YUT[3].animal, "양");
  assert.equal(YUT[4].animal, "소");
  assert.equal(YUT[5].animal, "말");
});

test("20만 회 분포가 이론값과 1%p 이내로 맞는다", () => {
  const N = 200_000;
  const count = {};
  for (let i = 0; i < N; i++) {
    const { v } = rollYut();
    count[v] = (count[v] ?? 0) + 1;
  }
  const pct = (v) => (count[v] ?? 0) / N * 100;
  const near = (actual, expected, label) =>
    assert.ok(Math.abs(actual - expected) < 1.0,
      `${label}: ${actual.toFixed(2)}% (기대 ${expected}%)`);

  near(pct(-1), 3.84, "백도");   // 0.6 * 0.4^3
  near(pct(1), 11.52, "도");     // 3 * 0.6 * 0.4^3
  near(pct(2), 34.56, "개");
  near(pct(3), 34.56, "걸");
  near(pct(4), 12.96, "윷");     // 0.6^4
  near(pct(5), 2.56, "모");      // 0.4^4
});
