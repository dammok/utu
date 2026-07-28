/**
 * 입력을 모아 콜백으로 넘긴다. 게임 규칙은 모른다.
 * @param {{onThrow:Function, onPiece:Function, onCancel:Function,
 *          onRestart:Function, onDifficulty:Function, onStart:Function}} h
 */
export function bindInput(h) {
  document.getElementById("throwBtn").addEventListener("click", h.onThrow);
  document.getElementById("restart").addEventListener("click", h.onRestart);
  document.getElementById("overBtn").addEventListener("click", h.onRestart);
  document.getElementById("startBtn").addEventListener("click", h.onStart);

  // 헤더(#diff)와 시작 화면(#startDiff) 두 군데에 난이도 선택 세그먼트가 있다.
  // 둘 중 어디를 눌러도 값은 하나(h.onDifficulty)로 합쳐지고, 표시는 두 세그먼트가
  // 항상 같은 선택으로 맞춰져야 한다(시작 화면에서 고른 난이도가 헤더에도 보여야 함).
  for (const seg of document.querySelectorAll(".diff-seg")) {
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const d = +b.dataset.d;
      for (const other of document.querySelectorAll(".diff-seg")) {
        [...other.children].forEach((x) => x.classList.toggle("on", +x.dataset.d === d));
      }
      h.onDifficulty(d);
    });
  }

  addEventListener("keydown", (e) => {
    // Space/Enter는 이중 역할이다: 시작 화면이 떠 있으면 게임을 시작하고,
    // 이미 시작했으면 윷을 던진다 — 어느 쪽인지는 h.onThrow(main.js)가 판단한다.
    if (e.code === "Space" || e.key === "Enter") { e.preventDefault(); h.onThrow(); return; }
    if (e.key === "Escape") { h.onCancel(); return; }
    // 숫자키로 말을 고른다 — 판단 비용을 줄이는 데스크톱 지원(기획서 9장)
    if (e.key >= "1" && e.key <= "4") h.onPiece(+e.key - 1);
  });

  // 터치에서 300ms 지연 없이 반응하도록
  document.addEventListener("touchstart", () => {}, { passive: true });
}
