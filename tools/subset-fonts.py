#!/usr/bin/env python3
# Pretendard 서브셋 생성기
# ㄴ index.html에 실제로 쓰인 글자만 뽑아 static/fonts/subset/ 에 woff2로 저장
# ㄴ 원본 static/fonts/*.woff2 는 폴백용으로 그대로 둠. 서브셋에 없는 글자 나오면 그때만 받아감
# ㄴ 본문 텍스트 고치면 이 스크립트 다시 돌릴 것: python tools/subset-fonts.py
import subprocess, sys
from pathlib import Path

ROOT   = Path(__file__).resolve().parent.parent
HTML   = ROOT / "index.html"
SRCDIR = ROOT / "static" / "fonts"
OUTDIR = SRCDIR / "subset"

WEIGHTS = ["Thin", "ExtraLight", "Light", "Regular",
           "Medium", "SemiBold", "Bold", "ExtraBold", "Black"]

# 본문에 없어도 넣어두는 안전 마진. 나중에 글 조금 고쳐도 폴백 안 타게
MARGIN = [
    (0x0020, 0x007E),  # ASCII
    (0x00A0, 0x00FF),  # Latin-1 supplement
    (0x2000, 0x206F),  # 일반 구두점
    (0x20A0, 0x20BF),  # 통화 기호
    (0x2190, 0x21FF),  # 화살표
    (0x2500, 0x257F),  # 괘선
    (0x25A0, 0x25FF),  # 도형
    (0x3000, 0x303F),  # CJK 구두점
    (0x3130, 0x318F),  # 한글 호환 자모
]


def codepoints() -> list[int]:
    used = {ord(c) for c in HTML.read_text(encoding="utf-8")}
    for lo, hi in MARGIN:
        used |= set(range(lo, hi + 1))
    return sorted(used)


def main() -> int:
    cps = codepoints()
    unicodes = ",".join(f"U+{c:04X}" for c in cps)
    OUTDIR.mkdir(parents=True, exist_ok=True)
    print(f"코드포인트 {len(cps)}개")

    total_src = total_out = 0
    for w in WEIGHTS:
        src = SRCDIR / f"Pretendard-{w}.woff2"
        out = OUTDIR / f"Pretendard-{w}.subset.woff2"
        if not src.exists():
            print(f"  건너뜀: {src.name} 없음")
            continue
        subprocess.run([
            sys.executable, "-m", "fontTools.subset", str(src),
            f"--unicodes={unicodes}",
            "--flavor=woff2",
            "--layout-features=*",   # 커닝/합자 등 원본 그대로
            "--notdef-outline",
            f"--output-file={out}",
        ], check=True)
        s, o = src.stat().st_size, out.stat().st_size
        total_src += s
        total_out += o
        print(f"  {w:11s} {s/1024:7.1f}KB -> {o/1024:6.1f}KB  ({o/s*100:4.1f}%)")

    print(f"\n합계 {total_src/1024/1024:.2f}MB -> {total_out/1024:.1f}KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
