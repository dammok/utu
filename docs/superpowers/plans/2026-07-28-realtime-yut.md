# 실시간 윷놀이 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기획서 `docs/superpowers/specs/2026-07-26-realtime-yut-design.md`를 구현해, 에너지가 차는 대로 윷을 던지고 진행도에 따라 가속되는 1인용 실시간 윷놀이를 브라우저에서 동작시킨다.

**Architecture:** 게임 규칙·상태는 DOM을 전혀 모르는 순수 ES 모듈(`src/core`, `src/ai`)로 두고, UI(`src/ui`)는 상태를 읽어 그리기만 한다. 상태 변경은 이벤트 큐에 기록되고 UI가 그것을 뒤늦게 소비하므로, 기획서 7장의 관통 원칙 — **"상태는 입력 순간 즉시 확정되고, 애니메이션은 결과의 사후 표현일 뿐"** — 이 구조로 강제된다. 순수 계층은 `node --test`로 검증하고, UI 계층은 브라우저 수동 검증 체크리스트로 검증한다.

**Tech Stack:** 바닐라 ES 모듈 + SVG + CSS. 빌드 도구 없음. 테스트는 Node 내장 `node --test` (Node v24.18.0 확인됨). 의존성 0개.

## 파일 구조 결정 — 단일 HTML에서 모듈로

프로토타입은 단일 HTML 846줄이었다. 이번엔 나눈다:

- 기획서 11장이 **"게임 상태 갱신과 렌더링을 분리"**를 성능 예산으로 요구한다. 한 파일에서는 이 분리가 규율로만 존재하고 강제되지 않는다.
- 기획서 12장의 검증 표(확률 20만 회, 300게임 자동 대전, 규칙 단위 검사)는 규칙 코드를 DOM 없이 import할 수 있어야 성립한다. 단일 HTML이면 매번 임시 스크립트로 코드를 복사해야 한다.
- 기획서가 요구한 것은 "단일 **페이지**"(2장)이지 단일 파일이 아니다. ES 모듈은 정적 호스팅에서 빌드 없이 그대로 동작하므로 배포 난이도는 같다.

배포 시 한 파일로 합치고 싶으면 나중에 인라인 스크립트로 병합할 수 있다. 그 작업은 이 계획의 범위 밖이다.

```
index.html                  마크업 + 모듈 진입점
package.json                {"type":"module"} — 테스트 실행용, 의존성 없음
styles/game.css             전체 스타일
src/
  core/
    board.js                노드 좌표·경로 4종·상수 (DOM 없음)
    yut.js                  윷 확률과 결과 테이블 (DOM 없음)
    move.js                 이동·업기·잡기 규칙 (DOM 없음)
    game.js                 상태 생성·국면 판정·승리 판정 (DOM 없음)
    tick.js                 에너지 충전 + 결과 만료 (DOM 없음)
    actions.js              던지기·결과 사용 진입점 (DOM 없음)
  ai/
    ai.js                   수 평가와 판단 지연 (DOM 없음)
  ui/
    render-board.js         SVG 판·말 렌더
    render-panel.js         에너지·칩·대기말 패널 렌더
    effects.js              논블로킹 연출 (던지기·동물·국면·무효화)
    input.js                클릭·터치·키보드
  main.js                   루프 조립
test/
  board.test.js  yut.test.js  move.test.js
  game.test.js   tick.test.js  actions.test.js
  ai.test.js     simulation.test.js
```

## Global Constraints

기획서에서 그대로 옮긴 프로젝트 전역 요구사항. 모든 태스크의 요구사항에 암묵적으로 포함된다.

- **에너지 상한 3칸.** 보너스 던지기는 상한을 무시한다.
- **국면별 충전/만료** — 도입 `6500ms` / 만료 없음, 전개 `5000ms` / `15000ms`, 종반 `3800ms` / `10000ms`.
- **국면 전환은 시간이 아니라 진행도** — 전개: 양쪽 합쳐 2말 완주. 종반: 양쪽 합쳐 4말 완주 **또는** 어느 한쪽 3말 완주.
- **보너스는 한 종류뿐** — 윷·모도, 잡기도 "상한 무시 즉시 던지기 1회". 잡기의 `energy +1` 보상은 폐기한다.
- **던지기 모션 250ms, 전체화면 오버레이 금지.** 보드는 항상 보인다.
- **연출은 게임 진행을 막지 않는다.** 상태는 입력 순간 확정되고, 애니메이션은 사후 표현이다.
- **AI 판단 지연 하한 400ms.** 난이도 값이 아니라 공정성 하한이므로 어떤 난이도에서도 내리지 않는다.
- **선착순 판정.** 무효화된 이동은 결과 칩을 소모하지 않고, 반드시 명시적으로 알린다.
- **터치 타깃 44px 이상.** 세로 화면 우선, 조작부는 하단 엄지 도달 범위.
- **`src/core`와 `src/ai`는 DOM API를 참조하지 않는다.** `document`, `window`, `performance`가 등장하면 안 된다. 시간은 인자로 주입한다.
- **의존성 0개.** `package.json`의 `dependencies`/`devDependencies`는 비어 있어야 한다.
- **진영 이름** — 청군(호랑이) / 홍군(곰). 말 4개.

---

### Task 1: 프로젝트 골격과 판 정의

**Files:**
- Create: `package.json`
- Create: `src/core/board.js`
- Test: `test/board.test.js`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `NODE: Record<number, [number, number]>` — 노드 id → SVG 좌표
  - `BIG: Set<number>` — 모서리+중앙 노드 id
  - `GOAL: "G"`
  - `PATHS: Array<Array<number|"G">>` — 경로 4종
  - `P_START, P_TR, P_TL, P_BL, P_MID: [number, number]`
  - `PIECES_PER_PLAYER: 4`, `ENERGY_MAX: 3`

- [ ] **Step 1: package.json 작성**

```json
{
  "name": "realtime-yut",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test test/"
  }
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`test/board.test.js`:

```js
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
```

- [ ] **Step 3: 테스트 실행해 실패 확인**

```bash
node --test test/board.test.js
```

기대: `Cannot find module '.../src/core/board.js'` 로 전부 실패.

- [ ] **Step 4: board.js 구현**

프로토타입 `index.html:267-306`의 판 정의를 그대로 옮긴다. 검증된 코드이므로 좌표 계산을 새로 만들지 않는다.

`src/core/board.js`:

```js
/**
 * 윷판 정의. 6x6 격자 기준.
 * 외곽 20칸 + 지름길 8칸 + 중앙 1칸 = 29칸.
 * DOM에 의존하지 않는다 — 좌표는 SVG viewBox 600x600 기준의 순수 숫자다.
 */
export const M = 62;
export const STEP = (600 - M * 2) / 5;

const g = (c, r) => [M + c * STEP, M + r * STEP];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export const P_START = g(5, 5);
export const P_TR = g(5, 0);
export const P_TL = g(0, 0);
export const P_BL = g(0, 5);
export const P_MID = lerp(P_TL, P_START, 0.5);

export const NODE = {};
// 외곽: 0=출발(우하) → 우변 위로 → 5=우상 → 상변 좌로 → 10=좌상 → 좌변 아래로 → 15=좌하 → 하변 우로 → 19
NODE[0] = P_START;
for (let i = 1; i <= 4; i++) NODE[i] = g(5, 5 - i);
NODE[5] = P_TR;
for (let i = 1; i <= 4; i++) NODE[5 + i] = g(5 - i, 0);
NODE[10] = P_TL;
for (let i = 1; i <= 4; i++) NODE[10 + i] = g(0, i);
NODE[15] = P_BL;
for (let i = 1; i <= 4; i++) NODE[15 + i] = g(i, 5);
// 지름길 A: 5(우상) → 21,22 → 23(중앙) → 24,25 → 15(좌하)
NODE[21] = lerp(P_TR, P_MID, 1 / 3);
NODE[22] = lerp(P_TR, P_MID, 2 / 3);
NODE[23] = P_MID;
NODE[24] = lerp(P_MID, P_BL, 1 / 3);
NODE[25] = lerp(P_MID, P_BL, 2 / 3);
// 지름길 B: 10(좌상) → 26,27 → 23(중앙) → 28,29 → 0(골)
NODE[26] = lerp(P_TL, P_MID, 1 / 3);
NODE[27] = lerp(P_TL, P_MID, 2 / 3);
NODE[28] = lerp(P_MID, P_START, 1 / 3);
NODE[29] = lerp(P_MID, P_START, 2 / 3);

/** 모서리 + 중앙 = 크게 그리는 칸 */
export const BIG = new Set([0, 5, 10, 15, 23]);
export const GOAL = "G";

/**
 * 경로 4종. 분기점(5, 10, 23)의 인덱스가 경로 간 동일하도록 배열을 설계해
 * 경로 전환 시 인덱스를 그대로 유지할 수 있다. test/board.test.js가 이 불변식을 지킨다.
 */
export const PATHS = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, GOAL], // 0: 외곽 완주
  [0, 1, 2, 3, 4, 5, 21, 22, 23, 24, 25, 15, 16, 17, 18, 19, GOAL],             // 1: 우상 지름길
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 26, 27, 23, 28, 29, GOAL],                 // 2: 좌상 지름길
  [0, 1, 2, 3, 4, 5, 21, 22, 23, 28, 29, GOAL],                                 // 3: 지름길 중 중앙 정지
];

