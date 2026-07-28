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
