/**
 * 윷가락 4개. 배(평평한 면)가 나올 확률 0.6. 0번 가락에 백도 표식.
 * 도개걸윷모는 가축의 크기·속도 순서를 딴 이름이므로 동물을 함께 들고 다닌다.
 */
const FLAT_P = 0.6;

export const YUT = {
  "-1": { name: "백도", animal: "돼지" },
  1: { name: "도", animal: "돼지" },
  2: { name: "개", animal: "개" },
  3: { name: "걸", animal: "양" },
  4: { name: "윷", animal: "소" },
  5: { name: "모", animal: "말" },
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
