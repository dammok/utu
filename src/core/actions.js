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
