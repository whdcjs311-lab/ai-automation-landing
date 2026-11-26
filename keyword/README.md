# 키워드 스팟 (Keyword Spot)

오늘의 수익형 키워드 대시보드. 라이브: https://whdcjs311-lab.github.io/ai-automation-landing/keyword/

## 구성

| 파일 | 역할 |
|---|---|
| `index.html` | 대시보드 본체 (디자인·표·AI 분석·상세 패널). 내장 폴백 데이터 포함 |
| `data.json` | 현재 데이터. **갱신은 이 파일만 고치면 된다** |
| `update_hourly.py` | 실시간 피드 → 분류·스코어링 → `data.json` → `build.py` (매시간 자동) |
| `build.py` | `data.json` → `index.html` 내장 폴백 주입 |

## 매시간 자동 갱신 (GitHub Actions)

`.github/workflows/update-keywords.yml` 이 **매시간 정각마다** `python3 keyword/update_hourly.py` 를 실행하고,
변경이 있으면 `keyword/data.json`·`keyword/index.html` 을 커밋·푸시한다. GitHub Pages(레거시 빌드)가 자동 배포한다.

- 실행: 매시간 정각(`cron: '0 * * * *'`) + 수동 실행(`workflow_dispatch`)
- 수동 실행: `gh workflow run update-keywords.yml -R whdcjs311-lab/ai-automation-landing`
- 직접 돌려보기: `python3 keyword/update_hourly.py` (`--dry-run` 은 파일을 건드리지 않고 결과만 출력)

### 수집 소스 (모두 공개 피드, 표준 라이브러리만 사용)

| 소스 | 주소 | 쓰임 |
|---|---|---|
| 구글 트렌드 한국 실시간 검색어 | `trends.google.com/trending/rss?geo=KR` | 급상승 검색어·검색량(`approx_traffic`) 가중치 |
| 구글 뉴스 한국 토픽 RSS | `news.google.com/rss/headlines/section/topic/{BUSINESS,ENTERTAINMENT,TECHNOLOGY,NATION}` | 경제·연예·IT/과학·대한민국 기사 제목 |
| 구글 뉴스 검색 RSS | `news.google.com/rss/search?q={패션,할인,체험단,연말정산}` | 쇼핑·체험단 지면 보강 |

### 처리 순서

1. 9개 피드를 읽어 기사 600~700건 + 트렌드 10건을 모은다.
2. `PROFILES`(주제 사전 30여 개)로 기사 제목을 분류한다. **실시간 피드 본문에 실제로 등장한 표현만** 키워드가 된다.
3. 사전에 없는 생활 주제는 `THEMES` 로 2건 이상 반복될 때만 후보에 올린다.
4. 중복 제거(포함 관계), 분야 균형(한 분야 최대 6개·분야별 최소 2개) 후 점수순 상위 15개를 고른다.
5. 점수 = 검색량 + 기사 확산 + 수익성 + 시즌 + 최신성. `signal`·`why` 에는 실제 기사 근거를 남긴다.
6. 상세 패널(`detail.gold/titles/hook/look/clip`, `outline`)까지 채우고 `updatedAt` 에 KST 시각을 기록한다.
7. `python3 keyword/build.py` 로 `index.html` 내장 폴백을 맞춘다.

`data.json` 만 고치고 `build.py` 를 건너뛰어도 라이브 페이지는 `fetch('./data.json')` 으로 최신 데이터를 읽는다. `build.py` 는 HTML 파일 하나만 내려받아 로컬에서 열 때 쓰는 폴백을 맞추는 용도다.

## 수동으로 문안을 손볼 때

새벽 4:01 성과 분석 작업이 AI로 정리한 키워드를 넣는 경우처럼, 손으로 다듬은 데이터는 다음 정각 자동 갱신 때 실시간 데이터로 교체된다.
손으로 넣은 값을 유지하려면 그 시간대의 워크플로를 잠시 멈추거나(`gh workflow disable update-keywords.yml`) 사전(`PROFILES`)을 고치는 편이 낫다.

## AI 분석

입력한 키워드를 `https://ai-automation-landing-kohl.vercel.app/api/gemini` (Vercel 서버리스 프록시)로 보내 황금 키워드·제목·후킹 2줄·코디 슬롯·클립 대본·2,000자 뼈대를 JSON으로 받아 표 맨 위에 추가한다.
- 엔드포인트 변경: `keyword/?api=https://...`
- AI 미연결·오류 시 로컬 템플릿 분석으로 자동 대체
- `?data=off` 로 열면 내장 폴백 데이터만으로 동작(폴백 점검용)

## 출처 표기

키워드·점수는 구글 트렌드와 구글 뉴스 공개 RSS에서 뽑은 관측값이다. 기사 제목·언론사는 `signal` 에 그대로 남기며, 원문은 각 언론사에 있다. 뉴스 제목을 인용한 상세 문안은 발행 전 사실 확인이 필요하다.
