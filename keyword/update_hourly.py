#!/usr/bin/env python3
"""키워드 스팟 — 매시간 실시간 키워드 자동 갱신.

공개 실시간 피드(구글 트렌드 한국 + 구글 뉴스 한국 토픽 RSS)를 표준 라이브러리만으로
읽어 중복 제거·분류·스코어링한 뒤 상위 15개 키워드로 keyword/data.json 을 다시 쓰고,
keyword/build.py 로 index.html 내장 폴백까지 맞춘다.

사용법:
    python3 keyword/update_hourly.py            # 수집 → data.json → build.py
    python3 keyword/update_hourly.py --dry-run  # 수집·생성만 하고 파일은 건드리지 않음
    python3 keyword/update_hourly.py --no-build # data.json 만 갱신

GitHub Actions(.github/workflows/update-keywords.yml)에서 매시간 정각에 실행된다.
모든 피드를 하나도 못 읽으면 data.json 을 건드리지 않고 종료 코드 1로 끝난다.
"""
from __future__ import annotations

import json
import math
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data.json"
BUILD = HERE / "build.py"
KST = timezone(timedelta(hours=9))
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36 KeywordSpot/1.0"
)
NS_HT = "{https://trends.google.com/trending/rss}"

CATS = ["쇼핑 커넥트", "방송·연예", "자동차·IT·AI", "투자·경제", "체험단·리워드"]
CH_OF = {
    "쇼핑 커넥트": "쇼핑 커넥트",
    "방송·연예": "애드포스트",
    "자동차·IT·AI": "애드포스트",
    "투자·경제": "애드포스트",
    "체험단·리워드": "공통",
}
MONEY_OF = {"쇼핑 커넥트": 5, "방송·연예": 3, "자동차·IT·AI": 3, "투자·경제": 4, "체험단·리워드": 3}
TYPE_OF = {
    "쇼핑 커넥트": "쇼핑 커넥트 · 시즌 상품",
    "방송·연예": "애드포스트 · 연예 이슈 트래픽",
    "자동차·IT·AI": "애드포스트 · IT 정보성",
    "투자·경제": "금융 광고·증권 제휴",
    "체험단·리워드": "리워드 정보 · 체험단",
}

def _topic(url: str) -> str:
    return f"https://news.google.com/rss/headlines/section/topic/{url}?hl=ko&gl=KR&ceid=KR:ko"


def _search(q: str) -> str:
    return (
        "https://news.google.com/rss/search?q="
        + urllib.parse.quote(q)
        + "&hl=ko&gl=KR&ceid=KR:ko"
    )


FEEDS = [
    ("trends", "https://trends.google.com/trending/rss?geo=KR", "구글 트렌드"),
    ("news", _topic("BUSINESS"), "경제"),
    ("news", _topic("ENTERTAINMENT"), "연예"),
    ("news", _topic("TECHNOLOGY"), "IT·과학"),
    ("news", _topic("NATION"), "대한민국"),
    # 쇼핑·체험단 지면은 토픽 피드에 없어서 검색 피드로 보강한다(패션·할인·체험단·연말정산).
    ("news", _search("패션"), "쇼핑"),
    ("news", _search("할인"), "쇼핑"),
    ("news", _search("체험단"), "체험단"),
    ("news", _search("연말정산"), "연말정산"),
]
TOPIC_PRIOR = {
    "경제": "투자·경제",
    "연예": "방송·연예",
    "IT·과학": "자동차·IT·AI",
    "쇼핑": "쇼핑 커넥트",
    "체험단": "체험단·리워드",
    "연말정산": "투자·경제",
}

