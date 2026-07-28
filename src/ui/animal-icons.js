/**
 * 도개걸윷모 다섯 동물 실루엣 — 판의 러너(effects.js)와 결과 칩(render-panel.js)이
 * 같은 그림을 쓰도록 한 곳에 모았다. 두 군데가 따로 그리면 한쪽만 고쳤을 때
 * 어긋난다 — 실제로 러너를 먹 실루엣으로 바꿨을 때 칩이 이모지로 남아 벌어졌다.
 *
 * 돼지(1) < 개(2) < 양(3) < 소(4) < 말(5) 순으로 그림 자체의 픽셀 크기를 키운다 —
 * 도개걸윷모가 원래 가축의 크기·속도 순서를 딴 이름이라, 크기만으로도 "몇 칸"인지
 * 형태를 몰라도 전달된다. 결정적 특징 하나씩만: 돼지=뭉툭한 주둥이+둥근 몸,
 * 개=쫑긋 귀+올린 꼬리, 양=복슬복슬한 등+말린 뿔, 소=뿔+육중한 몸, 말=긴 다리+갈기.
 * 백도(-1)는 도(1)와 같은 돼지를 쓴다 — 방향은 이동 방향에 따라 자동으로 뒤집힌다.
 */

/** 판 위를 달리는 러너 — 진영색 반점(코/이마)으로 누구 말인지 알려준다. */
const RUNNER_SVG = {
  1: (t) => `<svg viewBox="0 0 34 20" width="24" height="14">
    <ellipse cx="14" cy="10" rx="11" ry="7" fill="var(--brush)"/>
    <rect x="4" y="15" width="3" height="4.5" rx="1.3" fill="var(--brush)"/>
    <rect x="10" y="15.5" width="3" height="4.5" rx="1.3" fill="var(--brush)"/>
    <rect x="17" y="15.5" width="3" height="4.5" rx="1.3" fill="var(--brush)"/>
    <rect x="22" y="15" width="3" height="4.5" rx="1.3" fill="var(--brush)"/>
    <rect x="23" y="5" width="8" height="7" rx="3.2" fill="var(--brush)"/>
    <ellipse cx="30.5" cy="9" rx="2.4" ry="2" fill="${t}"/>
    <path d="M3,7 q-3,-3.4 -0.6,-6.2" stroke="var(--brush)" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  </svg>`,
  2: (t) => `<svg viewBox="0 0 40 24" width="28" height="17">
    <ellipse cx="17" cy="14" rx="13" ry="6.5" fill="var(--brush)"/>
    <rect x="5" y="19" width="3" height="5" rx="1.3" fill="var(--brush)"/>
    <rect x="12" y="19.5" width="3" height="5" rx="1.3" fill="var(--brush)"/>
    <rect x="20" y="19.5" width="3" height="5" rx="1.3" fill="var(--brush)"/>
    <rect x="27" y="19" width="3" height="5" rx="1.3" fill="var(--brush)"/>
    <circle cx="30" cy="9" r="6" fill="var(--brush)"/>
    <path d="M25,4 L27,-1 L30,5 Z" fill="var(--brush)"/>
    <path d="M33.5,2 q6,-4 5,-9" stroke="var(--brush)" stroke-width="2" fill="none" stroke-linecap="round"/>
    <ellipse cx="33" cy="9.5" rx="2" ry="1.7" fill="${t}"/>
  </svg>`,
  3: (t) => `<svg viewBox="0 0 46 26" width="32" height="18">
    <ellipse cx="19" cy="15" rx="15" ry="7" fill="var(--brush)"/>
    <circle cx="8" cy="7" r="5.4" fill="var(--brush)"/>
    <circle cx="17" cy="4.6" r="5.8" fill="var(--brush)"/>
    <circle cx="27" cy="6" r="5.4" fill="var(--brush)"/>
    <rect x="6" y="20" width="3" height="5" rx="1.3" fill="var(--brush)"/>
    <rect x="14" y="20.5" width="3" height="5" rx="1.3" fill="var(--brush)"/>
    <rect x="23" y="20.5" width="3" height="5" rx="1.3" fill="var(--brush)"/>
    <rect x="31" y="20" width="3" height="5" rx="1.3" fill="var(--brush)"/>
    <circle cx="37" cy="12" r="6" fill="var(--brush)"/>
    <path d="M39,7 q4,-1 3,4" stroke="var(--brush)" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <ellipse cx="39.5" cy="13" rx="2.1" ry="1.7" fill="${t}"/>
  </svg>`,
  4: (t) => `<svg viewBox="0 0 54 30" width="38" height="21">
    <rect x="8" y="8" width="34" height="16" rx="6" fill="var(--brush)"/>
    <rect x="6" y="23" width="4" height="6" rx="1.4" fill="var(--brush)"/>
    <rect x="16" y="23.5" width="4" height="6" rx="1.4" fill="var(--brush)"/>
    <rect x="30" y="23.5" width="4" height="6" rx="1.4" fill="var(--brush)"/>
    <rect x="40" y="23" width="4" height="6" rx="1.4" fill="var(--brush)"/>
    <circle cx="45" cy="12" r="7" fill="var(--brush)"/>
    <path d="M41,6 q-4,-6 1,-8" stroke="var(--brush)" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M49,6 q4,-6 -1,-8" stroke="var(--brush)" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <ellipse cx="47.5" cy="13" rx="2.4" ry="1.9" fill="${t}"/>
  </svg>`,
  5: (t) => `<svg viewBox="0 0 64 40" width="46" height="29">
    <ellipse cx="26" cy="22" rx="18" ry="8" fill="var(--brush)"/>
    <rect x="8" y="29" width="4.4" height="10" rx="1.5" fill="var(--brush)"/>
    <rect x="20" y="30" width="4.4" height="10" rx="1.5" fill="var(--brush)"/>
    <rect x="34" y="30" width="4.4" height="10" rx="1.5" fill="var(--brush)"/>
    <rect x="44" y="29" width="4.4" height="10" rx="1.5" fill="var(--brush)"/>
    <path d="M40,16 C48,10 56,8 60,2 C58,10 52,14 46,18 Z" fill="var(--brush)"/>
    <circle cx="55" cy="10" r="6.5" fill="var(--brush)"/>
    <path d="M42,8 q6,-4 12,-2 M40,12 q7,-3 13,-1" stroke="var(--brush)" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <ellipse cx="58" cy="11" rx="2.2" ry="1.8" fill="${t}"/>
  </svg>`,
};
RUNNER_SVG["-1"] = RUNNER_SVG[1];

