import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, checkWin } from "../src/core/game.js";
import { tick } from "../src/core/tick.js";
import { aiTick, AI_LEVELS } from "../src/ai/ai.js";
import { nodeAt } from "../src/core/move.js";
import { PATHS } from "../src/core/board.js";

const FRAME_MS = 16;
const MAX_FRAMES = 60 * 60 * 15; // 가상 15분

/** 양쪽 다 '보통' AI로 한 판을 끝까지 돌린다 */
function playOne() {
  const s = createGame();
  const nextAt = [0, 0];
  let frames = 0;
  let throws = 0;
  let moves = 0;

  // aiTick은 state.aiNextAt 하나만 쓰므로, 두 진영을 각각 돌리려면
  // 진영별 타이머를 스왑해가며 호출한다.
  while (!s.over && frames < MAX_FRAMES) {
    tick(s, FRAME_MS);
    for (const owner of [0, 1]) {
      const before = s.players[owner].results.length;
      s.aiNextAt = nextAt[owner];
      aiTick(s, owner, AI_LEVELS[1]);
      nextAt[owner] = s.aiNextAt;
      const after = s.players[owner].results.length;
      if (after > before) throws++;
      else if (after < before) moves++;
    }
    frames++;
  }
  return { s, frames, throws, moves, seconds: (frames * FRAME_MS) / 1000 };
}

/** 상태가 규칙을 위반하지 않았는지 검사한다 */
function assertConsistent(s) {
  for (const p of s.players) {
    assert.ok(p.energy >= 0 && p.energy <= 3, `energy 범위 이탈: ${p.energy}`);
    assert.ok(p.bonus >= 0, `bonus 음수: ${p.bonus}`);
    for (const q of p.pieces) {
      assert.ok(["wait", "board", "done"].includes(q.state), `state 이상: ${q.state}`);
      assert.ok(q.idx >= 0 && q.idx < PATHS[q.path].length, `idx 이탈: ${q.idx}`);
      if (q.state === "board") assert.notEqual(nodeAt(q), undefined);
    }
  }
}

test("300게임 자동 대전에서 에러·미종료·무효 상태가 0이다", () => {
  const N = 300;
  const wins = [0, 0];
  let totalThrows = 0, totalMoves = 0, totalSeconds = 0;

  for (let i = 0; i < N; i++) {
    const { s, frames, throws, moves, seconds } = playOne();
    assert.ok(s.over, `게임 ${i}가 끝나지 않았다 (${frames} 프레임)`);
    assert.equal(checkWin(s), s.winner);
    assertConsistent(s);
    wins[s.winner]++;
    totalThrows += throws;
    totalMoves += moves;
    totalSeconds += seconds;
  }

  const rate = wins[0] / N * 100;
  console.log(`승률 ${wins[0]}:${wins[1]} (${rate.toFixed(1)}%) · ` +
    `평균 ${(totalSeconds / N).toFixed(1)}초 · ` +
    `던지기 ${(totalThrows / N / 2).toFixed(1)}회/인 · ` +
    `이동 ${(totalMoves / N / 2).toFixed(1)}회/인`);

  // 동일 AI끼리이므로 승률은 50%에 수렴해야 한다.
  // 300게임 이항분포의 표준편차는 sqrt(300*0.5*0.5)/300 ≈ 2.9%p다.
  // ±5%p는 1.7σ에 불과해 정상 구현도 약 9% 확률로 실패하는 flaky 기준이었다.
  // ±9%p는 3σ 이상이라 정상 구현이 우연히 실패할 확률이 사실상 0에 가깝다.
  assert.ok(Math.abs(rate - 50) <= 9, `승률 편향: ${rate.toFixed(1)}%`);
});

test("국면이 종반까지 도달하는 비율이 설계상 정상 범위다", () => {
  // 완주(골인)는 게임 막바지에만 일어나는 희소 사건이라, 완주 기반 국면
  // 전환 트리거(phaseOf)는 구조적으로 늦게 발화한다. 이는 유지하기로 확정된
  // 설계 결정이다 (src/core/game.js의 phaseOf/전환 조건은 건드리지 않는다).
  //
  // 300게임 실측: 종반 도달 61%, 도입에서만 끝난 게임 19.3%,
  // 전개까지만 도달한 게임 19.7%. 100게임 표본의 표준편차는
  // sqrt(100*0.61*0.39)/100 ≈ 4.9%p이므로, 45% 기준선은 실측 61%에서
  // 3σ 이상 떨어져 있어 정상 구현이 우연히 실패할 확률이 사실상 없다.
  const N = 100;
  let reachedFinal = 0;
  for (let i = 0; i < N; i++) {
    const { s } = playOne();
    if (s.phase === 2) reachedFinal++;
  }
  const rate = (reachedFinal / N) * 100;
  assert.ok(rate >= 45, `종반 도달률 ${rate.toFixed(1)}% (${reachedFinal}/${N})`);
});