# ---------------------------------------------------------------------------
# 주제 사전 — 실제 피드 본문에서 매칭된 표현만 키워드로 올린다.
# 각 항목: 정규식(실시간 기사·검색어에서 매칭) + 표시 키워드 + 분야 + 상세 패널 문안.
# ---------------------------------------------------------------------------
PROFILES = [
    dict(
        key="rate",
        re=r"기준금리|한국은행|한은|금통위|금리|콜금리",
        kw="기준금리", cat="투자·경제", money=5, type="금융 광고·증권 제휴",
        angle="금리 숫자 하나로 달라지는 내 대출이자·예금 계산",
        gold=["기준금리 결정 이후 대출 이자 계산", "금리 방향 바뀔 때 예금·적금 갈아타는 순서",
              "금통위 결정문에서 확인할 문장"],
        titles=["기준금리 뉴스, 내 대출이자부터 확인하세요",
                "금리 뉴스만 보고 넘기면 손해인 3가지",
                "한은이 금리를 정한 이유, 물가보다 먼저 볼 숫자"],
        hook=["금리 뉴스가 또 나왔습니다.", "문제는 이게 내 통장에서 빠져나갈 돈과 연결돼 있다는 겁니다."],
        clip="0~3초: \"기준금리, 남 일 아닙니다\" / 3~10초: 변동금리 1억 원 기준 0.25%p 차이 설명 / "
             "10~20초: 은행 앱에서 확인할 3가지(금리 조건·우대금리·중도상환수수료) / 마무리: \"오늘 앱 한 번만 열어보세요\"",
    ),
    dict(
        key="kospi",
        re=r"코스피|코스닥|증시|주가|사이드카|나스닥|지수\s*(?:급락|급등|하락|상승)",
        kw="코스피", cat="투자·경제", money=4, type="증권·ETF 제휴",
        angle="급락·급등장에서 개인이 확인할 건 예측이 아니라 순서",
        gold=["코스피 급락 이유 정리", "매도 사이드카 발동 뜻", "흔들리는 장에서 개인이 확인할 3가지"],
        titles=["코스피 흔들릴 때 필요한 건 예측이 아닙니다",
                "지수가 빠진 날, 계좌에서 먼저 볼 숫자",
                "사이드카까지 나온 날 초보가 하면 안 되는 행동"],
        hook=["지수 뉴스가 쏟아지는 날입니다.", "이럴 때 필요한 건 예측이 아니라 점검 순서입니다."],
        clip="0~3초: \"지수 급락, 이때 하면 안 되는 행동\" / 3~10초: 사이드카가 뭔지 한 줄 / "
             "10~18초: 계좌 점검 3단계 / 마무리: \"매수·매도 추천은 하지 않습니다, 숫자만 확인\"",
    ),
    dict(
        key="fx",
        re=r"환율|원달러|원·달러|달러\s*(?:강세|약세|환율)|엔화|위안화",
        kw="환율", cat="투자·경제", money=4, type="환전·해외결제 제휴",
        angle="환율이 오르면 달라지는 여행·유학·직구 비용",
        gold=["원달러 환율 오르면 생기는 일", "환전 타이밍 판단 기준", "환율과 수입 물가의 관계"],
        titles=["환율 올랐는데 남 일 같다면, 이 3개만 보세요",
                "달러 살까 말까, 답은 목적에 있습니다",
                "환율 뉴스가 내 장바구니 가격을 바꾸는 이유"],
        hook=["환율 뉴스가 또 나왔습니다.", "여행·유학·직구 계획이 있다면 지금 확인할 게 있습니다."],
        clip="0~3초: \"환율 오르면 누가 손해일까\" / 3~10초: 여행·유학·직구 영향 / "
             "10~18초: 환전을 나눠 하는 기준 / 마무리: \"필요한 날 기준으로만 판단\"",
    ),
    dict(
        key="cpi",
        re=r"소비자물가|물가\s*(?:상승|둔화|3|4)|CPI|PCE|생활물가",
        kw="물가", cat="투자·경제", money=4, type="금융 광고·생활 정보",
        angle="체감 물가를 숫자로 확인하는 방법",
        gold=["소비자물가 상승률 읽는 법", "장바구니 물가 비교 기준", "물가와 금리의 연결 구조"],
        titles=["물가 뉴스, 숫자보다 먼저 볼 게 있습니다",
                "장바구니가 비싸진 진짜 이유 정리",
                "물가가 오르면 내 월급은 어떻게 되나"],
        hook=["물가 뉴스가 또 나왔습니다.", "체감과 숫자가 다른 이유부터 정리했습니다."],
        clip="0~3초: \"물가 3%대, 체감은 왜 더 클까\" / 3~10초: 지표와 장바구니 차이 / "
             "10~18초: 고정비 점검 3곳 / 마무리: \"다음 발표일 달력에 저장\"",
    ),
    dict(
        key="crypto",
        re=r"비트코인|이더리움|가상자산|코인\s*(?:거래소|시장)|업비트|빗썸",
        kw="비트코인", cat="투자·경제", money=4, type="거래소·지갑 제휴",
        angle="가격보다 먼저 확인할 보관·수수료 구조",
        gold=["비트코인 급등락 때 확인할 것", "가상자산 거래소 수수료 비교", "코인 지갑 보관 3단계"],
        titles=["비트코인 또 출렁였습니다, 지금 확인할 건 가격이 아닙니다",
                "코인 뉴스 볼 때 이 3개만은 꼭 보세요",
                "거래소에 코인 두기 전에 점검할 것"],
        hook=["코인 가격 뉴스가 또 나왔습니다.", "이때 필요한 건 예측이 아니라 보관·수수료 점검입니다."],
        clip="0~3초: \"코인 급등락, 이때 하면 안 되는 것\" / 3~10초: 수수료·출금 구조 한 줄 / "
             "10~18초: 2차 인증·출금 주소 점검 / 마무리: \"투자 권유 아닙니다, 점검만\"",
    ),
    dict(
        key="realestate",
        re=r"아파트|집값|전세|월세|재건축|분양|부동산",
        kw="아파트 집값", cat="투자·경제", money=4, type="부동산 정보·대출 제휴",
        angle="지역별 실거래가로 확인하는 방법",
        gold=["이번 주 아파트 실거래가 확인법", "전세·월세 전환 계산", "청약 조건 한 번에 정리"],
        titles=["집값 뉴스, 우리 동네 숫자로 확인하는 법",
                "전세로 갈까 월세로 갈까, 계산은 이렇게",
                "부동산 기사에서 내게 해당하는 부분만 골라보기"],
        hook=["부동산 뉴스가 또 쏟아졌습니다.", "내 지역·내 조건에 해당하는 숫자만 골라봤습니다."],
        clip="0~3초: \"집값 뉴스, 내 동네는?\" / 3~10초: 실거래가 확인 경로 / "
             "10~18초: 전세·월세 전환 계산 예시 / 마무리: \"계약 전 등기부등본 확인\"",
    ),
    dict(
        key="pension",
        re=r"국민연금|연금\s*개혁|퇴직연금|노후\s*연금|기초연금",
        kw="연금", cat="투자·경제", money=4, type="보험·재무 제휴",
        angle="제도가 바뀌면 내 수령액이 어떻게 달라지는지",
        gold=["연금 개혁 시나리오별 수령액", "국민연금 예상 수령액 조회", "퇴직연금 굴리는 순서"],
        titles=["연금 개혁, 내 수령액이 달라지는 지점",
                "노후 준비, 지금 확인해야 할 숫자 3개",
                "연금 뉴스가 어려운 건 숫자가 두 개이기 때문입니다"],
        hook=["연금 뉴스가 또 나왔습니다.", "문제는 내 수령액이 숫자로만 말해준다는 겁니다."],
        clip="0~3초: \"내 연금, 얼마 받을까\" / 3~10초: 예상 수령액 조회 경로 / "
             "10~20초: 개인이 확인할 3개 숫자 / 마무리: \"제도 확정 전까진 계산 예시로만\"",
    ),
    dict(
        key="oil",
        re=r"유가|기름값|휘발유|경유|주유소|국제유가",
        kw="기름값", cat="투자·경제", money=3, type="생활 정보·차량 제휴",
        angle="이번 주 주유 타이밍과 유류비 계산",
        gold=["이번 주 전국 기름값 확인", "유가 오를 때 유류비 줄이는 법", "주유소 가격 비교 기준"],
        titles=["기름값 또 올랐습니다, 이번 주에 넣을까요",
                "유류비 아끼는 건 가격보다 습관입니다",
                "유가 뉴스에서 내 차에 해당하는 숫자만 보기"],
        hook=["기름값 소식이 올라왔습니다.", "한 번 주유에 얼마 차이 나는지 계산해봤습니다."],
        clip="0~3초: \"기름값 오를 때, 오늘 넣을까?\" / 3~10초: 리터당 차이 계산 / "
             "10~18초: 가까운 주유소 비교 3곳 / 마무리: \"주유 전 앱 확인\"",
    ),
    dict(
        key="tariff",
        re=r"관세|무역\s*(?:협상|분쟁)|수출\s*규제|공급망|반도체\s*관세",
        kw="관세", cat="투자·경제", money=4, type="산업·증권 정보",
        angle="관세 발표가 국내 산업·주가에 닿는 경로",
        gold=["관세 발표가 국내 기업에 미치는 영향", "품목별 관세율 확인 방법", "환율·관세 함께 볼 때 순서"],
        titles=["관세 뉴스, 우리 회사·내 주식에 어떻게 닿나",
                "관세율 숫자만 보면 놓치는 것",
                "수출 기업 뉴스가 내 계좌에 닿는 경로"],
        hook=["관세 뉴스가 또 나왔습니다.", "문제는 이게 환율과 주가까지 이어진다는 겁니다."],
        clip="0~3초: \"관세 몇 %, 내 주식에 무슨 일\" / 3~10초: 품목·국가별 차이 / "
             "10~18초: 확인할 공식 자료 2곳 / 마무리: \"원문 발표부터 확인\"",
    ),
    dict(
        key="awards",
        re=r"청룡|대종상|백상|영화제|시상식|그래미|아카데미|작품상|주연상",
        kw="영화제 시상식", cat="방송·연예", money=3, type="애드포스트 · 연예 이슈 트래픽",
        angle="수상작 정주행 리스트와 배우별 필모 정리",
        gold=["수상작 정주행 순서", "주연상 배우 필모 정리", "심사 결과에서 갈린 작품 비교"],
        titles=["올해 시상식에서 화제된 작품, 아직 안 봤다면 이 순서로",
                "수상 결과만 보고 끝내면 아까운 이유",
                "주연상 받은 배우 작품, 3편만 골랐습니다"],
        hook=["올해 시상식 결과가 쏟아졌습니다.", "그런데 정작 수상작을 못 본 사람이 더 많다는 게 함정입니다."],
        clip="0~3초: \"올해 시상식, 이 작품이 다 가져갔습니다\" / 3~8초: 주요 수상 부문 3개 / "
             "8~15초: 정주행 순서 추천 / 마무리: \"주말에 뭐 볼지 고민이면 저장\"",
    ),
    dict(
        key="drama",
        re=r"드라마|몇부작|시청률|제작발표회|캐스팅|출연진|넷플릭스\s*(?:공개|신작)",
        kw="드라마", cat="방송·연예", money=3, type="애드포스트 · 드라마 정보성",
        angle="몇부작·공개 시간·원작 차이 정리",
        gold=["몇부작·공개 시간 정리", "원작과 달라진 점", "등장인물 관계 한 장 정리"],
        titles=["보기 전에 이것부터, 몇부작·공개 시간 정리",
                "원작과 뭐가 달라졌나, 초반 몰입 포인트",
                "볼까 말까 고민될 때 판단 기준"],
        hook=["새 드라마가 화제입니다.", "보기 전에 이걸 모르면 초반에 몰입이 끊깁니다."],
        clip="0~3초: \"이 드라마 볼까?\" / 3~8초: 배우·장르 한 줄 요약 / "
             "8~15초: 원작과 다른 점 / 마무리: \"몇부작인지 확인하고 시작\"",
    ),
    dict(
        key="variety",
        re=r"예능|시청률\s*(?:1위|최고)|출연\s*논란|방송\s*중계|생방송",
        kw="예능", cat="방송·연예", money=3, type="애드포스트 · 방송 정보성",
        angle="화제 장면과 다시 보기 방법 정리",
        gold=["화제 장면 다시 보기 경로", "출연진·회차 정보 정리", "시청률로 본 인기 구간"],
        titles=["오늘 예능 화제 장면, 다시 보는 방법",
                "시청률보다 중요한 건 장면입니다",
                "이 회차만 봐도 되는 이유 정리"],
        hook=["오늘 방송이 화제입니다.", "다시 볼 사람을 위해 장면만 정리했습니다."],
        clip="0~3초: \"오늘 이 장면 보셨나요\" / 3~8초: 화제 장면 요약 / "
             "8~15초: 다시 보기 경로 / 마무리: \"본방 놓쳤으면 저장\"",
    ),
    dict(
        key="concert",
        re=r"콘서트|월드투어|내한|티켓팅|예매\s*오픈|공연",
        kw="콘서트 티켓팅", cat="방송·연예", money=3, type="애드포스트 · 공연 정보",
        angle="예매 일정과 좌석·취소표 확인 순서",
        gold=["티켓팅 일정과 예매처 정리", "좌석 등급별 시야 비교", "취소표 나오는 시간대"],
        titles=["티켓팅 앞두고 꼭 확인할 3가지",
                "좌석 등급, 비싼 자리가 꼭 좋은 건 아닙니다",
                "취소표 잡는 사람들의 공통점"],
        hook=["티켓팅 소식이 나왔습니다.", "준비 없이 들어가면 좌석부터 놓칩니다."],
        clip="0~3초: \"티켓팅, 이거 모르면 놓칩니다\" / 3~9초: 예매 일정·예매처 / "
             "9~18초: 좌석 등급 비교 / 마무리: \"알림 설정부터\"",
    ),
    dict(
        key="idol",
        re=r"컴백|신곡|앨범|아이돌|월드투어|뮤직비디오|차트\s*1위",
        kw="아이돌 컴백", cat="방송·연예", money=3, type="애드포스트 · 음악 이슈",
        angle="신곡·앨범 구성과 감상 포인트 정리",
        gold=["신곡·앨범 트랙 구성", "뮤직비디오 해석 포인트", "음악방송 컴백 일정"],
        titles=["컴백했습니다, 먼저 들을 곡부터",
                "이번 앨범에서 달라진 점 3가지",
                "뮤직비디오에 숨은 장면 정리"],
        hook=["컴백 소식이 떴습니다.", "어디서부터 봐야 할지 정리했습니다."],
        clip="0~3초: \"컴백, 이 곡부터 들으세요\" / 3~9초: 타이틀곡 한 줄 / "
             "9~16초: 앨범 구성 포인트 / 마무리: \"플레이리스트 저장\"",
    ),
    dict(
        key="movie",
        re=r"영화\s*(?:개봉|흥행|관객)|박스오피스|시사회|극장가",
        kw="영화 흥행", cat="방송·연예", money=3, type="애드포스트 · 영화 정보성",
        angle="관객수·상영관·쿠키영상까지 실용 정보만",
        gold=["이번 주 박스오피스 순위", "영화 관람 전 쿠키영상 여부", "상영관·포맷별 관람료 비교"],
        titles=["이번 주 극장가, 이 영화부터 보세요",
                "관객수만 보고 고르면 놓치는 영화",
                "영화관 가기 전에 확인할 3가지"],
        hook=["극장가 순위 소식이 올라왔습니다.", "관객수와 재미는 다를 때가 많습니다."],
        clip="0~3초: \"이번 주 극장가, 뭐 볼까\" / 3~9초: 박스오피스 3편 / "
             "9~16초: 포맷·쿠키영상 정보 / 마무리: \"주말 영화 정리\"",
    ),
    dict(
        key="ai",
        re=r"(?<![A-Za-z])AI(?![A-Za-z])|인공지능|챗GPT|제미나이|LLM|에이전트|오픈AI",
        kw="AI", cat="자동차·IT·AI", money=3, type="애드포스트 · IT 정보성",
        angle="새 AI 기능이 내 업무·일상에 닿는 지점",
        gold=["새 AI 기능 핵심 정리", "무료로 쓸 수 있는 범위", "업무에 바로 쓰는 활용 3가지"],
        titles=["AI 새 기능, 써보기 전에 알아둘 것",
                "이 AI 기능이 내 업무를 바꾸는 지점",
                "무료와 유료, 지금은 어디까지 되나"],
        hook=["AI 새 소식이 또 나왔습니다.", "핵심은 기능이 아니라 내가 어디에 쓰느냐입니다."],
        clip="0~3초: \"이 AI 기능, 진짜 쓸만할까\" / 3~10초: 핵심 기능 한 줄 / "
             "10~18초: 바로 쓰는 활용 3가지 / 마무리: \"오늘 하나만 써보기\"",
    ),
    dict(
        key="chip",
        re=r"반도체|삼성전자|SK하이닉스|HBM|파운드리|엔비디아",
        kw="반도체", cat="자동차·IT·AI", money=4, type="증권·산업 정보",
        angle="공장·수주 뉴스가 실적과 주가로 이어지는 경로",
        gold=["반도체 수출·실적 지표 확인", "HBM 수요가 의미하는 것", "관련주 볼 때 확인할 공시"],
        titles=["반도체 뉴스, 실적과 주가로 이어지는 경로",
                "수출 숫자 하나로 읽는 업황",
                "기사에 나온 공장·수주, 어디서 확인하나"],
        hook=["반도체 소식이 연일 나옵니다.", "이게 실적과 주가로 이어지는 경로를 정리했습니다."],
        clip="0~3초: \"반도체 뉴스, 어디까지 사실일까\" / 3~10초: 수출·실적 지표 / "
             "10~18초: 공시 확인 경로 / 마무리: \"원문 공시부터\"",
    ),
    dict(
        key="ev",
        re=r"전기차|자율주행|현대차|기아|배터리|충전소|자동차\s*(?:수출|판매)",
        kw="전기차", cat="자동차·IT·AI", money=4, type="자동차 정보·보험 제휴",
        angle="보조금·충전 요금까지 포함한 실제 비용",
        gold=["전기차 보조금 조건 정리", "충전 요금 비교", "자율주행 기능 단계 구분"],
        titles=["전기차 살까 말까, 계산부터 해봤습니다",
                "보조금 조건, 이걸 모르면 못 받습니다",
                "자율주행 뉴스에서 실제로 달라진 것"],
        hook=["전기차 소식이 또 나왔습니다.", "차값보다 총비용이 결정합니다."],
        clip="0~3초: \"전기차, 진짜 싼 걸까\" / 3~10초: 보조금·충전비 계산 / "
             "10~18초: 유지비 비교 / 마무리: \"내 주행거리로 계산\"",
    ),
    dict(
        key="phone",
        re=r"아이폰|갤럭시|스마트폰|iOS|안드로이드|통신사",
        kw="아이폰·갤럭시", cat="자동차·IT·AI", money=3, type="통신·기기 정보",
        angle="바꿀 때 확인할 지원 종료·중고 시세",
        gold=["새 기기 사양 핵심만", "지금 쓰는 기기 지원 종료일", "중고 시세 비교"],
        titles=["바꿀까 말까, 이 숫자부터 보세요",
                "새 폰 발표, 내 폰은 언제까지 쓸 수 있나",
                "기기 교체 전에 확인할 3가지"],
        hook=["아이폰·갤럭시 소식이 나왔습니다.", "바꿀지 말지는 사양보다 이 숫자가 결정합니다."],
        clip="0~3초: \"새 폰, 바꿔야 할까\" / 3~10초: 지원 종료·중고 시세 / "
             "10~18초: 통신 요금 비교 / 마무리: \"중고 시세 먼저 확인\"",
    ),
    dict(
        key="security",
        re=r"해킹|랜섬웨어|개인정보\s*유출|피싱|보안\s*사고|2차\s*인증",
        kw="해킹·보안", cat="자동차·IT·AI", money=4, type="보안·계정 보호 정보",
        angle="공포 조장 없이 오늘 점검할 계정 3곳",
        gold=["내 계정 유출 여부 확인", "2차 인증 설정 순서", "비밀번호 관리 점검"],
        titles=["해킹 뉴스 나올 때마다 해야 할 계정 점검",
                "유출됐는지 확인하는 방법, 3분이면 됩니다",
                "비밀번호 바꾸기보다 먼저 할 일"],
        hook=["보안 사고 소식이 또 나왔습니다.", "불안만 키우지 말고 오늘 점검할 것만 정리했습니다."],
        clip="0~3초: \"내 계정, 털렸을까?\" / 3~10초: 유출 확인 경로 / "
             "10~18초: 2차 인증 설정 / 마무리: \"3분만 투자\"",
    ),
    dict(
        key="blackfriday",
        re=r"블랙프라이데이|블프|추수감사절|사이버먼데이|연말\s*세일|할인\s*전쟁",
        kw="블랙프라이데이", cat="쇼핑 커넥트", money=5, type="쇼핑 커넥트 · 시즌 세일",
        angle="할인율보다 '내 사이즈 남았나'로 고르는 순서",
        gold=["블랙프라이데이 아우터 득템 리스트", "세일에서 거르는 기준 3가지", "결제 전 확인할 배송·반품 조건"],
        titles=["블프라고 다 싸지 않습니다, 이 3개만 보세요",
                "작년에 놓친 것, 올해는 이 순서로 담으면 됩니다",
                "할인율 70%보다 중요한 건 결제 전 이 숫자입니다"],
        hook=["블랙프라이데이 관련 소식이 쏟아집니다.", "지금 담지 않으면 내 사이즈부터 사라집니다."],
        clip="0~3초: \"블프에 아우터 사려면 이 순서로\" / 3~8초: 사이즈 잔여 확인 화면 / "
             "8~15초: 실측·충전재·반품비 체크 / 마무리: \"장바구니 미리 정리\"",
        look=["아우터 — 숏패딩 또는 무스탕 1벌로 승부", "상의 — 기모 맨투맨·단색 니트",
              "하의 — 와이드 슬랙스·기모 데님", "신발 — 첼시부츠·청키 스니커즈",
              "액세서리 — 비니·머플러는 아우터 색에 맞추기"],
    ),
    dict(
        key="outer",
        re=r"패딩|아우터|코트|무스탕|숏패딩|자켓|재킷",
        kw="겨울 아우터", cat="쇼핑 커넥트", money=5, type="쇼핑 커넥트 · 패션 아우터",
        angle="충전재·총장·실측으로 거르는 아우터",
        gold=["겨울 아우터 가격대별 비교", "충전재·필파워 확인법", "사이즈 실패 안 하는 법"],
        titles=["아우터는 가격만 보고 사면 한 철 쓰고 버립니다",
                "3만 원대가 15만 원대보다 나은 경우",
                "출근룩으로 입을 아우터 고르는 기준"],
        hook=["아우터 시즌이 시작됐습니다.", "충전재보다 먼저 봐야 할 숫자가 있습니다."],
        clip="0~3초: \"아우터, 이 숫자 모르면 돈 버립니다\" / 3~10초: 충전재 g수·실측 확인 / "
             "10~18초: 가격대별 비교 / 마무리: \"사이즈표 캡처\"",
        look=["아우터 — 총장 짧게, 어깨선 확인", "상의 — 얇은 니트·기모 맨투맨 한 겹",
              "하의 — 와이드 슬랙스로 부피 상쇄", "신발 — 스니커즈로 캐주얼하게",
              "액세서리 — 가방은 작게, 색은 무채색"],
    ),
    dict(
        key="knit",
        re=r"니트|맨투맨|가디건|기모|후드|와이드팬츠|슬랙스",
        kw="겨울 니트", cat="쇼핑 커넥트", money=4, type="쇼핑 커넥트 · 패션 상의",
        angle="원단·두께·핏으로 고르는 겨울 상의",
        gold=["겨울 니트 소재별 차이", "기모 맨투맨 보풀 없이 입는 법", "핏 망가지지 않는 세탁법"],
        titles=["겨울 니트, 두꺼울수록 좋은 게 아닙니다",
                "기모 입었는데 더 추운 이유",
                "출근·데이트 둘 다 되는 니트 한 벌"],
        hook=["겨울 상의는 소재에서 갈립니다.", "핏이 무너지는 건 두께 때문입니다."],
        clip="0~3초: \"겨울 니트, 두꺼우면 실패합니다\" / 3~9초: 소재별 차이 / "
             "9~16초: 세탁·보관법 / 마무리: \"소재표 확인\"",
        look=["아우터 — 짧은 패딩·무스탕", "상의 — 니트는 어깨선 먼저",
              "하의 — 기모 와이드 1벌", "신발 — 첼시부츠·로퍼",
              "액세서리 — 벨트 생략, 가방 미니로"],
    ),
    dict(
        key="christmas",
        re=r"크리스마스|연말\s*(?:분위기|장식)|트리|룸\s*데코|인테리어\s*소품",
        kw="크리스마스 소품", cat="쇼핑 커넥트", money=4, type="쇼핑 커넥트 · 시즌 리빙",
        angle="1만 원대 소품으로 만드는 크리스마스 무드",
        gold=["크리스마스 소형 트리 추천", "원룸 크리스마스 인테리어", "전구 색 조합과 배치"],
        titles=["원룸에 1만 원대로 크리스마스 만드는 법",
                "트리보다 먼저 사야 하는 소품이 있습니다",
                "12월에 사면 비싼 것들, 지금 사면 다른 가격입니다"],
        hook=["크리스마스 분위기는 트리보다 조명에서 갈립니다.", "같은 소품도 12월 첫째 주에는 더 비쌉니다."],
        clip="0~3초: \"1만 원으로 크리스마스 만드는 법\" / 3~10초: 전구 3색 비교 / "
             "10~18초: 소품 배치 3곳 / 마무리: \"장바구니 미리 담기\"",
    ),
    dict(
        key="appliance",
        re=r"(?<![가-힣])가전|청소기|공기청정기|건조기|에어프라이어|식기세척기|냉장고",
        kw="생활가전", cat="쇼핑 커넥트", money=4, type="쇼핑 커넥트 · 생활가전",
        angle="소비전력·소음·필터비까지 본 실제 유지비",
        gold=["생활가전 가격대별 비교", "유지비 계산법(전기·필터)", "설치 조건 체크"],
        titles=["가전은 가격보다 유지비가 큽니다",
                "이 가전, 우리 집에 정말 필요한가",
                "설치 전에 확인 안 하면 반품하는 조건"],
        hook=["가전 세일 소식이 자주 보입니다.", "정가보다 유지비가 더 큽니다."],
        clip="0~3초: \"가전, 이거 모르고 사면 후회\" / 3~10초: 전기·필터 비용 / "
             "10~18초: 설치 조건 3개 / 마무리: \"실측부터\"",
    ),
    dict(
        key="beauty",
        re=r"화장품|올리브영|스킨케어|향수|립스틱|틴트|세럼|뷰티",
        kw="뷰티템", cat="쇼핑 커넥트", money=4, type="쇼핑 커넥트 · 뷰티",
        angle="성분·용량당 가격으로 비교하는 뷰티템",
        gold=["뷰티템 성분 비교", "용량당 가격 계산", "계절별 스킨케어 순서"],
        titles=["뷰티템, 비싼 게 답은 아닙니다",
                "성분표에서 먼저 볼 항목 3개",
                "겨울에 순서 바꾸면 달라지는 것"],
        hook=["뷰티 랭킹 소식이 또 나왔습니다.", "성분과 용량으로 다시 계산해봤습니다."],
        clip="0~3초: \"이 뷰티템, 값어치 있나\" / 3~9초: 성분·용량 비교 / "
             "9~16초: 순서 팁 / 마무리: \"내 피부 타입부터\"",
        look=["아우터 — 단정한 코트", "상의 — 무채색 니트", "하의 — 와이드 슬랙스",
              "신발 — 로퍼", "액세서리 — 작은 골드 포인트"],
    ),
    dict(
        key="card",
        re=r"카드\s*(?:혜택|발급|비교)|포인트\s*(?:적립|전환)|캐시백|환급|리워드|교통비",
        kw="카드 혜택", cat="체험단·리워드", money=3, type="리워드 정보 · 금융 제휴",
        angle="혜택 조건과 실적 기준 정리",
        gold=["카드 혜택 조건 비교", "실적 채우는 순서", "포인트 전환 손해 안 보는 법"],
        titles=["카드 혜택, 조건 안 읽으면 못 받습니다",
                "한 달에 얼마 써야 남는 카드인가",
                "포인트, 이렇게 쓰면 손해입니다"],
        hook=["카드 혜택 소식이 또 나왔습니다.", "신청 전에 조건부터 확인하세요."],
        clip="0~3초: \"이 카드, 진짜 남는 장사일까\" / 3~10초: 실적·한도 조건 / "
             "10~18초: 내 소비로 계산 / 마무리: \"약관 확인\"",
    ),
    dict(
        key="trip",
        re=r"여행|숙소|호텔|리조트|스키장|항공권|체험단\s*모집|펜션",
        kw="여행·숙소", cat="체험단·리워드", money=3, type="체험단·리조트 제휴",
        angle="예약 전 취소 규정·추가 요금 확인",
        gold=["숙소 예약 전 확인할 3가지", "성수기 요금 비교", "체험단 신청 순서"],
        titles=["예약 전에 이거 안 보면 돈 더 냅니다",
                "성수기 숙소, 지금 잡으면 다른 가격입니다",
                "체험단으로 가는 사람들의 공통점"],
        hook=["여행 시즌이 다가옵니다.", "같은 숙소도 조건에 따라 가격이 두 배입니다."],
        clip="0~3초: \"숙소 예약, 이거 안 보면 손해\" / 3~10초: 취소 규정·추가 요금 / "
             "10~18초: 비교 순서 / 마무리: \"후기보다 규정\"",
    ),
    dict(
        key="event",
        re=r"이벤트|응모|공모전|경품|추첨|선착순|무료\s*나눔",
        kw="이벤트 응모", cat="체험단·리워드", money=3, type="리워드 정보 · 이벤트",
        angle="응모 조건과 마감 시간 정리",
        gold=["이벤트 응모 조건 정리", "당첨 확률 높이는 순서", "마감 임박 이벤트 모음"],
        titles=["응모 안 하면 그냥 사라지는 혜택",
                "이벤트 조건, 이 한 줄에서 갈립니다",
                "오늘 마감인 것만 모았습니다"],
        hook=["이벤트가 몰려 있는 시기입니다.", "조건만 맞으면 응모는 1분입니다."],
        clip="0~3초: \"오늘 마감, 이거 응모하셨나요\" / 3~9초: 조건 한 줄 / "
             "9~16초: 응모 순서 / 마무리: \"마감 알림 설정\"",
    ),
]