export const PIECES_PER_PLAYER = 4;
export const ENERGY_MAX = 3;
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
node --test test/board.test.js
```

기대: `# pass 6`, `# fail 0`.

- [ ] **Step 6: 커밋**

```bash
git add package.json src/core/board.js test/board.test.js
git commit -m "feat(core): 윷판 정의 모듈과 판 구조 검증"
```

---

### Task 2: 윷 확률

**Files:**
- Create: `src/core/yut.js`
- Test: `test/yut.test.js`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `YUT: Record<number, { name: string, animal: string, glyph: string }>` — 키는 `-1,1,2,3,4,5`
  - `rollYut(rng?: () => number): { v: number, name: string, sticks: boolean[], bonus: boolean }` — `rng` 기본값 `Math.random`, 테스트에서 주입한다
  - `FLAT_P: 0.6`

- [ ] **Step 1: 실패하는 테스트 작성**

`test/yut.test.js`:

```js
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
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

```bash
node --test test/yut.test.js
```

기대: 모듈 없음으로 전부 실패.

- [ ] **Step 3: yut.js 구현**

```js
/**
 * 윷가락 4개. 배(평평한 면)가 나올 확률 0.6. 0번 가락에 백도 표식.
 * 도개걸윷모는 가축의 크기·속도 순서를 딴 이름이므로 동물을 함께 들고 다닌다.
 */
export const FLAT_P = 0.6;

export const YUT = {
  "-1": { name: "백도", animal: "돼지", glyph: "🐖" },
  1: { name: "도", animal: "돼지", glyph: "🐖" },
  2: { name: "개", animal: "개", glyph: "🐕" },
  3: { name: "걸", animal: "양", glyph: "🐑" },
  4: { name: "윷", animal: "소", glyph: "🐄" },
  5: { name: "모", animal: "말", glyph: "🐎" },
};

/**
 * @param {() => number} rng 0 이상 1 미만 난수기. 테스트에서 주입한다.
 * @returns {{ v:number, name:string, sticks:boolean[], bonus:boolean }} sticks[i]가 true면 배
 */
