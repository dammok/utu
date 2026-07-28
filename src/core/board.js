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