# 매칭되는 사전 항목이 없을 때 쓰는 분야별 문안 (해시로 변형 선택)
GENERIC = {
    "쇼핑 커넥트": dict(
        angle="가격보다 소재·실측·반품 조건으로 거르는 기준",
        titles=["{kw}, 싸다고 아무거나 담으면 실패합니다", "{kw} 살 때 확인할 숫자 3개",
                "{kw} 지금 사면 다른 가격입니다"],
        hook=["{kw} 관련 검색이 늘었습니다.", "지금 담지 않으면 원하는 조건이 먼저 사라집니다."],
        gold=["{kw} 가격대별 비교", "{kw} 실사용 후기에서 걸러낼 것", "{kw} 반품·교환 조건 확인"],
        clip="0~3초: \"{kw}, 이거 모르면 돈 버립니다\" / 3~10초: 비교 기준 3개 / "
             "10~18초: 실측·반품 조건 / 마무리: \"사이즈표 저장\"",
    ),
    "방송·연예": dict(
        angle="화제된 이유와 다시 보는 순서 정리",
        titles=["{kw}, 아직 안 봤다면 이 순서로", "{kw} 화제인 이유와 다시 보는 방법",
                "{kw} 정리, 결론만 빠르게"],
        hook=["{kw} 소식이 오늘 상위에 올랐습니다.", "핵심만 빠르게 정리했습니다."],
        gold=["{kw} 핵심 정리", "{kw} 다시 보기·정주행 순서", "{kw} 관련 인물·작품 정리"],
        clip="0~3초: \"{kw}, 이건 알아두세요\" / 3~9초: 핵심 3개 / "
             "9~16초: 다시 보는 순서 / 마무리: \"저장해두기\"",
    ),
    "자동차·IT·AI": dict(
        angle="새 소식이 내 기기·업무에 닿는 지점",
        titles=["{kw}, 사야 하나 기다려야 하나", "{kw} 쉬운 말로 정리했습니다",
                "{kw} 지금 알아두면 손해 안 보는 3가지"],
        hook=["{kw} 소식이 또 나왔습니다.", "핵심은 사양이 아니라 내가 쓰는 방식입니다."],
        gold=["{kw} 핵심 사양·기능 정리", "{kw} 기존 사용자에게 달라지는 점", "{kw} 확인해야 할 공식 자료"],
        clip="0~3초: \"{kw}, 진짜 쓸만할까\" / 3~10초: 핵심 기능 / "
             "10~18초: 달라지는 점 3개 / 마무리: \"공식 발표 확인\"",
    ),
    "투자·경제": dict(
        angle="숫자 하나로 내 통장이 어떻게 달라지는지",
        titles=["{kw}, 숫자만 봐도 답이 나옵니다", "{kw} 뉴스가 내 지갑에 닿는 경로",
                "{kw} 지금 확인해야 할 것들, 순서대로"],
        hook=["{kw} 이슈가 오늘 상위에 올랐습니다.", "문제는 이게 내 통장 숫자를 바꾼다는 겁니다."],
        gold=["{kw} 핵심 숫자 정리", "{kw}가 내 생활비에 미치는 영향", "{kw} 확인할 공식 자료"],
        clip="0~3초: \"{kw}, 남 일 아닙니다\" / 3~10초: 핵심 숫자 / "
             "10~18초: 내게 해당하는 경우 / 마무리: \"공식 자료 확인\"",
    ),
    "체험단·리워드": dict(
        angle="신청 조건과 마감 시간 정리",
        titles=["{kw}, 신청 순서만 알면 됩니다", "{kw} 놓치면 그냥 사라지는 혜택",
                "{kw} 조건 한 번에 정리"],
        hook=["{kw} 관련 혜택이 열렸습니다.", "조건만 맞으면 신청은 1분입니다."],
        gold=["{kw} 신청 조건 정리", "{kw} 마감일과 신청 경로", "{kw} 받을 수 있는 혜택 계산"],
        clip="0~3초: \"{kw}, 아직 신청 안 하셨나요\" / 3~9초: 조건 한 줄 / "
             "9~16초: 신청 순서 / 마무리: \"마감일 저장\"",
    ),
}