export function rollYut(rng = Math.random) {
  const sticks = [0, 1, 2, 3].map(() => rng() < FLAT_P);
  const flat = sticks.filter(Boolean).length;
  let v;
  if (flat === 0) v = 5;                     // 모
  else if (flat === 1 && sticks[0]) v = -1;  // 백도 (표식 가락만 배)
  else if (flat === 1) v = 1;                // 도
  else v = flat;                             // 개 / 걸 / 윷
  return { v, name: YUT[v].name, sticks, bonus: v === 4 || v === 5 };
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
node --test test/yut.test.js
```

기대: `# pass 7`, `# fail 0`. 20만 회 테스트는 1초 안에 끝난다.

- [ ] **Step 5: 커밋**

```bash
git add src/core/yut.js test/yut.test.js
git commit -m "feat(core): 윷 확률 모듈과 20만 회 분포 검증"
```

---

### Task 3: 이동 규칙

**Files:**
- Create: `src/core/move.js`
- Test: `test/move.test.js`

**Interfaces:**
- Consumes: `board.js`의 `PATHS`, `GOAL`
- Produces:
  - `nodeAt(piece): number|null` — 판 위가 아니면 `null`
  - `remain(piece): number` — 골까지 남은 칸
  - `canMove(piece, v): boolean`
  - `simulate(piece, v): { done:boolean, path:number, idx:number, node:number|"G" } | null` — 상태를 바꾸지 않는다
  - `applyMove(players, owner, piece, v): { done:boolean, caught:number, stack:number, node:number|"G" } | null` — `players`는 `[{pieces}, {pieces}]` 형태의 배열. 잡기 보상(보너스)은 여기서 주지 않고 호출자가 처리한다.

말(piece)의 형태: `{ id:number, owner:0|1, state:"wait"|"board"|"done", path:number, idx:number }`

- [ ] **Step 1: 실패하는 테스트 작성**

`test/move.test.js`:

```js
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
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

```bash
node --test test/move.test.js
```

기대: 모듈 없음으로 전부 실패.

- [ ] **Step 3: move.js 구현**

프로토타입 `index.html:361-416`을 옮기되 두 가지를 바꾼다. (1) 전역 `S` 대신 `players`를 인자로 받아 순수 함수로 만든다. (2) 잡기 시 `energy + 1` 보상을 제거한다 — 보상 통일은 Task 6이 담당한다.

```js
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
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
node --test test/move.test.js
```

기대: `# pass 17`, `# fail 0`.

- [ ] **Step 5: 커밋**

```bash
git add src/core/move.js test/move.test.js
git commit -m "feat(core): 이동·업기·잡기 규칙을 순수 함수로 분리"
```

---

### Task 4: 게임 상태와 국면

**Files:**
- Create: `src/core/game.js`
- Test: `test/game.test.js`

**Interfaces:**
- Consumes: `board.js`의 `PIECES_PER_PLAYER`
- Produces:
  - `PHASES: Array<{ name:string, chargeMs:number, expireMs:number|null }>` — 길이 3
  - `createGame(): State`
  - `phaseOf(state): 0|1|2`
  - `doneCount(state, owner): number`
  - `checkWin(state): 0|1|null`
  - `emit(state, event): void` — `state.events`에 push
  - `drainEvents(state): Array<Event>` — 큐를 비우고 반환한다. UI만 호출한다.

State 스키마 (이후 모든 태스크가 이 형태를 가정한다):

```js
{
  now: 0,              // 누적 밀리초. 실시간 시계가 아니라 주입된 값이다
  over: false,
  winner: null,        // 0 | 1 | null
  phase: 0,            // 0=도입 1=전개 2=종반
  nextResultId: 1,
  aiNextAt: 0,
  events: [],
  players: [
    {
      id: 0,
      energy: 0,       // 0 이상 ENERGY_MAX 이하의 실수
      bonus: 0,        // 상한 무시 던지기 잔여 횟수
      results: [],     // [{ id:number, v:number, born:number }]
      pieces: [{ id, owner, state:"wait", path:0, idx:0 }, ...4개]
    },
    { id: 1, ... }
  ]
}
```

Event 형태: `{ type, ... }`. 타입은 `"throw" | "move" | "capture" | "goal" | "bonus" | "expire" | "phase" | "invalid" | "win"`.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/game.test.js`:

```js
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
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

```bash
node --test test/game.test.js
```

기대: 모듈 없음으로 전부 실패.

- [ ] **Step 3: game.js 구현**

```js
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
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
node --test test/game.test.js
```

기대: `# pass 9`, `# fail 0`.

- [ ] **Step 5: 커밋**

```bash
git add src/core/game.js test/game.test.js
git commit -m "feat(core): 게임 상태와 진행도 기반 국면 판정"
```

---

### Task 5: 에너지 충전과 결과 만료

**Files:**
- Create: `src/core/tick.js`
- Test: `test/tick.test.js`

**Interfaces:**
- Consumes: `game.js`의 `PHASES`, `phaseOf`, `emit`; `board.js`의 `ENERGY_MAX`
- Produces:
  - `tick(state, dtMs): void` — 시간을 진행시킨다. 충전·만료·국면 전환을 모두 처리하고 이벤트를 emit 한다.
  - `MAX_DT_MS: 120` — 탭 전환 후 복귀 시 시간이 한꺼번에 밀려오는 것을 막는다

`tick`이 emit 하는 이벤트:
- `{ type:"expire", owner, v }` — 결과 하나가 만료될 때마다
- `{ type:"phase", from, to }` — 국면이 바뀔 때

- [ ] **Step 1: 실패하는 테스트 작성**

`test/tick.test.js`:

```js
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
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

```bash
node --test test/tick.test.js
```

기대: 모듈 없음으로 전부 실패.

- [ ] **Step 3: tick.js 구현**

```js
import { ENERGY_MAX } from "./board.js";
import { PHASES, phaseOf, emit } from "./game.js";

/**
 * 한 프레임에 반영할 최대 시간.
 * 탭을 비활성화했다 돌아오면 dt가 수 초로 튀는데, 그대로 반영하면
 * 돌아오는 순간 에너지가 가득 차고 결과가 몰살당한다.
 */
export const MAX_DT_MS = 120;

/**
 * 시간을 진행시킨다. 게임 루프에서 매 프레임 한 번 호출한다.
 * DOM도 실시간 시계도 참조하지 않는다 — dt는 호출자가 준다.
 */
export function tick(state, dtMs) {
  if (state.over) return;

  const dt = Math.max(0, Math.min(MAX_DT_MS, dtMs));
  state.now += dt;

  // 국면 판정을 먼저 한다. 이번 프레임의 충전·만료가 새 국면 값을 따르도록.
  const next = phaseOf(state);
  if (next !== state.phase) {
    emit(state, { type: "phase", from: state.phase, to: next });
    state.phase = next;
  }
  const { chargeMs, expireMs } = PHASES[state.phase];

  for (const p of state.players) {
    if (p.energy < ENERGY_MAX)
      p.energy = Math.min(ENERGY_MAX, p.energy + dt / chargeMs);

    if (expireMs !== null) {
      // 뒤에서부터 지워야 splice가 인덱스를 흔들지 않는다
      for (let i = p.results.length - 1; i >= 0; i--) {
        if (state.now - p.results[i].born >= expireMs) {
          emit(state, { type: "expire", owner: p.id, v: p.results[i].v });
          p.results.splice(i, 1);
        }
      }
    }
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
node --test test/tick.test.js
```

기대: `# pass 9`, `# fail 0`.

- [ ] **Step 5: 커밋**

```bash
git add src/core/tick.js test/tick.test.js
git commit -m "feat(core): 국면별 에너지 충전과 결과 만료"
```

---

### Task 6: 액션 — 던지기와 결과 사용

**Files:**
- Create: `src/core/actions.js`
- Test: `test/actions.test.js`

**Interfaces:**
- Consumes: `move.js`의 `applyMove`, `canMove`, `nodeAt`; `yut.js`의 `rollYut`, `YUT`; `game.js`의 `emit`, `checkWin`
- Produces:
  - `throwYut(state, owner, rng?): { ok:boolean, reason?:string, v?:number }`
  - `useResult(state, owner, resultId, pieceId, expectedNode): { ok:boolean, reason?:string, caught?:number, done?:boolean }`
  - `canThrow(state, owner): boolean`

핵심 규칙 두 가지를 여기서 강제한다.

1. **보너스 통일.** 윷·모도, 잡기도 `player.bonus += 1`. 보너스는 상한을 무시하므로 에너지가 꽉 차 있어도 증발하지 않는다.
2. **선착순 무효화.** `useResult`는 `expectedNode`(플레이어가 클릭한 시점에 그 말이 있던 칸)를 받는다. 실제 위치가 다르면 — 그 사이 잡혀서 대기로 돌아갔다면 — **결과를 소모하지 않고** `{ ok:false, reason:"invalidated" }`를 돌려주고 `invalid` 이벤트를 emit 한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/actions.test.js`:

```js
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
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

```bash
node --test test/actions.test.js
```

기대: 모듈 없음으로 전부 실패.

- [ ] **Step 3: actions.js 구현**

```js
import { rollYut, YUT } from "./yut.js";
import { applyMove, canMove, nodeAt } from "./move.js";
import { emit, checkWin } from "./game.js";

export function canThrow(state, owner) {
  if (state.over) return false;
  const p = state.players[owner];
  return p.bonus > 0 || p.energy >= 1;
}

/**
 * 윷을 던진다. 결과는 즉시 확정되어 큐에 들어간다 —
 * 연출이 끝나기를 기다리지 않는다(기획서 8장 논블로킹).
 */
export function throwYut(state, owner, rng = Math.random) {
  if (!canThrow(state, owner)) return { ok: false, reason: "no-energy" };
  const p = state.players[owner];

  // 보너스를 먼저 쓴다. 에너지는 아껴둘수록 이득이므로.
  if (p.bonus > 0) p.bonus -= 1;
  else p.energy -= 1;

  const r = rollYut(rng);
  p.results.push({ id: state.nextResultId++, v: r.v, born: state.now });
  emit(state, { type: "throw", owner, v: r.v, name: r.name, sticks: r.sticks });

  if (r.bonus) {
    p.bonus += 1;
    emit(state, { type: "bonus", owner, cause: r.name });
  }
  return { ok: true, v: r.v };
}

/**
 * 결과 하나를 말 하나에 쓴다.
 *
 * expectedNode는 플레이어가 그 말을 선택한 시점의 위치다.
 * 그 사이 상대가 먼저 잡아 위치가 달라졌다면 이동은 무효다(선착순).
 * 이때 결과는 소모하지 않는다 — 자원이 아무것도 못 하고 사라지면 억울함만 남는다.
 *
 * @param {number|null} expectedNode 판 위 말이면 노드 id, 대기 말이면 null
 */
export function useResult(state, owner, resultId, pieceId, expectedNode) {
  if (state.over) return { ok: false, reason: "over" };

  const p = state.players[owner];
  const ri = p.results.findIndex((r) => r.id === resultId);
  if (ri === -1) return { ok: false, reason: "gone" };

  const piece = p.pieces[pieceId];
  if (!piece) return { ok: false, reason: "gone" };

  if (nodeAt(piece) !== expectedNode) {
    emit(state, { type: "invalid", owner, pieceId, reason: "invalidated" });
    return { ok: false, reason: "invalidated" };
  }

  const v = p.results[ri].v;
  if (!canMove(piece, v)) return { ok: false, reason: "illegal" };

  const res = applyMove(state.players, owner, piece, v);
  if (!res) return { ok: false, reason: "illegal" };

  p.results.splice(ri, 1);
  emit(state, {
    type: "move", owner, pieceId, v, name: YUT[v].name,
    from: expectedNode, to: res.node, stack: res.stack,
  });

  if (res.caught > 0) {
    // 잡기 보상은 윷·모와 같은 종류다: 상한을 무시하는 즉시 던지기 1회.
    p.bonus += 1;
    emit(state, { type: "capture", owner, count: res.caught, node: res.node });
  }
  if (res.done) emit(state, { type: "goal", owner, pieceId });

  const winner = checkWin(state);
  if (winner !== null) {
    state.over = true;
    state.winner = winner;
    emit(state, { type: "win", owner: winner });
  }
  return { ok: true, caught: res.caught, done: res.done };
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
node --test test/actions.test.js
```

기대: `# pass 15`, `# fail 0`.

- [ ] **Step 5: 전체 코어 테스트 확인**

```bash
node --test test/
```

기대: 실패 0.

- [ ] **Step 6: 커밋**

```bash
git add src/core/actions.js test/actions.test.js
git commit -m "feat(core): 던지기·결과 사용, 보너스 통일과 선착순 무효화"
```

---

### Task 7: AI와 자동 대전 검증

**Files:**
- Create: `src/ai/ai.js`
- Test: `test/ai.test.js`
- Test: `test/simulation.test.js`

**Interfaces:**
- Consumes: `move.js`의 `simulate`, `nodeAt`, `remain`; `actions.js`의 `throwYut`, `useResult`, `canThrow`; `board.js`의 `PATHS`
- Produces:
  - `AI_MIN_DELAY_MS: 400`
  - `AI_LEVELS: Array<{ name:string, thinkMs:[number,number], noise:number }>` — 길이 3
  - `bestMove(state, owner, noise, rng?): { score:number, resultId:number, pieceId:number, expectedNode:number|null } | null`
  - `aiTick(state, owner, level, rng?): void` — `state.now`를 보고 스스로 지연을 지킨다

AI의 충전 속도 배율(`rate`)은 폐기한다. 국면 구조가 난이도 곡선을 대신하므로(기획서 13장) 양쪽은 같은 속도로 충전하고, 난이도 차이는 **판단 지연과 수 선택의 노이즈로만** 낸다. 에너지 속도를 다르게 주면 "AI가 더 자주 던진다"는 불공정 인식이 생긴다.

- [ ] **Step 1: 실패하는 AI 단위 테스트 작성**

`test/ai.test.js`:

```js
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
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

```bash
node --test test/ai.test.js
```

기대: 모듈 없음으로 전부 실패.

- [ ] **Step 3: ai.js 구현**

```js
import { PATHS } from "../core/board.js";
import { simulate, nodeAt, remain } from "../core/move.js";
import { throwYut, useResult, canThrow } from "../core/actions.js";

/**
 * AI 판단 지연 하한.
 * AI는 이론상 0ms에 반응해 선착순 경합에서 항상 이긴다.
 * 이건 난이도 값이 아니라 공정성 하한이므로 어려움에서도 내리지 않는다.
 */
export const AI_MIN_DELAY_MS = 400;

export const AI_LEVELS = [
  { name: "쉬움", thinkMs: [1100, 2000], noise: 0.60 },
  { name: "보통", thinkMs: [700, 1300], noise: 0.22 },
  { name: "어려움", thinkMs: [AI_MIN_DELAY_MS, 800], noise: 0.00 },
];

const randRange = (rng, a, b) => a + rng() * (b - a);

/** 한 수의 가치. 클수록 좋다. */
function score(state, owner, piece, r) {
  let s = 0;
  if (r.done) {
    s += 95;
  } else {
    // 잡기 — 상대가 많이 전진했을수록 이득이 크다
    for (const q of state.players[1 - owner].pieces)
      if (q.state === "board" && nodeAt(q) === r.node)
        s += 110 + (PATHS[q.path].length - 1 - remain(q)) * 4;
    // 업기
    for (const q of state.players[owner].pieces)
      if (q !== piece && q.state === "board" && nodeAt(q) === r.node) s += 22;
    // 지름길 진입
    if (r.node === 5 || r.node === 10) s += 26;
    if (r.node === 23) s += 34;
    // 골까지 줄어든 거리
    s += remain(piece) - (PATHS[r.path].length - 1 - r.idx);
  }
  if (piece.state === "wait") {
    s += 8;
    // 판이 비면 반드시 출발한다. 아니면 결과만 쌓이고 아무 일도 일어나지 않는다.
    if (state.players[owner].pieces.every((q) => q.state !== "board")) s += 45;
  }
  return s;
}

/**
 * @returns {{score:number, resultId:number, pieceId:number, expectedNode:number|null}|null}
 */
export function bestMove(state, owner, noise, rng = Math.random) {
  const p = state.players[owner];
  let best = null;
  for (const result of p.results) {
    for (const piece of p.pieces) {
      const r = simulate(piece, result.v);
      if (!r) continue;
      const sc = score(state, owner, piece, r) + (noise ? (rng() - 0.5) * 220 * noise : 0);
      if (!best || sc > best.score)
        best = { score: sc, resultId: result.id, pieceId: piece.id, expectedNode: nodeAt(piece) };
    }
  }
  return best;
}

/**
 * AI의 한 프레임. state.now를 기준으로 스스로 지연을 지킨다.
 * 사람과 같은 규칙·같은 충전 속도를 쓰고, 차이는 지연과 노이즈로만 낸다.
 */
export function aiTick(state, owner, level, rng = Math.random) {
  if (state.over || state.now < state.aiNextAt) return;

  const move = bestMove(state, owner, level.noise, rng);
  if (move) {
    useResult(state, owner, move.resultId, move.pieceId, move.expectedNode);
    state.aiNextAt = state.now + randRange(rng, level.thinkMs[0], level.thinkMs[1]);
    return;
  }
  if (canThrow(state, owner)) {
    throwYut(state, owner, rng);
    // 던지는 동작 자체도 사람이라면 시간이 걸린다
    state.aiNextAt = state.now + randRange(rng, AI_MIN_DELAY_MS, AI_MIN_DELAY_MS + 300);
  }
}
```

- [ ] **Step 4: AI 단위 테스트 통과 확인**

```bash
node --test test/ai.test.js
```

기대: `# pass 9`, `# fail 0`.

- [ ] **Step 5: 자동 대전 검증 테스트 작성**

`test/simulation.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, checkWin, PHASES } from "../src/core/game.js";
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

  // 동일 AI끼리이므로 승률은 50%에 수렴해야 한다
  assert.ok(Math.abs(rate - 50) <= 5, `승률 편향: ${rate.toFixed(1)}%`);
});

test("국면이 실제로 종반까지 도달한다", () => {
  // 종반에 절대 못 가면 4장의 국면 구조가 죽은 코드가 된다
  let reachedFinal = 0;
  for (let i = 0; i < 30; i++) {
    const { s } = playOne();
    if (s.phase === 2) reachedFinal++;
  }
  assert.ok(reachedFinal >= 28, `종반 도달 ${reachedFinal}/30`);
  void PHASES;
});
```

- [ ] **Step 6: 자동 대전 실행**

```bash
node --test test/simulation.test.js
```

기대: `# pass 2`, `# fail 0`. 콘솔에 승률·평균 길이·던지기 횟수가 찍힌다.

**이 출력의 평균 초를 기록해 둔다.** 기획서 4장의 예상(평균 2.5~3분)과 크게 다르면 — 예컨대 40초나 12분이면 — 그건 코드 버그가 아니라 **국면 수치 재조정 신호**다. 기획서 14장 열린 항목에 실측값을 적고 사용자에게 보고한다. 이 태스크에서 수치를 임의로 바꾸지 않는다.

- [ ] **Step 7: 커밋**

```bash
git add src/ai/ai.js test/ai.test.js test/simulation.test.js
git commit -m "feat(ai): 수 평가와 공정성 지연 하한, 300게임 자동 대전 검증"
```

---

### Task 8: HTML 골격과 보드 렌더

**Files:**
- Modify: `index.html` (전면 교체)
- Create: `styles/game.css`
- Create: `src/ui/render-board.js`

**Interfaces:**
- Consumes: `board.js`의 `NODE`, `BIG`, 좌표 상수; `move.js`의 `nodeAt`, `canMove`, `simulate`
- Produces:
  - `buildBoard(svgEl, state, handlers): void` — `handlers = { onPieceClick(owner, pieceId), onPieceHover(owner, pieceId), onPieceLeave() }`
  - `renderBoard(state, selection): void` — `selection = { resultId, v } | null`
  - `showGhost(node): void` / `hideGhost(): void`
  - `nodeXY(node): [number, number]`

프로토타입의 SVG 구조(`index.html:575-675`)를 옮기되, 말 요소를 매 프레임 새로 만들지 않고 `<g>`를 유지한 채 `transform`만 갱신하는 방식은 그대로 유지한다 — CSS 트랜지션이 동작하려면 이 방식이어야 한다.

- [ ] **Step 1: index.html 교체**

세로 화면 우선, 조작부는 하단(기획서 10장). 데스크톱에서만 2단 그리드가 된다.

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>실시간 윷놀이</title>
<link rel="stylesheet" href="styles/game.css">
</head>
<body>

<header>
  <h1>실시간 윷놀이 <small id="phaseLabel">도입</small></h1>
  <div class="spacer"></div>
  <div class="seg" id="diff">
    <button data-d="0">쉬움</button>
    <button data-d="1" class="on">보통</button>
    <button data-d="2">어려움</button>
  </div>
  <button class="btn" id="restart">새 게임</button>
</header>

<main>
  <section class="board-wrap">
    <svg id="board" viewBox="0 0 600 600" aria-label="윷판"></svg>
    <div id="fx" aria-hidden="true"></div>
    <div id="toast" role="status" aria-live="polite"></div>
  </section>

  <section class="side">
    <div class="panel ai" id="pan1">
      <div class="phead">
        <span class="mark bear">곰</span>
        <span class="pname">홍군 (AI)</span>
        <span class="pstat">골인 <b id="goal1">0</b>/4</span>
      </div>
      <div class="energy" id="en1"></div>
      <div class="chips" id="chip1"></div>
      <div class="waiting" id="wait1"></div>
    </div>

    <div class="panel me" id="pan0">
      <div class="phead">
        <span class="mark tiger">호</span>
        <span class="pname">청군 (나)</span>
        <span class="pstat">골인 <b id="goal0">0</b>/4</span>
      </div>
      <div class="energy" id="en0"></div>
      <div class="chips" id="chip0"></div>
      <div class="waiting" id="wait0"></div>
      <button class="throw" id="throwBtn">
        <span id="throwLabel">윷 던지기</span><span class="k">Space</span>
      </button>
    </div>
  </section>
</main>

<div id="over"><div class="overcard">
  <h2 id="overTitle"></h2>
  <p id="overSub"></p>
  <button class="btn" id="overBtn">다시 하기</button>
</div></div>

<script type="module" src="src/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: styles/game.css 작성**

프로토타입 `index.html:8-197`의 CSS를 옮기되 다음을 바꾼다. 나머지 규칙(`header`, `.btn`, `.seg`, `.panel`, `.phead`, `.energy`, `.eseg`, `.efill`, `.throw`, `.chip`, `.waiting`, `.wp`, `#over`, `.overcard`)은 그대로 옮긴다.

1. `#sticks` 전체화면 오버레이 규칙 전체(`index.html:151-172`) **삭제**. 자리에 `#fx` 레이어를 넣는다.
2. `.log` 관련 규칙(`index.html:140-148`) 삭제 — 로그 패널은 토스트로 대체됐다.
3. 숲 색조 변수, 세로 우선 레이아웃, 44px 터치 타깃 추가.

새로 추가/교체하는 규칙:

```css
:root{
  --bg:#12160f; --card:#1b2016; --card2:#232a1d; --line:#39432c;
  --ink:#e9e6d5; --dim:#9aa383; --hanji:#f0e6cd; --brush:#3b2f24;
  --blue:#3b82c4; --blue-d:#1e5c96; --red:#cf4a3c; --red-d:#9e3226;
  --gold:#e0a83c; --leaf:#5c7a3f;
}
body{
  background:
    radial-gradient(120% 80% at 50% 0%, #1e2717 0%, transparent 60%),
    var(--bg);
}

/* 세로 우선. 데스크톱에서만 2단. */
main{
  width:100%; max-width:1080px;
  display:grid; grid-template-columns:1fr; gap:14px; align-items:start;
}
@media (min-width:901px){ main{ grid-template-columns:1fr 340px; } }

.board-wrap{ position:relative }

/* 조작부는 항상 하단 엄지 도달 범위에 있어야 한다 */
.panel.me .throw{ margin-top:10px }
.throw{ min-height:52px }
.chip{ min-height:44px; padding:0 14px }
.wp{ width:44px; height:44px }

/* 논블로킹 연출 레이어 — 보드를 가리지 않는다 */
#fx{
  position:absolute; inset:0; pointer-events:none; overflow:hidden;
  border-radius:16px; z-index:10;
}
#toast{
  position:absolute; left:50%; bottom:14px; transform:translateX(-50%);
  display:flex; flex-direction:column; gap:6px; align-items:center;
  pointer-events:none; z-index:12;
}

/* 국면 표시와 진영 표식 */
h1 small{ font-size:12px; color:var(--gold); font-weight:600; margin-left:8px }
.mark{
  width:26px; height:26px; border-radius:50%; display:grid; place-items:center;
  font-size:12px; font-weight:800; flex:none;
}
.mark.tiger{ background:#152a3f; color:#9dc8ee; border:2px solid var(--blue) }
.mark.bear{ background:#3a1c17; color:#eda79d; border:2px solid var(--red) }
```

- [ ] **Step 3: render-board.js 작성**

```js
import { NODE, BIG, P_START, P_TR, P_TL, P_BL, P_MID } from "../core/board.js";
import { nodeAt, canMove, simulate } from "../core/move.js";

let svg = null;
let pieceEls = {};
let ghostEl = null;
let targetEls = {};

export const nodeXY = (node) => NODE[node];

function el(tag, attrs, parent) {
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

export function buildBoard(svgEl, state, handlers) {
  svg = svgEl;
  svg.innerHTML = "";
  pieceEls = {};
  targetEls = {};

  el("rect", { x: 0, y: 0, width: 600, height: 600, rx: 10, fill: "var(--hanji)" }, svg);

  const lines = el("g", {
    stroke: "var(--brush)", "stroke-width": 3.4, "stroke-linecap": "round",
    fill: "none", opacity: 0.7,
  }, svg);
  el("path", { d: `M${P_START} L${P_TR} L${P_TL} L${P_BL} Z` }, lines);
  el("path", { d: `M${P_TR} L${P_BL}` }, lines);
  el("path", { d: `M${P_TL} L${P_START}` }, lines);

  const nodesG = el("g", {}, svg);
  for (const k in NODE) {
    const id = +k, [x, y] = NODE[k], big = BIG.has(id);
    el("circle", {
      cx: x, cy: y, r: big ? 27 : 17, fill: "var(--hanji)",
      stroke: "var(--brush)", "stroke-width": big ? 3.4 : 2.6,
    }, nodesG);
    if (big)
      el("circle", { cx: x, cy: y, r: 20, fill: "none", stroke: "var(--brush)",
        "stroke-width": 1.6, opacity: 0.5 }, nodesG);
  }

  const lab = (x, y, t, sz) => {
    const n = el("text", {
      x, y: y + sz * 0.34, "text-anchor": "middle", "font-size": sz,
      "font-weight": 800, fill: "var(--brush)", opacity: 0.5, "font-family": "inherit",
    }, svg);
    n.textContent = t;
  };
  lab(P_START[0], P_START[1] - 44, "출발 · 골", 14);
  lab(P_MID[0], P_MID[1], "방", 15);

  // 도착 지점 표시 레이어 — 칩을 고르면 갈 수 있는 칸이 여기에 켜진다
  const tg = el("g", { class: "targets" }, svg);
  for (const k in NODE) {
    const [x, y] = NODE[k];
    targetEls[k] = el("circle", {
      class: "target", cx: x, cy: y, r: 24, fill: "none",
      stroke: "var(--gold)", "stroke-width": 3, "stroke-dasharray": "6 5", opacity: 0,
    }, tg);
  }

  ghostEl = el("g", { class: "ghost" }, svg);
  el("circle", { cx: 0, cy: 0, r: 22, fill: "none", stroke: "var(--gold)",
    "stroke-width": 4, "stroke-dasharray": "7 5" }, ghostEl);

  const pg = el("g", { class: "pieces" }, svg);
  for (const P of state.players) {
    for (const p of P.pieces) {
      const gg = el("g", { class: "piece hidden" }, pg);
      el("circle", {
        class: "body", cx: 0, cy: 0, r: 15,
        fill: P.id === 0 ? "var(--blue-d)" : "var(--red-d)",
        stroke: P.id === 0 ? "#7db8ea" : "#f0a294", "stroke-width": 2.4,
      }, gg);
      el("circle", { cx: 0, cy: -4, r: 6, fill: "#fff", opacity: 0.16 }, gg);
      const t = el("text", {
        class: "cnt", x: 0, y: 5, "text-anchor": "middle", "font-size": 13,
        "font-weight": 900, fill: "#fff", "font-family": "inherit",
      }, gg);
      t.textContent = "";
      gg.addEventListener("click", () => handlers.onPieceClick(P.id, p.id));
      gg.addEventListener("mouseenter", () => handlers.onPieceHover(P.id, p.id));
      gg.addEventListener("mouseleave", () => handlers.onPieceLeave());
      pieceEls[P.id + "-" + p.id] = gg;
    }
  }
}

/**
 * @param {{resultId:number, v:number}|null} selection 고른 결과 칩
 */
export function renderBoard(state, selection) {
  const leaders = {};

  for (const P of state.players) {
    const byNode = {};
    for (const p of P.pieces) {
      const e = pieceEls[P.id + "-" + p.id];
      e.classList.remove("can", "capture");
      if (p.state !== "board") { e.classList.add("hidden"); continue; }
      const n = nodeAt(p);
      (byNode[n] = byNode[n] || []).push(p);
    }
    for (const n in byNode) {
      const list = byNode[n], [x, y] = NODE[n];
      const off = P.id === 0 ? -2 : 2;   // 두 진영이 완전히 겹쳐 보이지 않도록
      list.forEach((p, i) => {
        const e = pieceEls[P.id + "-" + p.id];
        if (i === 0) {
          e.classList.remove("hidden");
          e.setAttribute("transform", `translate(${x + off},${y})`);
          e.querySelector(".cnt").textContent = list.length > 1 ? list.length : "";
        } else {
          e.classList.add("hidden");
        }
      });
      leaders[P.id + "|" + n] = list[0];
    }
  }

  for (const k in targetEls) targetEls[k].style.opacity = 0;
  if (!selection) return;

  // 칩을 고르면: 움직일 수 있는 말과 도착 지점을 즉시 보여준다.
  // 잡을 수 있는 수는 따로 강조한다 (기획서 9장 — 종반 속도의 전제 조건).
  const enemy = state.players[1].pieces;
  for (const p of state.players[0].pieces) {
    if (!canMove(p, selection.v)) continue;
    const r = simulate(p, selection.v);
    if (!r) continue;

    const lead = p.state === "board" ? leaders["0|" + nodeAt(p)] : null;
    if (lead) pieceEls["0-" + lead.id].classList.add("can");

    if (!r.done && targetEls[r.node]) {
      const willCapture = enemy.some((q) => q.state === "board" && nodeAt(q) === r.node);
      targetEls[r.node].style.opacity = 1;
      targetEls[r.node].setAttribute("stroke", willCapture ? "var(--red)" : "var(--gold)");
      targetEls[r.node].setAttribute("stroke-width", willCapture ? 5 : 3);
      if (willCapture && lead) pieceEls["0-" + lead.id].classList.add("capture");
    }
  }
}

export function showGhost(node) {
  if (!ghostEl || !NODE[node]) return;
  const [x, y] = NODE[node];
  ghostEl.setAttribute("transform", `translate(${x},${y})`);
  ghostEl.classList.add("on");
}

export function hideGhost() {
  ghostEl?.classList.remove("on");
}
```

- [ ] **Step 4: CSS에 말·타깃 규칙 추가**

`styles/game.css` 끝에 추가:

```css
svg#board{ width:100%; height:auto; display:block; border-radius:10px }
.ghost{ opacity:0; transition:opacity .15s; pointer-events:none }
.ghost.on{ opacity:.9 }
.target{ transition:opacity .18s, stroke-width .18s; pointer-events:none }
.piece{ transition:transform .28s cubic-bezier(.4,1.4,.5,1), opacity .2s }
.piece.hidden{ opacity:0; pointer-events:none }
.piece.can{ cursor:pointer; filter:drop-shadow(0 0 7px rgba(224,168,60,.85)) }
.piece.can circle.body{ stroke:var(--gold); stroke-width:3.5 }
.piece.capture circle.body{ stroke:#ff6a55; stroke-width:4 }
.piece.capture{ filter:drop-shadow(0 0 10px rgba(255,90,70,.9)) }
```

- [ ] **Step 5: 문법 확인**

```bash
node --check src/ui/render-board.js
```

기대: 출력 없음. 시각 확인은 Task 11 통합 검증에서 한다 — `main.js`가 없으면 화면이 뜨지 않는다.

- [ ] **Step 6: 커밋**

```bash
git add index.html styles/game.css src/ui/render-board.js
git commit -m "feat(ui): HTML 골격과 보드 렌더, 도착 지점·잡기 강조"
```

---

### Task 9: 패널 렌더 — 에너지·칩·대기말

**Files:**
- Create: `src/ui/render-panel.js`
- Modify: `styles/game.css` (칩 글리프 규칙 추가)

**Interfaces:**
- Consumes: `board.js`의 `ENERGY_MAX`; `game.js`의 `PHASES`; `yut.js`의 `YUT`; `move.js`의 `canMove`; `actions.js`의 `canThrow`
- Produces:
  - `buildPanels(state): void` — 에너지 칸을 한 번만 만든다
  - `renderPanels(state, selection, handlers): void` — `handlers = { onChipClick(resultIdOrNull, v), onWaitPieceClick(pieceId) }`
  - `renderEnergy(state): void` — 매 프레임 호출되는 가벼운 갱신 전용

렌더링을 두 갈래로 나누는 이유: 에너지 바는 60fps로 갱신해야 하고, 칩·대기말은 상태가 바뀔 때만 다시 그리면 된다. 매 프레임 `innerHTML`을 갈아치우면 중저가 안드로이드에서 프레임이 무너진다(기획서 11장).

- [ ] **Step 1: render-panel.js 작성**

```js
import { ENERGY_MAX } from "../core/board.js";
import { PHASES } from "../core/game.js";
import { YUT } from "../core/yut.js";
import { canMove } from "../core/move.js";
import { canThrow } from "../core/actions.js";

const $ = (id) => document.getElementById(id);

export function buildPanels(state) {
  for (const P of state.players) {
    const wrap = $("en" + P.id);
    wrap.innerHTML = "";
    for (let i = 0; i < ENERGY_MAX; i++) {
      const s = document.createElement("div");
      s.className = "eseg";
      const f = document.createElement("div");
      f.className = "efill";
      s.appendChild(f);
      wrap.appendChild(s);
    }
  }
}

/** 매 프레임 호출된다. DOM 생성 없이 style/class만 건드린다. */
export function renderEnergy(state) {
  for (const P of state.players) {
    const segs = $("en" + P.id).children;
    for (let i = 0; i < ENERGY_MAX; i++) {
      const fill = Math.max(0, Math.min(1, P.energy - i));
      segs[i].firstChild.style.transform = `scaleX(${fill})`;
      segs[i].classList.toggle("full", fill >= 1);
    }
  }
  const me = state.players[0];
  const btn = $("throwBtn");
  const bonus = me.bonus > 0;
  btn.disabled = !canThrow(state, 0);
  btn.classList.toggle("bonus", bonus && !btn.disabled);
  $("throwLabel").textContent = bonus ? `보너스 던지기 ×${me.bonus}` : "윷 던지기";
  $("phaseLabel").textContent = PHASES[state.phase].name;
}

/** 상태가 바뀐 프레임에만 호출한다. */
export function renderPanels(state, selection, handlers) {
  renderChips(state, selection, handlers);
  renderWaiting(state, selection, handlers);
  for (const P of state.players)
    $("goal" + P.id).textContent = P.pieces.filter((p) => p.state === "done").length;
}

function renderChips(state, selection, handlers) {
  for (const P of state.players) {
    const box = $("chip" + P.id);
    box.innerHTML = "";
    if (!P.results.length) {
      const d = document.createElement("div");
      d.className = "empty-hint";
      d.textContent = P.id === 0 ? "윷을 던져 결과를 모으세요" : "—";
      box.appendChild(d);
      continue;
    }

    // 같은 값끼리 묶어 보여준다. 선택은 그 묶음의 첫 결과 id로 한다.
    const groups = new Map();
    for (const r of P.results) {
      if (!groups.has(r.v)) groups.set(r.v, []);
      groups.get(r.v).push(r);
    }
    [...groups.entries()].sort((a, b) => a[0] - b[0]).forEach(([v, list]) => {
      const c = document.createElement("div");
      const selected = P.id === 0 && selection !== null
        && list.some((r) => r.id === selection.resultId);
      c.className = "chip" + (v < 0 ? " back" : "") + (P.id === 1 ? " static" : "")
        + (selected ? " sel" : "");
      c.innerHTML =
        `<span class="g">${YUT[v].glyph}</span>` +
        `<span>${YUT[v].name}</span>` +
        `<span class="v">${v > 0 ? "+" : ""}${v}</span>` +
        (list.length > 1 ? `<span class="n">×${list.length}</span>` : "");
      if (P.id === 0) {
        c.addEventListener("click", () =>
          handlers.onChipClick(selected ? null : list[0].id, v));
      }
      box.appendChild(c);
    });
  }
}

function renderWaiting(state, selection, handlers) {
  for (const P of state.players) {
    const box = $("wait" + P.id);
    box.innerHTML = "";
    const lbl = document.createElement("span");
    lbl.className = "lbl";
    lbl.textContent = "말";
    box.appendChild(lbl);

    const v = P.id === 0 && selection !== null ? selection.v : null;
    for (const p of P.pieces) {
      const d = document.createElement("div");
      if (p.state === "done") { d.className = "wp done"; d.textContent = "✓"; }
      else if (p.state === "board") { d.className = "wp dead"; d.textContent = p.id + 1; }
      else {
        d.className = "wp";
        d.textContent = p.id + 1;
        if (v !== null && canMove(p, v)) {
          d.classList.add("can");
          d.title = "출발시키기";
          d.addEventListener("click", () => handlers.onWaitPieceClick(p.id));
        }
      }
      box.appendChild(d);
    }
  }
}
```

- [ ] **Step 2: 칩 글리프용 CSS 추가**

`styles/game.css` 끝에 추가:

```css
.chip{ display:flex; align-items:center; gap:6px }
.chip .g{ font-size:16px; line-height:1 }
.eseg.full{ animation:pop .18s ease-out }
@keyframes pop{ from{ transform:scale(1) } 50%{ transform:scale(1.06) } to{ transform:scale(1) } }
```

- [ ] **Step 3: 문법 확인**

```bash
node --check src/ui/render-panel.js
```

기대: 출력 없음.

- [ ] **Step 4: 커밋**

```bash
git add src/ui/render-panel.js styles/game.css
git commit -m "feat(ui): 에너지·칩·대기말 패널, 프레임 갱신과 상태 갱신 분리"
```

---

### Task 10: 논블로킹 연출

**Files:**
- Create: `src/ui/effects.js`
- Modify: `styles/game.css` (연출 규칙 추가)

**Interfaces:**
- Consumes: `yut.js`의 `YUT`; `board.js`의 `NODE`
- Produces:
  - `initEffects(): void`
  - `playEvents(events): void` — 코어가 만든 이벤트 배열을 받아 연출한다
  - `THROW_MS: 250`

**이 태스크가 지켜야 할 선:** `playEvents`는 어떤 경우에도 게임 상태를 읽거나 쓰지 않는다. 이벤트가 이미 확정된 사실을 알려줄 뿐이므로, 연출이 늦거나 겹쳐도 규칙에는 영향이 없다.

동물 스프라이트는 1차 구현에서 `YUT[v].glyph`의 유니코드 글리프를 쓴다. 손그림 SVG로 교체하는 것은 폴리싱 작업이며 이 함수들의 인터페이스를 바꾸지 않는다.

- [ ] **Step 1: effects.js 작성**

```js
import { YUT } from "../core/yut.js";
import { NODE } from "../core/board.js";

/** 던지기 모션. 종반 충전 3800ms 대비 6.6%. 이보다 길면 보드를 보는 시간이 줄어든다. */
export const THROW_MS = 250;

let fx = null;
let toast = null;

export function initEffects() {
  fx = document.getElementById("fx");
  toast = document.getElementById("toast");
  fx.innerHTML = "";
  toast.innerHTML = "";
}

/** #fx에 요소를 띄우고 ms 뒤 스스로 사라지게 한다 */
function spawn(html, className, style, ms) {
  const d = document.createElement("div");
  d.className = className;
  d.innerHTML = html;
  Object.assign(d.style, style);
  fx.appendChild(d);
  setTimeout(() => d.remove(), ms);
  return d;
}

function say(text, tone = "") {
  const d = document.createElement("div");
  d.className = "toast-line " + tone;
  d.textContent = text;
  toast.appendChild(d);
  setTimeout(() => d.remove(), 1600);
  while (toast.children.length > 3) toast.firstChild.remove();
}

/**
 * 던지기 연출. 보드 구석 작은 영역에서만 재생되고 오버레이를 만들지 않는다.
 * 이미 확정된 결과를 250ms 동안 보여줄 뿐이다.
 */
function playThrow(ev) {
  const sticks = ev.sticks
    .map((f, i) => `<i class="${f ? "flat" : ""}${i === 0 ? " mark" : ""}"></i>`)
    .join("");
  const el = spawn(
    `<div class="sticks">${sticks}</div><div class="rname">${ev.name}</div>`,
    "fx-throw" + (ev.v === 4 || ev.v === 5 ? " bonus" : ""),
    { bottom: "12px" },
    THROW_MS + 500
  );
  if (ev.owner === 0) el.style.left = "12px";
  else el.style.right = "12px";
}

/** 동물이 출발 칸에서 도착 칸으로 달린다. 여러 마리가 겹쳐도 서로 막지 않는다. */
function playRunner(ev) {
  if (ev.from == null || !NODE[ev.from] || !NODE[ev.to]) return;
  const [x0, y0] = NODE[ev.from];
  const [x1, y1] = NODE[ev.to];
  const dur = 260 + Math.abs(ev.v) * 40;
  const el = spawn(YUT[ev.v].glyph, "fx-runner", {
    left: `${x0 / 600 * 100}%`,
    top: `${y0 / 600 * 100}%`,
    transform: `translate(-50%,-50%) scaleX(${x1 >= x0 ? 1 : -1})`,
  }, dur + 120);
  requestAnimationFrame(() => {
    el.style.transition = `left ${dur}ms ease-in-out, top ${dur}ms ease-in-out`;
    el.style.left = `${x1 / 600 * 100}%`;
    el.style.top = `${y1 / 600 * 100}%`;
  });
}

function playCapture(ev) {
  if (NODE[ev.node]) {
    const [x, y] = NODE[ev.node];
    spawn("", "fx-hit", { left: `${x / 600 * 100}%`, top: `${y / 600 * 100}%` }, 620);
  }
  say(ev.owner === 0 ? `${ev.count}말 잡았다! 한 번 더!` : `${ev.count}말 잡혔다`,
    ev.owner === 0 ? "good" : "bad");
}

function playPhase(ev) {
  document.body.dataset.phase = ev.to;
  const names = ["도입", "전개", "종반"];
  spawn(
    `<b>${names[ev.to]}</b><span>${ev.to === 2 ? "속도가 크게 오릅니다" : "속도가 오릅니다"}</span>`,
    "fx-phase", {}, 1800);
}

/**
 * 확정된 이벤트들을 연출한다. 상태를 읽지도 쓰지도 않는다.
 * @param {Array<{type:string}>} events
 */
export function playEvents(events) {
  for (const ev of events) {
    switch (ev.type) {
      case "throw": playThrow(ev); break;
      case "move": playRunner(ev); break;
      case "capture": playCapture(ev); break;
      case "goal":
        say(ev.owner === 0 ? "골인!" : "홍군 골인", ev.owner === 0 ? "good" : "bad");
        break;
      case "bonus":
        if (ev.owner === 0) say(`${ev.cause}! 한 번 더`, "good");
        break;
      case "expire":
        if (ev.owner === 0) say(`${YUT[ev.v].name} 사라짐`, "bad");
        break;
      case "invalid":
        // 침묵하면 버그로 인식되고, 알려주면 드라마가 된다
        say("잡혔습니다 — 간발의 차!", "bad");
        break;
      case "phase": playPhase(ev); break;
      default: break;
    }
  }
}
```

- [ ] **Step 2: 연출 CSS 추가**

`styles/game.css` 끝에 추가:

```css
/* 던지기 — 보드 구석 작은 카드. 전체화면 오버레이가 아니다. */
.fx-throw{
  position:absolute; display:flex; flex-direction:column; align-items:center; gap:6px;
  padding:8px 12px; border-radius:12px; background:rgba(18,22,15,.82);
  border:1px solid var(--line); animation:fxin .12s ease-out;
}
.fx-throw.bonus{ border-color:var(--gold); box-shadow:0 0 16px rgba(224,168,60,.4) }
.fx-throw .sticks{ display:flex; gap:4px }
.fx-throw i{
  width:8px; height:34px; border-radius:4px; display:block;
  background:linear-gradient(90deg,#8d6b45,#c9a877 42%,#8d6b45);
  animation:flip .25s ease-out;
}
.fx-throw i.flat{ background:linear-gradient(90deg,#e8dcc2,#fff8e8 42%,#d8c9aa) }
.fx-throw i.mark{ box-shadow:inset 0 0 0 1px #b03a2e }
.fx-throw .rname{ font-size:16px; font-weight:900; letter-spacing:.06em }
@keyframes flip{ from{ transform:rotateY(540deg) } to{ transform:rotateY(0) } }
@keyframes fxin{ from{ opacity:0; transform:translateY(6px) } to{ opacity:1; transform:none } }

/* 동물 러너 */
.fx-runner{ position:absolute; font-size:26px; line-height:1; will-change:left,top }

/* 잡기 */
.fx-hit{
  position:absolute; width:54px; height:54px; margin:-27px 0 0 -27px;
  border-radius:50%; border:3px solid #ff6a55; animation:hit .6s ease-out forwards;
}
@keyframes hit{ from{ transform:scale(.4); opacity:1 } to{ transform:scale(1.9); opacity:0 } }

/* 국면 배너 */
.fx-phase{
  position:absolute; left:50%; top:42%; transform:translate(-50%,-50%);
  display:flex; flex-direction:column; align-items:center; gap:4px;
  padding:14px 30px; border-radius:14px; background:rgba(18,22,15,.88);
  border:1px solid var(--gold); animation:phasein 1.8s ease-out forwards;
}
.fx-phase b{ font-size:26px; color:var(--gold); letter-spacing:.14em }
.fx-phase span{ font-size:12px; color:var(--dim) }
@keyframes phasein{
  0%{ opacity:0; transform:translate(-50%,-40%) scale(.9) }
  14%,72%{ opacity:1; transform:translate(-50%,-50%) scale(1) }
  100%{ opacity:0; transform:translate(-50%,-56%) scale(1) }
}

/* 국면이 오르면 화면 톤이 바뀐다 */
body[data-phase="1"]{ --leaf:#7a7a2f }
body[data-phase="2"]{ --leaf:#8a4a2a }
body[data-phase="2"] .board-wrap{ box-shadow:0 0 0 1px rgba(224,110,60,.35) }

/* 토스트 */
.toast-line{
  padding:6px 12px; border-radius:9px; font-size:12px; font-weight:700;
  background:rgba(18,22,15,.9); border:1px solid var(--line);
  animation:fxin .12s ease-out;
}
.toast-line.good{ color:var(--gold); border-color:var(--gold) }
.toast-line.bad{ color:#ff9b8a; border-color:#7a3a2e }
```

- [ ] **Step 3: 문법 확인**

```bash
node --check src/ui/effects.js
```

기대: 출력 없음.

- [ ] **Step 4: 연출이 상태를 건드리지 않는지 확인**

```bash
grep -nE "players|energy|results|bonus|state\." src/ui/effects.js
```

기대: 매칭 없음. 하나라도 나오면 논블로킹 원칙이 깨진 것이므로 고친다.

- [ ] **Step 5: 커밋**

```bash
git add src/ui/effects.js styles/game.css
git commit -m "feat(ui): 논블로킹 던지기·동물·잡기·국면 연출"
```

---

### Task 11: 입력과 루프 조립

**Files:**
- Create: `src/ui/input.js`
- Create: `src/main.js`
- Create: `.claude/launch.json`

**Interfaces:**
- Consumes: 앞의 모든 모듈
- Produces: 실행되는 게임

- [ ] **Step 1: input.js 작성**

```js
/**
 * 입력을 모아 콜백으로 넘긴다. 게임 규칙은 모른다.
 * @param {{onThrow:Function, onPiece:Function, onCancel:Function,
 *          onRestart:Function, onDifficulty:Function}} h
 */
export function bindInput(h) {
  document.getElementById("throwBtn").addEventListener("click", h.onThrow);
  document.getElementById("restart").addEventListener("click", h.onRestart);
  document.getElementById("overBtn").addEventListener("click", h.onRestart);

  document.getElementById("diff").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    [...e.currentTarget.children].forEach((x) => x.classList.toggle("on", x === b));
    h.onDifficulty(+b.dataset.d);
  });

  addEventListener("keydown", (e) => {
    if (e.code === "Space") { e.preventDefault(); h.onThrow(); return; }
    if (e.key === "Escape") { h.onCancel(); return; }
    // 숫자키로 말을 고른다 — 판단 비용을 줄이는 데스크톱 지원(기획서 9장)
    if (e.key >= "1" && e.key <= "4") h.onPiece(+e.key - 1);
  });

  // 터치에서 300ms 지연 없이 반응하도록
  document.addEventListener("touchstart", () => {}, { passive: true });
}
```

- [ ] **Step 2: main.js 작성**

```js
import { createGame, drainEvents } from "./core/game.js";
import { tick } from "./core/tick.js";
import { throwYut, useResult } from "./core/actions.js";
import { nodeAt, simulate } from "./core/move.js";
import { aiTick, AI_LEVELS } from "./ai/ai.js";
import { buildBoard, renderBoard, showGhost, hideGhost } from "./ui/render-board.js";
import { buildPanels, renderPanels, renderEnergy } from "./ui/render-panel.js";
import { initEffects, playEvents } from "./ui/effects.js";
import { bindInput } from "./ui/input.js";

let state = null;
let selection = null;   // { resultId, v } | null
let level = 1;
let dirty = true;       // 이번 프레임에 패널을 다시 그려야 하는가
let lastTs = 0;

const svg = document.getElementById("board");

const markDirty = () => { dirty = true; };

function newGame() {
  state = createGame();
  selection = null;
  lastTs = 0;
  document.body.dataset.phase = "0";
  document.getElementById("over").classList.remove("on");
  initEffects();
  buildBoard(svg, state, {
    onPieceClick: (owner, pieceId) => { if (owner === 0) clickPiece(pieceId); },
    onPieceHover: (owner, pieceId) => {
      if (owner !== 0 || selection === null) return;
      const r = simulate(state.players[0].pieces[pieceId], selection.v);
      if (r && !r.done) showGhost(r.node);
      else hideGhost();
    },
    onPieceLeave: hideGhost,
  });
  buildPanels(state);
  markDirty();
}

function clickPiece(pieceId) {
  if (selection === null || state.over) return;
  const piece = state.players[0].pieces[pieceId];
  // 클릭 시점의 위치를 함께 넘긴다 — 그 사이 잡혔다면 코어가 무효로 판정한다
  useResult(state, 0, selection.resultId, pieceId, nodeAt(piece));
  // 성공이든 무효든 선택은 푼다. 칩을 남길지는 코어가 결정한다.
  selection = null;
  hideGhost();
  markDirty();
}

function finishScreen() {
  const t = document.getElementById("overTitle");
  t.textContent = state.winner === 0 ? "청군 승리!" : "홍군 승리";
  t.style.color = state.winner === 0 ? "var(--blue)" : "var(--red)";
  document.getElementById("overSub").textContent = state.winner === 0
    ? "말 4개를 모두 골인시켰습니다"
    : "AI가 먼저 말 4개를 완주시켰습니다";
  document.getElementById("over").classList.add("on");
}

const panelHandlers = {
  onChipClick: (resultId, v) => {
    selection = resultId === null ? null : { resultId, v };
    hideGhost();
    markDirty();
  },
  onWaitPieceClick: (pieceId) => clickPiece(pieceId),
};

bindInput({
  onThrow: () => { if (throwYut(state, 0).ok) markDirty(); },
  onPiece: (pieceId) => clickPiece(pieceId),
  onCancel: () => { selection = null; hideGhost(); markDirty(); },
  onRestart: newGame,
  onDifficulty: (d) => { level = d; newGame(); },
});

function loop(ts) {
  const dt = lastTs ? ts - lastTs : 0;
  lastTs = ts;

  const wasOver = state.over;
  tick(state, dt);
  aiTick(state, 1, AI_LEVELS[level]);

  const events = drainEvents(state);
  if (events.length) { playEvents(events); markDirty(); }

  // 고른 칩이 만료되어 사라졌으면 선택을 푼다
  if (selection !== null
      && !state.players[0].results.some((r) => r.id === selection.resultId)) {
    selection = null;
    hideGhost();
    markDirty();
  }

  renderEnergy(state);
  if (dirty) {
    renderBoard(state, selection);
    renderPanels(state, selection, panelHandlers);
    dirty = false;
  }
  if (state.over && !wasOver) finishScreen();

  requestAnimationFrame(loop);
}

newGame();
requestAnimationFrame(loop);
```

- [ ] **Step 3: 로컬 서버 설정과 실행**

ES 모듈은 `file://`에서 CORS 때문에 로드되지 않는다. 반드시 HTTP로 연다.

`.claude/launch.json` 생성:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "yut",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["--yes", "serve", "-l", "5180", "."],
      "port": 5180
    }
  ]
}
```

브라우저 미리보기를 `yut` 설정으로 시작하고 `http://localhost:5180` 을 연다.

