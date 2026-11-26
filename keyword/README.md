# 키워드 스팟 (Keyword Spot)

오늘의 수익형 키워드 대시보드. 라이브: https://whdcjs311-lab.github.io/ai-automation-landing/keyword/

## 구성

| 파일 | 역할 |
|---|---|
| `index.html` | 대시보드 본체 (디자인·표·AI 분석·상세 패널). 내장 폴백 데이터 포함 |
| `data.json` | 오늘자 데이터. **매일 갱신은 이 파일만 고치면 된다** |
| `build.py` | `data.json` → `index.html` 내장 폴백 주입 |

## 매일 갱신 루틴 (04:01 / 10:15)

1. `data.json` 의 `meta.updated`, `meta.updatedAt` 을 오늘 날짜로 바꾼다.
2. `keywords` 배열을 오늘 이슈 12~15개로 교체한다. 각 항목 필드:
   - `kw` 키워드 · `cat` 분야(쇼핑 커넥트 / 방송·연예 / 자동차·IT·AI / 투자·경제 / 체험단·리워드) · `ch` 채널
   - `signal` 검색 신호 근거 · `score` 0~100 · `money` 수익성 1~5 · `type` 수익 경로 · `why` 선정 이유 · `angle` 추천 제목
   - `detail.gold` 황금 롱테일 3개 · `detail.titles` 후킹 제목 3안 · `detail.hook` 상단 빨간 2줄
   - `detail.look` LOOK AI 5슬롯 코디(패션·뷰티일 때만, 아니면 `null`) · `detail.clip` 클립 3초 훅 대본
3. `strategy` 10줄을 오늘 실행 순서로 고친다.
4. 임베드 갱신: `python3 keyword/build.py`
5. 커밋·푸시하면 GitHub Pages(레거시 빌드)가 자동 배포한다.

`data.json` 만 고치고 `build.py` 를 건너뛰어도 라이브 페이지는 `fetch('./data.json')` 으로 최신 데이터를 읽는다. `build.py` 는 HTML 파일 하나만 내려받아 로컬에서 열 때 쓰는 폴백을 맞추는 용도다.

## AI 분석

입력한 키워드를 `https://ai-automation-landing-kohl.vercel.app/api/gemini` (Vercel 서버리스 프록시)로 보내 황금 키워드·제목·후킹 2줄·코디 슬롯·클립 대본·2,000자 뼈대를 JSON으로 받아 표 맨 위에 추가한다.
- 엔드포인트 변경: `keyword/?api=https://...`
- AI 미연결·오류 시 로컬 템플릿 분석으로 자동 대체
- `?data=off` 로 열면 내장 폴백 데이터만으로 동작(폴백 점검용)
