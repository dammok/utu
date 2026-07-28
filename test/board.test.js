import { test } from "node:test";
import assert from "node:assert/strict";
import { NODE, BIG, GOAL, PATHS } from "../src/core/board.js";

test("판은 29칸이다", () => {
  assert.equal(Object.keys(NODE).length, 29);
});

test("큰 칸은 모서리 4개와 중앙 1개다", () => {
  assert.deepEqual([...BIG].sort((a, b) => a - b), [0, 5, 10, 15, 23]);
});

test("모든 경로는 골로 끝난다", () => {
  for (const path of PATHS) assert.equal(path.at(-1), GOAL);
});

test("경로의 모든 칸은 실재하는 노드다", () => {
  for (const path of PATHS)
    for (const n of path.slice(0, -1))
      assert.ok(NODE[n], `노드 ${n} 없음`);
});

test("분기점 인덱스가 경로 간 일치한다", () => {
  // 이 정합성이 깨지면 지름길 진입 시 말이 순간이동한다
  assert.equal(PATHS[0].indexOf(5), PATHS[1].indexOf(5));
  assert.equal(PATHS[0].indexOf(10), PATHS[2].indexOf(10));
  assert.equal(PATHS[1].indexOf(23), PATHS[3].indexOf(23));
});

test("완주 거리는 외곽 20 / 지름길 16 / 최단 11이다", () => {
  assert.equal(PATHS[0].length - 1, 20);
  assert.equal(PATHS[1].length - 1, 16);
  assert.equal(PATHS[2].length - 1, 16);
  assert.equal(PATHS[3].length - 1, 11);
});