- [ ] **Step 4: 콘솔 에러 0 확인**

브라우저 콘솔을 읽는다. 기대: 에러 0건. 404가 있으면 경로를 고친다.

- [ ] **Step 5: 기능 검증 체크리스트**

각 항목을 직접 확인하고 체크한다. 실패하면 원인을 고치고 다시 확인한다.

- [ ] 6.5초쯤 지나면 에너지 1칸이 차고 던지기 버튼이 활성화된다
- [ ] 던지기를 눌러도 **보드가 가려지지 않는다** — 판이 계속 보인다
- [ ] 던지기 연출이 끝나기 전에 다시 던져도 결과가 둘 다 남는다
- [ ] 윷·모가 나오면 에너지가 가득 차 있어도 "보너스 던지기 ×N"이 뜬다
- [ ] 칩을 고르면 갈 수 있는 말과 도착 칸이 표시된다
- [ ] 잡을 수 있는 도착 칸은 빨간 굵은 테두리로 구분된다
- [ ] 상대 말을 잡으면 보너스 던지기가 생기고(에너지는 그대로) 토스트가 뜬다
- [ ] 숫자키 1~4로 말을 움직일 수 있다
- [ ] Esc로 선택이 풀린다
- [ ] 양쪽 합쳐 2말이 골인하면 국면 배너가 뜨고 충전이 눈에 띄게 빨라진다
- [ ] 전개 국면에서 결과를 15초 방치하면 사라지고 "사라짐" 토스트가 뜬다
- [ ] AI가 잡아간 말을 클릭하면 "잡혔습니다 — 간발의 차!"가 뜨고 **칩이 남아 있다**
- [ ] 4말을 모두 골인시키면 결과 화면이 뜨고, 다시 하기가 동작한다

