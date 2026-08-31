# -*- coding: utf-8 -*-
"""MediaPipe Pose Landmarker 모델(.task) 파일을 로컬로 내려받는 스크립트.

MediaPipe의 최신 배포판은 레거시 mp.solutions.pose API를 제거하고 Tasks API로 통합했다.
Tasks API는 모델 파일을 pip 패키지에 포함하지 않으므로 최초 1회 이 스크립트로 받아야 한다
(정적 모델 파일을 로컬 디스크에 내려받는 것일 뿐, 실행 시점의 추론은 여전히 완전 로컬이며
클라우드 API를 호출하지 않는다).

실행: `python backend/scripts/download_pose_model.py`
"""
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config  # noqa: E402

MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_full/float16/latest/pose_landmarker_full.task"
)


def main() -> None:
    model_path = config.POSE_MODEL_PATH
    if model_path.exists():
        print(f"이미 존재합니다: {model_path}")
        return
    model_path.parent.mkdir(parents=True, exist_ok=True)
    print(f"다운로드 중: {MODEL_URL}")
    urllib.request.urlretrieve(MODEL_URL, model_path)
    print(f"완료: {model_path} ({model_path.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
