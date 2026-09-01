# -*- coding: utf-8 -*-
"""전역 설정값: 경로, 임계값, 구도별 크롭 비율, 기본 체성분 항목."""
from pathlib import Path

from ppt_generator.compos import WIDE_COMPOS

# ---- 경로 ----
PROJECT_ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = PROJECT_ROOT / "source"
OUTPUT_DIR = PROJECT_ROOT / "output"
SESSION_CACHE_DIR = PROJECT_ROOT / "backend" / ".session_cache"
LOG_DIR = PROJECT_ROOT / "logs"
STATIC_URL_PREFIX = "/static"

for _d in (SOURCE_DIR, OUTPUT_DIR, SESSION_CACHE_DIR, LOG_DIR):
    _d.mkdir(parents=True, exist_ok=True)

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}

# ---- 포즈 검출 ----
# MediaPipe 최신 배포판은 레거시 mp.solutions.pose API를 제거하고 Tasks API로 통합했다.
# Tasks API는 모델을 pip 패키지에 포함하지 않으므로 최초 1회 backend/scripts/download_pose_model.py
# 로 받아두어야 한다 (완전 로컬 추론 - 클라우드 API 호출이 아니라 정적 모델 파일 1회 다운로드).
POSE_MODEL_PATH = PROJECT_ROOT / "backend" / "ml_assets" / "pose_landmarker_full.task"

# ---- 분류/전처리 임계값 ----
CONFIDENCE_THRESHOLD = 0.7  # 이 미만이면 검수 UI에서 "확인 필요" 배지
POSE_MIN_DETECTION_CONFIDENCE = 0.5
LANDMARK_VISIBILITY_THRESHOLD = 0.5
# 정면/후면 판별용 코-귀 상대 깊이(z) 정규화 스케일. 실사진 실측 기준(정면 약 -0.64, 후면 약
# 0.98)으로 잡은 값 - 이 값 이상으로 뚜렷하게 갈리면 confidence가 1.0에 가까워진다.
VIEW_DEPTH_CONFIDENCE_SCALE = 0.3

SIDE_WIDTH_RATIO_THRESHOLD = 0.35   # (어깨폭+골반폭)/2 / 몸통높이 < 이값이면 측면
LEG_SPREAD_RATIO_THRESHOLD = 1.2    # 발목간거리 / 어깨폭 > 이값이면 다리벌림
ARM_SPREAD_ANGLE_THRESHOLD_DEG = 45  # 팔꿈치-어깨 각도가 수평에서 이 이내면 팔벌림
HEAD_MARGIN_FACTOR = 0.6            # 코-어깨중점 거리 기반 정수리 추정 비율

# ---- 크롭 ----
CROP_PADDING_FACTOR = 1.1  # AI 1차 크롭 bbox에 여유를 주는 배율

# 구도별 크롭 비율 (width:height). 상반신 팔벌림(WIDE_COMPOS)만 16:9, 나머지는 카테고리별로 구분.
CROP_RATIOS: dict[int, tuple[int, int]] = {}
for _num in range(1, 17):
    if _num in WIDE_COMPOS:  # 5, 15 - 상반신 팔벌림
        CROP_RATIOS[_num] = (16, 9)
    elif _num in (1, 2, 7, 11, 12):  # 전신
        CROP_RATIOS[_num] = (3, 4)
    else:  # 체간(3,8,13) / 상반신 보통(4,9,14) / 하반신(6,10,16)
        CROP_RATIOS[_num] = (4, 5)

# ---- 세션/모드 ----
STANDARD_MODE_SET_PAIRING = [("start", "end")]
LONG_MODE_SET_PAIRING = [("start", "mid"), ("mid", "end")]

# ---- 체성분 기본 항목 (요구사항 5.6) ----
DEFAULT_BODY_COMP_LABELS = [
    "체중", "신장", "체지방량", "골격근량", "체지방률", "BMI",
    "복부지방률", "복부둘레", "엉덩이둘레", "가슴둘레", "우측상완둘레", "우측대퇴둘레",
]


def configure_logging() -> None:
    import logging
    from logging.handlers import RotatingFileHandler

    log_path = LOG_DIR / "backend.log"
    handler = RotatingFileHandler(log_path, maxBytes=2_000_000, backupCount=3, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))

    root = logging.getLogger()
    root.setLevel(logging.INFO)
    if not any(isinstance(h, RotatingFileHandler) for h in root.handlers):
        root.addHandler(handler)