- [ ] **Step 6: 모바일 확인**

브라우저 뷰포트를 375x812(mobile 프리셋)로 바꾸고 확인한다.

- [ ] 가로 스크롤이 생기지 않는다
- [ ] 던지기 버튼이 화면 하단 엄지 도달 범위에 있다
- [ ] 칩과 대기말을 손가락으로 정확히 누를 수 있다(44px 이상)
- [ ] 보드가 잘리지 않는다

- [ ] **Step 7: 성능 확인**

브라우저 성능 트레이스를 5초간 기록하고 확인한다.

- [ ] 평균 60fps 유지, 롱태스크(50ms 초과) 0건

초과하면 기획서 11장의 감축 순서를 따른다: 파티클 → 그림자·블러 → 배경 디테일. `renderPanels`가 매 프레임 돌고 있지 않은지 먼저 확인한다.

- [ ] **Step 8: 전체 테스트 재실행**

```bash
node --test test/
```

기대: 실패 0.

- [ ] **Step 9: 커밋**

```bash
git add src/ui/input.js src/main.js .claude/launch.json
git commit -m "feat: 입력과 게임 루프 조립, 실시간 윷놀이 동작"
```

---

### Task 12: 실측값 반영과 마무리

**Files:**
- Modify: `docs/superpowers/specs/2026-07-26-realtime-yut-design.md` (14장 열린 항목)
- Create: `README.md`

