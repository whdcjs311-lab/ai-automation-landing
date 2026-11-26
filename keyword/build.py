#!/usr/bin/env python3
"""data.json 을 keyword/index.html 의 내장 폴백 블록에 주입한다.

매일 갱신 루틴은 data.json 만 고치면 되고, 이 스크립트를 한 번 돌리면
index.html 하나만 내려받아 file:// 로 열어도 같은 데이터로 작동한다.

사용법:
    python3 keyword/build.py
"""
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
DATA = HERE / "data.json"
PAGE = HERE / "index.html"
START = '<script id="data" type="application/json">'
END = "</script>"


def main() -> int:
    data = json.loads(DATA.read_text(encoding="utf-8"))
    if not data.get("keywords"):
        print("data.json 에 keywords 가 없습니다.", file=sys.stderr)
        return 2

    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    raw = raw.replace("</", "<\\/")  # 스크립트 태그 조기 종료 방지

    html = PAGE.read_text(encoding="utf-8")
    i = html.find(START)
    if i < 0:
        print("index.html 에서 내장 데이터 블록을 찾지 못했습니다.", file=sys.stderr)
        return 3
    j = html.find(END, i + len(START))
    if j < 0:
        print("내장 데이터 블록의 닫는 태그를 찾지 못했습니다.", file=sys.stderr)
        return 3

    out = html[: i + len(START)] + raw + html[j:]
    PAGE.write_text(out, encoding="utf-8")
    print(f"embedded {len(data['keywords'])} keywords, {len(data.get('strategy', []))} strategy lines -> {PAGE.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