# 월별 시즌 가중치 (해당 월에 자주 오르는 키워드)
SEASON = {
    1: ["연말정산", "새해", "해돋이", "설 연휴", "겨울"],
    2: ["졸업", "입학", "설 연휴", "겨울"],
    3: ["개학", "봄", "신학기", "환절기"],
    4: ["벚꽃", "봄", "황사"],
    5: ["가정의 달", "어린이날", "여행"],
    6: ["초여름", "장마", "에어컨"],
    7: ["휴가", "장마", "에어컨"],
    8: ["휴가", "폭염", "태풍"],
    9: ["추석", "환절기", "가을"],
    10: ["가을", "여행", "김장"],
    11: ["블랙프라이데이", "수능", "연말", "김장", "겨울"],
    12: ["크리스마스", "연말정산", "송년", "겨울방학", "연말"],
}

# 사전(PROFILES)에 없는 생활밀착 주제 — 기사에서 2건 이상 반복되면 상세 문안은
# GENERIC 템플릿으로 채워 후보에 올린다. (표시 키워드, 정규식, 분야)
THEMES = [
    ("배당주", r"배당주?|주주환원", "투자·경제"),
    ("보험료", r"보험료|실손보험|보험\s*(?:개편|상품)", "투자·경제"),
    ("주담대 규제", r"주담대|대출\s*(?:한도|규제|금리)", "투자·경제"),
    ("청약", r"청약|분양가|전세사기", "투자·경제"),
    ("세테크", r"종부세|양도세|상속세|증여세", "투자·경제"),
    ("게임 신작", r"게임\s*(?:출시|신작)|콘솔|스팀", "자동차·IT·AI"),
    ("로봇", r"로봇|휴머노이드", "자동차·IT·AI"),
    ("데이터센터", r"데이터센터|전력망|전기료", "자동차·IT·AI"),
    ("OTT 신작", r"OTT|넷플릭스|디즈니\+|티빙|웨이브", "방송·연예"),
    ("뮤지컬·연극", r"뮤지컬|연극", "방송·연예"),
    ("축제", r"축제|페스티벌", "체험단·리워드"),
    ("전시·팝업", r"전시회|팝업\s*스토어|팝업스토어", "체험단·리워드"),
    ("지원금", r"지원금|수당|급여\s*신청", "체험단·리워드"),
    ("쿠폰·포인트", r"쿠폰|포인트\s*소멸|마일리지", "체험단·리워드"),
    ("김장", r"김장", "쇼핑 커넥트"),
    ("캠핑·등산", r"캠핑|등산|차박", "쇼핑 커넥트"),
    ("주방·침구", r"주방|침구|이불|매트리스", "쇼핑 커넥트"),
    ("반려동물", r"반려동물|강아지|고양이", "쇼핑 커넥트"),
    ("한파", r"한파|폭설|영하", "쇼핑 커넥트"),
    ("겨울방학", r"방학|개학|입학식", "쇼핑 커넥트"),
]