프로토타입 파일은 Task 8에서 `index.html`이 교체되며 이미 사라졌으므로 별도 삭제 작업은 없다.

- [ ] **Step 1: 실측값을 기획서에 반영**

Task 7 Step 6에서 기록한 자동 대전 출력(평균 초, 던지기 횟수)과 Task 11에서 체감한 사이클 시간을 기획서 14장 "열린 항목"에 사실로 적는다. 값을 추측으로 채우지 않는다 — 실제로 측정한 것만 적는다.

형식:

```markdown
- 국면별 충전값 — 자동 대전 300게임 평균 <실측>초, 1인당 던지기 <실측>회.
  기획 시점 예상(2.5~3분)과 <일치 / 불일치>. <조정 필요 여부와 근거>
```

- [ ] **Step 2: README.md 작성**

```markdown
# 실시간 윷놀이

에너지가 차는 대로 윷을 던지고, 진행도에 따라 점점 빨라지는 1인용 실시간 윷놀이.

## 실행

정적 파일이므로 아무 HTTP 서버로나 열면 된다. ES 모듈을 쓰므로 `file://`로는 열리지 않는다.

    npx --yes serve .

브라우저에서 표시된 주소를 연다.

## 테스트

    npm test

의존성은 없다. Node 18 이상이면 동작한다.