/**
 * 결과 칩용 축소 실루엣 — 러너와 같은 몸 형태·같은 크기 비율을 쓰되 다리·진영
 * 반점처럼 칩 크기에서는 뭉개지는 디테일은 뺐다. fill="currentColor"라서 칩
 * 텍스트 색(밝은 잉크 / 선택 시 어두운 금색 위 글자색)을 그대로 따라간다 —
 * 먹색을 고정하면 어두운 카드 배경에서 실루엣이 안 보이기 때문이다.
 */
const CHIP_SVG = {
  1: `<svg viewBox="0 0 34 20" width="15" height="9" class="g">
    <ellipse cx="14" cy="10" rx="11" ry="7" fill="currentColor"/>
    <rect x="23" y="5" width="8" height="7" rx="3.2" fill="currentColor"/>
  </svg>`,
  2: `<svg viewBox="0 0 40 24" width="17" height="10" class="g">
    <ellipse cx="17" cy="14" rx="13" ry="6.5" fill="currentColor"/>
    <circle cx="30" cy="9" r="6" fill="currentColor"/>
    <path d="M25,4 L27,-1 L30,5 Z" fill="currentColor"/>
  </svg>`,
  3: `<svg viewBox="0 0 46 26" width="19" height="11" class="g">
    <ellipse cx="19" cy="15" rx="15" ry="7" fill="currentColor"/>
    <circle cx="8" cy="7" r="5.4" fill="currentColor"/>
    <circle cx="17" cy="4.6" r="5.8" fill="currentColor"/>
    <circle cx="27" cy="6" r="5.4" fill="currentColor"/>
    <circle cx="37" cy="12" r="6" fill="currentColor"/>
  </svg>`,
  4: `<svg viewBox="0 0 54 30" width="22" height="12" class="g">
    <rect x="8" y="8" width="34" height="16" rx="6" fill="currentColor"/>
    <circle cx="45" cy="12" r="7" fill="currentColor"/>
    <path d="M41,6 q-4,-6 1,-8" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M49,6 q4,-6 -1,-8" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  </svg>`,
  5: `<svg viewBox="0 0 64 40" width="27" height="17" class="g">
    <ellipse cx="26" cy="22" rx="18" ry="8" fill="currentColor"/>
    <path d="M40,16 C48,10 56,8 60,2 C58,10 52,14 46,18 Z" fill="currentColor"/>
    <circle cx="55" cy="10" r="6.5" fill="currentColor"/>
  </svg>`,
};
CHIP_SVG["-1"] = CHIP_SVG[1];

/** 판을 달리는 러너 SVG 문자열. t는 진영색(코/이마 반점). */
export function runnerIcon(v, tint) {
  return RUNNER_SVG[v](tint);
}

/** 결과 칩에 넣는 축소 실루엣 SVG 문자열. 칩 텍스트 색을 그대로 따라간다. */
export function chipIcon(v) {
  return CHIP_SVG[v];
}
