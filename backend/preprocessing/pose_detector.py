# -*- coding: utf-8 -*-
"""MediaPipe Pose 랜드마크 추출 (요구사항 5.1).

MediaPipe의 레거시 mp.solutions.pose API는 최근 배포판에서 제거되고 Tasks API
(mediapipe.tasks.python.vision.PoseLandmarker)로 통합되었다. Tasks API는 모델 파일(.task)을
로컬에 미리 받아두어야 동작한다 (config.POSE_MODEL_PATH, 최초 1회
`python backend/scripts/download_pose_model.py`로 다운로드) — 여전히 완전 로컬 추론이며
클라우드 API를 호출하지 않는다 (요구사항 1절 원칙과 동일).

landmarks는 dict[str, (x, y, z, visibility)] 형태로 반환한다. 요구사항 문서의 "출력" 줄은
3-tuple(x,y,z)만 언급하지만, 분류기(정면/후면 판별)와 크로퍼(신뢰 가능한 앵커 선택)가
visibility를 필수로 사용하므로 4-tuple로 통일한다.
"""
import numpy as np
import mediapipe as mp
from mediapipe.tasks.python import vision
from mediapipe.tasks.python.core.base_options import BaseOptions
from PIL import Image, UnidentifiedImageError

import config

LANDMARK_NAMES = [lm.name for lm in vision.PoseLandmark]

_landmarker: vision.PoseLandmarker | None = None


class PoseNotDetectedError(Exception):
    """이미지에서 인물을 검출하지 못했을 때 발생. 검수 UI에서 수동 처리로 유도."""

    def __init__(self, image_path: str):
        self.image_path = image_path
        super().__init__(f"인물을 검출하지 못했습니다: {image_path}")


def _get_landmarker() -> vision.PoseLandmarker:
    """PoseLandmarker는 모델 로딩 비용이 커서 프로세스당 한 번만 생성해 재사용한다."""
    global _landmarker
    if _landmarker is None:
        if not config.POSE_MODEL_PATH.exists():
            raise FileNotFoundError(
                f"포즈 검출 모델을 찾을 수 없습니다: {config.POSE_MODEL_PATH}\n"
                "먼저 `python backend/scripts/download_pose_model.py`를 실행해 모델을 받아주세요."
            )
        options = vision.PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(config.POSE_MODEL_PATH)),
            running_mode=vision.RunningMode.IMAGE,
            num_poses=1,
            min_pose_detection_confidence=config.POSE_MIN_DETECTION_CONFIDENCE,
        )
        _landmarker = vision.PoseLandmarker.create_from_options(options)
    return _landmarker


def detect_landmarks(image_path: str) -> dict[str, tuple[float, float, float, float]]:
    """이미지 경로를 받아 33개 랜드마크 좌표(x,y,z,visibility)를 정규화 좌표(0~1)로 반환.

    인물이 검출되지 않거나 이미지 파일을 읽을 수 없으면 PoseNotDetectedError를 발생시킨다
    (호출부에서 개별 사진 실패로 처리할 수 있도록 예외 종류를 하나로 통일).
    """
    # mp.Image.create_from_file()은 알파 채널이 있는 PNG(스크린샷 등 아주 흔한 케이스)를
    # "Failed to load image from file"로 로드 자체를 실패시킨다 - 사람 눈엔 멀쩡한 사진인데
    # 포즈 미검출로 잘못 보고되는 원인이었다. PIL로 직접 열어 RGB로 변환한 뒤 numpy 배열로
    # mp.Image를 만들면 이 제약을 우회할 수 있다.
    try:
        with Image.open(image_path) as im:
            rgb = im.convert("RGB")
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.asarray(rgb))
    except (UnidentifiedImageError, OSError) as exc:
        raise PoseNotDetectedError(image_path) from exc

    result = _get_landmarker().detect(mp_image)

    if not result.pose_landmarks:
        raise PoseNotDetectedError(image_path)

    landmarks: dict[str, tuple[float, float, float, float]] = {}
    for name, lm in zip(LANDMARK_NAMES, result.pose_landmarks[0]):
        landmarks[name] = (lm.x, lm.y, lm.z, lm.visibility)
    return landmarks
