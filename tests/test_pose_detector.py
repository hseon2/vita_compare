# -*- coding: utf-8 -*-
"""포즈 검출 스모크 테스트. 실제 모델(ml_assets/pose_landmarker_full.task)이 로드되는지,
인물이 없는 이미지에서 PoseNotDetectedError가 나는지만 확인한다. 실제 인물 검출 정확도는
사용자의 실사진이 있어야 검증 가능하므로 범위 밖이다.
"""
import pytest

import config
from preprocessing.pose_detector import PoseNotDetectedError, detect_landmarks

pytestmark = pytest.mark.skipif(
    not config.POSE_MODEL_PATH.exists(),
    reason="포즈 모델 파일이 없습니다 (python backend/scripts/download_pose_model.py 먼저 실행)",
)


def test_blank_image_raises_pose_not_detected(make_dummy_photo):
    path = make_dummy_photo("blank.jpg", size=(600, 800), color=(128, 128, 128))
    with pytest.raises(PoseNotDetectedError):
        detect_landmarks(path)


def test_missing_file_raises_pose_not_detected(tmp_path):
    missing = tmp_path / "does_not_exist.jpg"
    with pytest.raises(PoseNotDetectedError):
        detect_landmarks(str(missing))