# ---------------------------------------------------------------------------
# 유틸
# ---------------------------------------------------------------------------
def fetch(url: str, timeout: int = 15, tries: int = 3) -> bytes:
    last = None
    for attempt in range(tries):
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": UA,
                "Accept": "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
                "Accept-Language": "ko-KR,ko;q=0.9",
                "Accept-Encoding": "identity",
                "Cache-Control": "no-cache",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                data = r.read()
            if data:
                return data
            last = "empty body"
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as e:
            last = e
            import time as _t

            _t.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"{url} 읽기 실패: {last}")


def has_batchim(word: str) -> bool:
    word = re.sub(r"[^가-힣A-Za-z0-9]", "", word)
    if not word:
        return False
    ch = word[-1]
    if "가" <= ch <= "힣":
        return (ord(ch) - 0xAC00) % 28 != 0
    return False


def josa(word: str, with_b: str, without_b: str) -> str:
    """받침 유무에 맞는 조사를 붙인다 (word + 조사)."""
    return word + (with_b if has_batchim(word) else without_b)


def clean_title(t: str) -> str:
    t = re.sub(r"^\[[^\]]{1,12}\]\s*", "", t)
    t = re.sub(r"^【[^】]{1,12}】\s*", "", t)
    t = re.sub(r"\s*-\s*[^-]{2,20}$", "", t)  # 구글 뉴스의 " - 언론사" 제거
    return t.strip()


