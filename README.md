# 실시간 윷놀이

에너지가 차는 대로 윷을 던지고, 진행도에 따라 점점 빨라지는 1인용 실시간 윷놀이.

**▶ [바로 플레이](https://dammok.github.io/utu/)** — 설치 없이 브라우저에서 바로 돌아간다.

## 실행

로컬에서 돌리려면 아무 HTTP 서버로나 열면 된다. ES 모듈을 쓰므로 `file://`로는 열리지 않는다.

    npx --yes serve .

브라우저에서 표시된 주소를 연다.

## 테스트

    npm test

의존성은 없다. Node 18 이상이면 동작한다.

## 구조

```
index.html          styles/game.css
src/core/  board.js yut.js move.js game.js tick.js actions.js
src/ai/    ai.js
src/ui/    render-board.js render-panel.js effects.js input.js animal-icons.js
src/main.js
test/      board yut move game tick actions ai simulation (.test.js)
```

- `src/core` — 게임 규칙과 상태. DOM을 모른다.
- `src/ai` — 수 평가. DOM을 모른다.
- `src/ui` — 렌더링과 연출. 규칙을 바꾸지 않는다.
- `test/` — 규칙 단위 검사, 확률 분포, 300게임 자동 대전.

설계 배경은 [기획서](docs/superpowers/specs/2026-07-26-realtime-yut-design.md)에 있다.