## 구조

- `src/core` — 게임 규칙과 상태. DOM을 모른다.
- `src/ai` — 수 평가. DOM을 모른다.
- `src/ui` — 렌더링과 연출. 규칙을 바꾸지 않는다.
- `test/` — 규칙 단위 검사, 확률 분포, 300게임 자동 대전.

설계 배경은 [기획서](docs/superpowers/specs/2026-07-26-realtime-yut-design.md)에 있다.
```

- [ ] **Step 3: 코어가 DOM을 참조하지 않는지 최종 확인**

```bash
grep -rnE "document|window|performance|navigator" src/core src/ai
```

기대: 매칭 없음.

- [ ] **Step 4: 의존성이 0인지 확인**

```bash
node -e "const p=JSON.parse(require('fs').readFileSync('package.json'));console.log(p.dependencies??{},p.devDependencies??{})"
```

기대: `{} {}`.

- [ ] **Step 5: 커밋**

```bash
git add README.md docs/superpowers/specs/2026-07-26-realtime-yut-design.md
git commit -m "docs: README와 실측값 반영"
```

---

## 기획서 대비 자체 점검

계획을 다 쓴 뒤 기획서와 맞춰본 결과.

| 기획서 | 담당 태스크 | 비고 |
|---|---|---|
| 3장 핵심 루프 · 보너스 통일 | Task 6 | `bonus += 1` 한 종류로 통일, 테스트로 고정 |
| 4장 진행도 기반 국면 | Task 4, 5 | `phaseOf`가 시간을 전혀 보지 않는다 |
| 5장 충전 6.5/5.0/3.8초, 상한 3칸 | Task 4, 5 | `PHASES` 값을 테스트가 직접 검사 |
| 6장 원작 규칙 | Task 1, 2, 3 | 판 29칸·확률·백도·지름길·업기·잡기 |
| 7장 선착순, 무효화 4원칙 | Task 6, 10 | 칩 미소모 + `invalid` 이벤트 + 토스트 |
| 7장 AI 지연 하한 0.4초 | Task 7 | `AI_MIN_DELAY_MS`를 테스트가 고정 |
| 7장 상태 즉시 확정 원칙 | Task 6, 10 | 이벤트 큐 구조로 강제, Task 10 Step 4가 검사 |
| 8장 논블로킹 250ms | Task 10 | 오버레이 없음, `THROW_MS = 250` |
| 8장 동물 연출 | Task 2, 10 | `YUT[v].glyph`, 던지기가 아니라 이동에 붙인다 |
| 8장 국면 전환 연출 | Task 10 | 배너 + `body[data-phase]` 톤 변화 |
| 9장 판단 비용 절감 | Task 8, 9, 11 | 도착 지점·잡기 강조·묶음 칩·숫자키 |
| 10장 모바일 | Task 8, 11 | 세로 우선, 44px, 하단 조작부 |
| 11장 성능 예산 | Task 9, 11 | 프레임 갱신/상태 갱신 분리, 트레이스 확인 |
| 12장 검증 방법 | Task 1~7, 11 | 표의 7개 항목이 모두 대응됨 |
| 13장 프로토타입 처리 | Task 1~3, 8 | 유지 항목은 이식, 변경 항목은 재작성 |

**계획 단계에서 기획서와 달라진 것 하나 — AI 충전 배율 폐기.** 프로토타입은 난이도별로 AI의 에너지 충전 속도를 0.72/1.0/1.18배로 다르게 줬다. 기획서 13장이 난이도 3단계를 "재검토 대상"으로 남겼으므로 이 계획은 **배율을 없애고 양쪽 충전 속도를 동일하게** 한다. 난이도 차이는 판단 지연과 수 선택 노이즈로만 낸다. 이유는 Task 7 본문에 적었다.

**기획서에서 빠뜨린 항목 하나 — 숲 테마 배경.** 기획서 8장은 "한지·먹 미감 위에 숲의 색조"를 요구하는데, 이 계획은 색 변수(`--leaf`)와 배경 그라디언트까지만 담았고 나무·풀 같은 배경 디테일은 넣지 않았다. 성능 예산(11장)에서 배경 디테일이 첫 번째 감축 대상이므로, **60fps를 확인한 뒤 남는 여유만큼 얹는 폴리싱 작업**으로 미룬다. 이 계획의 범위 밖이다.

**남는 위험 하나.** Task 7의 자동 대전 평균 길이가 기획서 4장의 예상(2.5~3분)과 크게 어긋날 수 있다. 그 경우 국면 수치를 조정해야 하는데, **이 계획은 그 조정을 자동으로 하지 않는다.** 실측값을 보고하고 사용자 판단을 받는다.