def norm_kw(t: str) -> str:
    t = re.sub(r"\s+", " ", t).strip()
    return t.strip(" ,·.'\"")


def parse_traffic(s: str) -> int:
    m = re.search(r"([\d,]+)", s or "")
    return int(m.group(1).replace(",", "")) if m else 0


def fmt_won_traffic(n: int) -> str:
    return f"{n:,}+"


def parse_dt(s: str):
    try:
        return parsedate_to_datetime(s).astimezone(KST)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# 수집
# ---------------------------------------------------------------------------
def collect():
    """피드에서 (트렌드 항목, 뉴스 기사)를 모은다."""
    trends, articles, ok_feeds, failures = [], [], [], []
    for kind, url, label in FEEDS:
        try:
            raw = fetch(url)
            root = ET.fromstring(raw)
        except Exception as e:  # 피드 하나가 죽어도 나머지로 진행
            failures.append(f"{label}: {e}")
            continue
        ok_feeds.append(label)
        if kind == "trends":
            for it in root.findall("./channel/item"):
                title = norm_kw(it.findtext("title") or "")
                if not title:
                    continue
                items = []
                for ni in it.findall(f"{NS_HT}news_item"):
                    nt = clean_title(ni.findtext(f"{NS_HT}news_item_title") or "")
                    if nt:
                        items.append((nt, ni.findtext(f"{NS_HT}news_item_source") or ""))
                trends.append(
                    dict(
                        term=title,
                        traffic=parse_traffic(it.findtext(f"{NS_HT}approx_traffic") or ""),
                        news=items,
                        pub=parse_dt(it.findtext("pubDate") or ""),
                    )
                )
        else:
            for it in root.findall("./channel/item"):
                title = clean_title(it.findtext("title") or "")
                if not title:
                    continue
                src = it.findtext("source") or ""
                articles.append(
                    dict(title=title, topic=label, source=src, pub=parse_dt(it.findtext("pubDate") or ""),
                         link=it.findtext("link") or "")
                )
    return trends, articles, ok_feeds, failures


