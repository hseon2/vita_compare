# -*- coding: utf-8 -*-
"""더미 이미지로 표준/장기 모드 PPT를 생성해 수동 시각 QA하기 위한 스크립트.

실제 환자 사진 없이도 전체 파이프라인(ppt_generator)이 올바르게 동작하는지 눈으로
확인할 수 있다. "generate ppt.py" 프로토타입의 __main__ 데모 블록을 경로 상대적으로
이식한 버전이며, 실행: `python backend/scripts/demo_generate.py`
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # backend/ 를 루트로 추가

from PIL import Image, ImageDraw  # noqa: E402

from ppt_generator.compos import COMPOS, WIDE_COMPOS  # noqa: E402
from ppt_generator.generate_ppt import build_presentation  # noqa: E402

DEMO_DIR = Path(__file__).resolve().parent.parent.parent / ".demo_output"


def _make_dummy_photo(path: Path, label: str, wide: bool) -> None:
    size = (960, 540) if wide else (720, 960)
    img = Image.new("RGB", size, (210, 205, 195))
    draw = ImageDraw.Draw(img)
    draw.rectangle([20, 20, size[0] - 20, size[1] - 20], outline=(90, 90, 80), width=4)
    draw.text((40, 40), label, fill=(40, 40, 36))
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)


def _build_photo_sets(n_sets: int) -> dict[int, list[dict]]:
    photo_sets: dict[int, list[dict]] = {}
    for num, label in COMPOS:
        wide = num in WIDE_COMPOS
        sets = []
        for s in range(1, n_sets + 1):
            before = DEMO_DIR / "photos" / f"before_{num:02d}_set{s}.png"
            after = DEMO_DIR / "photos" / f"after_{num:02d}_set{s}.png"
            _make_dummy_photo(before, f"{num}.{label} BEFORE set{s}", wide)
            _make_dummy_photo(after, f"{num}.{label} AFTER set{s}", wide)
            sets.append({
                "before": str(before), "after": str(after),
                "before_date": "2026.01.05", "after_date": "2026.03.10",
            })
        photo_sets[num] = sets
    return photo_sets


BODY_COMP_ROWS = [
    {"label": "체중", "start": "67.3kg", "mid": None, "end": "59.2kg", "target": "60kg(55kg)", "highlight": False},
    {"label": "신장", "start": "162.5cm", "mid": None, "end": "162.5cm", "target": "-", "highlight": False},
    {"label": "체지방량", "start": "26.0kg", "mid": None, "end": "19.7kg", "target": "12.8kg", "highlight": False},
    {"label": "골격근량", "start": "22.5kg", "mid": None, "end": "21.4kg", "target": "24.5kg", "highlight": False},
    {"label": "체지방률", "start": "38.6%", "mid": None, "end": "33.2%", "target": "18~28%", "highlight": False},
    {"label": "BMI", "start": "25.5", "mid": None, "end": "22.4", "target": "18.5~25", "highlight": False},
    {"label": "복부지방률", "start": "1.00", "mid": None, "end": "0.93", "target": "0.75~0.85", "highlight": False},
    {"label": "복부둘레", "start": "96.1cm", "mid": None, "end": "85.2cm", "target": "73cm", "highlight": True},
    {"label": "엉덩이둘레", "start": "96.1cm", "mid": None, "end": "91.7cm", "target": "89.2cm", "highlight": True},
    {"label": "가슴둘레", "start": "95.0cm", "mid": None, "end": "89.2cm", "target": "84.1cm", "highlight": True},
    {"label": "우측상완둘레", "start": "32.3cm", "mid": None, "end": "29.6cm", "target": "26.6cm", "highlight": False},
    {"label": "우측대퇴둘레", "start": "50.6cm", "mid": None, "end": "48.4cm", "target": "48.6cm", "highlight": False},
]


def main() -> None:
    DEMO_DIR.mkdir(parents=True, exist_ok=True)

    standard_sets = _build_photo_sets(n_sets=1)
    out_standard = build_presentation(
        patient_name="홍길동", mode="standard", photo_sets=standard_sets,
        body_comp_rows=BODY_COMP_ROWS, output_path=str(DEMO_DIR / "홍길동님_표준모드_데모.pptx"),
    )
    print("표준모드 생성완료:", out_standard, "(17슬라이드 예상)")

    long_sets = _build_photo_sets(n_sets=2)
    out_long = build_presentation(
        patient_name="홍길동", mode="long", photo_sets=long_sets,
        body_comp_rows=BODY_COMP_ROWS, output_path=str(DEMO_DIR / "홍길동님_장기모드_데모.pptx"),
    )
    print("장기모드 생성완료:", out_long, "(33슬라이드 예상)")


if __name__ == "__main__":
    main()
