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