# ---------------------------------------------------------------------------
# 후보 생성·분류·스코어링
# ---------------------------------------------------------------------------
def build_candidates(trends, articles, now):
    by_kw = {}

    def bucket(kw, cat, profile=None):
        key = norm_kw(kw)
        b = by_kw.get(key)
        if b is None:
            b = by_kw[key] = dict(
                kw=key,
                cat=cat or (profile or {}).get("cat") or "투자·경제",
                profile=profile,
                articles=[],
                traffic=0,
                trend_news=[],
            )
        if profile and not b["profile"]:
            b["profile"] = profile
            b["cat"] = profile["cat"]
        return b

    # 1) 주제 사전 매칭 — 기사 본문에서 실제로 등장한 표현만
    compiled = [(p, re.compile(p["re"], re.IGNORECASE)) for p in PROFILES]
    for a in articles:
        text = a["title"]
        best, best_key = None, 0.0
        for prof, rx in compiled:
            m = rx.search(text)
            if not m:
                continue
            # 연예 지면의 옷·뷰티 언급은 쇼핑 후보로 쓰지 않는다(연예인 착장 기사)
            if a["topic"] == "연예" and prof["cat"] == "쇼핑 커넥트":
                continue
            # 더 구체적으로 매칭된 주제를, 지면의 예상 분야와 맞으면 가산
            key = len(m.group(0)) + (6.0 if TOPIC_PRIOR.get(a["topic"]) == prof["cat"] else 0.0)
            if key > best_key:
                best, best_key = prof, key
        if best:
            b = bucket(best["kw"], best["cat"], best)
            b["articles"].append(a)

    # 1-b) 사전에 없는 생활 주제 — 기사 2건 이상 반복된 것만 후보로(정확도 우선)
    theme_rx = [(kw, cat, re.compile(rx, re.IGNORECASE)) for kw, rx, cat in THEMES]
    theme_hits = {}
    for a in articles:
        if a["topic"] == "연예":
            continue
        for kw, cat, rx in theme_rx:
            if rx.search(a["title"]):
                theme_hits.setdefault(kw, (cat, []))[1].append(a)
                break
    taken = {b["kw"] for b in by_kw.values()}
    for kw, (cat, arts) in theme_hits.items():
        if len(arts) < 2 or any(kw in t or t in kw for t in taken):
            continue
        b = bucket(kw, cat)
        b["articles"].extend(arts)

    # 2) 구글 트렌드 검색어 — 사전에 있는 주제만 가중치로 반영
    for t in trends:
        term = t["term"]
        matched = None
        for prof, rx in compiled:
            if rx.search(term):
                matched = prof
                break
        if matched:
            b = bucket(matched["kw"], matched["cat"], matched)
            b["traffic"] = max(b["traffic"], t["traffic"])
            b["trend_news"].extend(t["news"])

    return by_kw


def score_candidate(b, now, max_articles):
    prof = b["profile"] or {}
    n = len(b["articles"])
    traffic = b["traffic"]
    traffic_pts = min(45.0, 12.0 * math.log10(traffic)) if traffic >= 100 else 0.0
    article_pts = min(30.0, 30.0 * (n / max(1, max_articles)) ** 0.6) if n else 0.0
    money_pts = (prof.get("money") or MONEY_OF.get(b["cat"], 3)) * 1.8

    season_pts = 0.0
    hay = b["kw"] + " " + " ".join(a["title"] for a in b["articles"][:5])
    for term in SEASON.get(now.month, []):
        if term in hay:
            season_pts = 8.0
            break

    recency_pts = 0.0
    pubs = [a["pub"] for a in b["articles"] if a["pub"]]
    if pubs:
        age_h = (now - max(pubs)).total_seconds() / 3600
        recency_pts = 6.0 if age_h <= 6 else 3.0 if age_h <= 24 else 0.0
    elif b["trend_news"]:
        recency_pts = 4.0

    intent_pts = 0.0
    if re.search(r"가격|할인|세일|구매|추천|비교|출시", hay):
        intent_pts = 4.0

    raw = traffic_pts + article_pts + money_pts + season_pts + recency_pts + intent_pts
    return raw


def pick(by_kw, now):
    items = [(b, score_candidate(b, now, max((len(x["articles"]) for x in by_kw.values()), default=1)))
             for b in by_kw.values()]
    items = [(b, s) for b, s in items if len(b["articles"]) or b["traffic"]]
    items.sort(key=lambda x: -x[1])

    # 중복 제거: 한 키워드가 다른 키워드에 포함되면 점수 높은 쪽만 남긴다
    kept = []
    for b, s in items:
        dup = False
        for k, _ in kept:
            a, c = b["kw"], k["kw"]
            if a == c or a in c or c in a:
                dup = True
                break
        if not dup:
            kept.append((b, s))

    # 분야 균형: 한 분야 최대 6개, 분야별 최소 2개(재료가 있는 분야에 한해)
    cap, floor = 6, 2
    chosen, counts = [], {c: 0 for c in CATS}
    for b, s in kept:
        if len(chosen) < 15 and counts.get(b["cat"], 0) < cap:
            chosen.append((b, s))
            counts[b["cat"]] = counts.get(b["cat"], 0) + 1

    for c in CATS:
        while counts.get(c, 0) < floor:
            cand = next(((b, s) for b, s in kept if b["cat"] == c and (b, s) not in chosen), None)
            if cand is None:
                break
            if len(chosen) >= 15:
                victims = [x for x in chosen if counts.get(x[0]["cat"], 0) > floor]
                if not victims:
                    break
                victim = min(victims, key=lambda x: x[1])
                chosen.remove(victim)
                counts[victim[0]["cat"]] -= 1
            chosen.append(cand)
            counts[c] = counts.get(c, 0) + 1

    for b, s in kept:  # 그래도 15개가 안 되면 점수 순으로 채움
        if len(chosen) >= 15:
            break
        if (b, s) not in chosen:
            chosen.append((b, s))

    chosen.sort(key=lambda x: -x[1])
    return chosen[:15]


# ---------------------------------------------------------------------------
# 문안 생성
# ---------------------------------------------------------------------------
def clip_text(s: str, limit: int) -> str:
    """문장 중간이 잘리지 않게 공백 기준으로 줄인다."""
    s = re.sub(r"\s+", " ", s).strip()
    if len(s) <= limit:
        return s
    cut = s[:limit]
    if " " in cut[max(0, limit // 2):]:
        cut = cut[: cut.rfind(" ")]
    return cut.rstrip(" ,·…") + "…"


def make_entry(idx, b, raw, raw_max, now):
    prof = b["profile"] or {}
    cat = b["cat"]
    kw = b["kw"]
    money = int(prof.get("money") or MONEY_OF.get(cat, 3))
    type_ = prof.get("type") or TYPE_OF[cat]

    arts = sorted(b["articles"], key=lambda a: a["pub"] or datetime(1970, 1, 1, tzinfo=KST), reverse=True)
    top = arts[0] if arts else None
    headline = top["title"] if top else (b["trend_news"][0][0] if b["trend_news"] else "")
    source = (top["source"] if top else (b["trend_news"][0][1] if b["trend_news"] else "")) or ""
    if not source and headline and " - " in headline:
        headline, source = headline.rsplit(" - ", 1)

    # signal: 실제 피드에서 확인된 근거만
    bits = []
    if b["traffic"]:
        bits.append(f"구글 트렌드 {fmt_won_traffic(b['traffic'])}")
    if len(arts):
        topic = arts[0]["topic"]
        bits.append(f"뉴스 {len(arts)}건·{topic}")
    if headline:
        bits.append(clip_text(headline + (f" ({source})" if source else ""), 52))
    signal = clip_text(" · ".join(bits), 118)

    # why: 지표에서 계산된 문장
    why_bits = []
    if b["traffic"] >= 1000:
        why_bits.append("검색 급상승 규모 큼")
    elif b["traffic"]:
        why_bits.append("검색 상승 감지")
    if len(arts) >= 4:
        why_bits.append(f"기사 {len(arts)}건으로 확산 중")
    elif len(arts):
        why_bits.append(f"기사 {len(arts)}건")
    why_bits.append({"쇼핑 커넥트": "구매 전환 여지 높음", "방송·연예": "트래픽·클립 소재 최적",
                     "자동차·IT·AI": "정보성 검색 수명 김", "투자·경제": "광고 단가 높은 분야",
                     "체험단·리워드": "실행 전환 높음"}.get(cat, "수익화 여지 있음"))
    why = " · ".join(why_bits)[:80]

    gen = GENERIC[cat]
    angle = prof.get("angle") or gen["angle"]
    if prof:
        titles, hook, gold = prof["titles"], prof["hook"], prof["gold"]
        clip, look = prof["clip"], prof.get("look")
    else:
        # 사전에 없는 키워드: 항목마다 문안 순서를 돌려 같은 분야가 반복돼 보이지 않게
        g_titles = [t.replace("{kw}", kw) for t in gen["titles"]]
        rot = idx % len(g_titles)
        titles = (g_titles[rot:] + g_titles[:rot])[:3]
        hook = [h.replace("{kw}", kw) for h in gen["hook"]]
        gold = [g.replace("{kw}", kw) for g in gen["gold"]]
        clip = gen["clip"].replace("{kw}", kw)
        look = None

    if not prof and re.search(r"가격|할인|세일|구매|추천|출시|상품", " ".join(a["title"] for a in arts[:4])):
        money = min(5, money + 1)

    score = int(round(58 + 41 * (raw / raw_max if raw_max else 0)))
    score = max(58, min(99, score))

    outline = [
        f"도입 200자 — \"{hook[0]}\"로 시작해 '{kw}'{('이' if has_batchim(kw) else '가')} 왜 지금 문제인지 제기",
        f"현황 400자 — {signal or '확인된 사실'} 을 근거로 확인된 사실 3개와 출처(언론사·발표일) 정리",
        f"분석 600자 — 소제목 3개: {', '.join(gold[:3])}",
        "실행 500자 — 독자가 오늘 바로 하는 체크리스트 3개"
        + (" (코디 5슬롯과 연결)" if look else ""),
        "마무리 300자 — 요약 한 줄 + 다음 글 내부링크 + 이미지 3~4장 배치",
    ]

    trend = [max(5, int(score * r)) for r in (0.40, 0.52, 0.63, 0.72, 0.80, 1.0)]

    return {
        "rank": idx + 1,
        "kw": kw,
        "cat": cat,
        "ch": CH_OF.get(cat, "공통"),
        "signal": signal or f"{len(arts)}건의 기사에서 반복 등장",
        "score": score,
        "money": money,
        "type": type_,
        "why": why,
        "angle": angle,
        "trend": trend,
        "outline": outline,
        "src": "live",
        "detail": {
            "gold": gold[:3],
            "titles": titles[:3],
            "hook": hook[:2],
            "look": look,
            "clip": clip,
        },
    }


def make_strategy(entries, now):
    nxt = (now + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
    lines = []
    for i, e in enumerate(entries[:6]):
        lines.append(f"{i + 1}. {e['rank']}순위 '{e['kw']}' — {e['angle']} · {e['ch']}")
    lines += [
        "7. 투자·경제 글은 매수·매도 추천 없이 계산 예시와 체크리스트만 — 유사투자자문 리스크 회피",
        "8. 쇼핑 글은 실측·반품비가 확인된 상품만, 5만 원 이하를 우선으로 링크 배분",
        "9. 방송·연예 키워드는 19:30 클립 슬롯에서 3초 훅으로 재활용",
        f"10. 이 목록은 매시간 정각 GitHub Actions가 갱신합니다 — 다음 갱신 {nxt.strftime('%H:%M')} KST",
    ]
    return lines[:10]


# ---------------------------------------------------------------------------
# 저장
# ---------------------------------------------------------------------------
def load_prev():
    try:
        return json.loads(DATA.read_text(encoding="utf-8"))
    except Exception:
        return {}


def main(argv):
    dry = "--dry-run" in argv
    do_build = "--no-build" not in argv
    now = datetime.now(KST)

    trends, articles, ok_feeds, failures = collect()
    print(f"[collect] feeds ok={len(ok_feeds)}/{len(FEEDS)} trends={len(trends)} articles={len(articles)}")
    for f in failures:
        print(f"[collect] 피드 실패 — {f}")
    if not ok_feeds:
        print("[collect] 모든 피드를 읽지 못했습니다. data.json 을 그대로 둡니다.", file=sys.stderr)
        return 1
    if len(articles) < 10:
        print("[collect] 기사가 너무 적습니다. data.json 을 그대로 둡니다.", file=sys.stderr)
        return 1

    by_kw = build_candidates(trends, articles, now)
    picked = pick(by_kw, now)
    if len(picked) < 5:
        print(f"[rank] 후보가 {len(picked)}개뿐입니다. data.json 을 그대로 둡니다.", file=sys.stderr)
        return 1

    raw_max = max(s for _, s in picked) or 1
    raw_min = min(s for _, s in picked)
    span = max(1e-6, raw_max - raw_min)
    entries = [
        make_entry(i, b, (s - raw_min) / span, 1.0, now) for i, (b, s) in enumerate(picked)
    ]

    prev = load_prev()
    meta = dict(prev.get("meta") or {})
    meta.update(
        {
            "updated": now.strftime("%Y-%m-%d"),
            "updatedAt": now.strftime("%Y.%m.%d %H:%M 기준 (매시간 자동 갱신)"),
            "routines": "매시간 정각 자동 갱신 (GitHub Actions · 구글 트렌드 + 구글 뉴스 RSS)",
            "sources": "구글 트렌드 한국 실시간 검색어(trends.google.com/trending/rss?geo=KR) · "
                       "구글 뉴스 한국 토픽 RSS(경제·연예·IT/과학·대한민국) · "
                       "구글 뉴스 검색 RSS(패션·할인·체험단·연말정산)",
            "auto": True,
            "quick": [e["kw"] for e in entries[:4]],
        }
    )
    meta.setdefault(
        "disclaimer",
        "인기 점수는 검색 급상승 규모·이슈 지속성·구매나 광고 전환 가능성을 반영한 운영용 지표이며 "
        "실제 검색량과 수익을 보장하지 않습니다. 투자·금융·보안·의료 관련 글은 공식 자료와 출처를 확인한 뒤 발행하세요.",
    )

    data = {"meta": meta, "keywords": entries, "strategy": make_strategy(entries, now)}

    print(f"[rank] 상위 {len(entries)}개")
    for e in entries:
        print(f"  {e['rank']:2d}. {e['kw']:<16} {e['cat']:<8} {e['score']:>3}점 | {e['signal'][:60]}")

    if dry:
        print(json.dumps(data, ensure_ascii=False, indent=2)[:2500])
        print("[dry-run] 파일은 쓰지 않았습니다.")
        return 0

    DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[write] {DATA.relative_to(HERE.parent)} — keywords={len(entries)}")

    if do_build:
        r = subprocess.run([sys.executable, str(BUILD)], capture_output=True, text=True)
        print(f"[build] {r.stdout.strip() or r.stderr.strip()}")
        if r.returncode != 0:
            return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
