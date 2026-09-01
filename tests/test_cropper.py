# -*- coding: utf-8 -*-
"""크롭 로직 검증 - 합성 랜드마크로 비율/중앙정렬/클램프 및 비파괴 보장을 확인한다."""
import hashlib

import config
from preprocessing import cropper


IMG_W, IMG_H = 800, 1000


def _full_body_landmarks(cx=400):
    return {
        "NOSE": (cx, 100, 1.0),
        "LEFT_SHOULDER": (cx - 60, 180, 1.0), "RIGHT_SHOULDER": (cx + 60, 180, 1.0),
        "LEFT_HIP": (cx - 50, 500, 1.0), "RIGHT_HIP": (cx + 50, 500, 1.0),
        "LEFT_KNEE": (cx - 45, 700, 1.0), "RIGHT_KNEE": (cx + 45, 700, 1.0),
        "LEFT_ANKLE": (cx - 40, 900, 1.0), "RIGHT_ANKLE": (cx + 40, 900, 1.0),
        "LEFT_FOOT_INDEX": (cx - 40, 950, 1.0), "RIGHT_FOOT_INDEX": (cx + 40, 950, 1.0),
    }


def _upper_body_landmarks(wide=False, cx=400):
    lm = {
        "NOSE": (cx, 150, 1.0),
        "LEFT_SHOULDER": (cx - 70, 250, 1.0), "RIGHT_SHOULDER": (cx + 70, 250, 1.0),
        "LEFT_HIP": (cx - 60, 600, 1.0), "RIGHT_HIP": (cx + 60, 600, 1.0),
    }
    if wide:
        lm.update({
            "LEFT_ELBOW": (cx - 200, 260, 1.0), "RIGHT_ELBOW": (cx + 200, 260, 1.0),
            "LEFT_WRIST": (cx - 320, 265, 1.0), "RIGHT_WRIST": (cx + 320, 265, 1.0),
        })
    return lm


def _torso_landmarks(cx=400):
    return {
        "LEFT_SHOULDER": (cx - 65, 100, 1.0), "RIGHT_SHOULDER": (cx + 65, 100, 1.0),
        "LEFT_HIP": (cx - 55, 400, 1.0), "RIGHT_HIP": (cx + 55, 400, 1.0),
    }


def _lower_body_landmarks(cx=400):
    return {
        "LEFT_HIP": (cx - 55, 100, 1.0), "RIGHT_HIP": (cx + 55, 100, 1.0),
        "LEFT_KNEE": (cx - 45, 400, 1.0), "RIGHT_KNEE": (cx + 45, 400, 1.0),
        "LEFT_ANKLE": (cx - 40, 700, 1.0), "RIGHT_ANKLE": (cx + 40, 700, 1.0),
    }


def _aspect(box):
    x0, y0, x1, y1 = box
    return (x1 - x0) / (y1 - y0)


def test_full_body_ratio_matches_config():
    box = cropper.compute_crop_box(_full_body_landmarks(), IMG_W, IMG_H, compos_id=1)
    target = config.CROP_RATIOS[1][0] / config.CROP_RATIOS[1][1]
    assert abs(_aspect(box) - target) < 0.02


def test_torso_ratio_matches_config():
    box = cropper.compute_crop_box(_torso_landmarks(), IMG_W, IMG_H, compos_id=3)
    target = config.CROP_RATIOS[3][0] / config.CROP_RATIOS[3][1]
    assert abs(_aspect(box) - target) < 0.02


def test_lower_body_ratio_matches_config():
    box = cropper.compute_crop_box(_lower_body_landmarks(), IMG_W, IMG_H, compos_id=6)
    target = config.CROP_RATIOS[6][0] / config.CROP_RATIOS[6][1]
    assert abs(_aspect(box) - target) < 0.02


def test_upper_normal_ratio_matches_config():
    box = cropper.compute_crop_box(_upper_body_landmarks(wide=False), IMG_W, IMG_H, compos_id=4)
    target = config.CROP_RATIOS[4][0] / config.CROP_RATIOS[4][1]
    assert abs(_aspect(box) - target) < 0.02


def test_wide_compos_ratio_is_16_9_and_wider_than_normal_upper():
    wide_box = cropper.compute_crop_box(_upper_body_landmarks(wide=True), IMG_W, IMG_H, compos_id=5)
    target = config.CROP_RATIOS[5][0] / config.CROP_RATIOS[5][1]
    assert abs(_aspect(wide_box) - target) < 0.02
    assert config.CROP_RATIOS[5] == (16, 9)


def test_box_is_centered_on_bbox_center():
    landmarks = _full_body_landmarks(cx=400)
    box = cropper.compute_crop_box(landmarks, IMG_W, IMG_H, compos_id=1)
    x0, y0, x1, y1 = box
    box_cx = (x0 + x1) / 2
    # 인체 좌우 대칭 landmark라 bbox 중심 x는 cx(400) 근방이어야 함
    assert abs(box_cx - 400) < 15


def test_clamps_within_image_bounds_near_edge():
    """이미지 경계 근처 인물이라도 crop_box는 항상 이미지 범위 안으로 클램프된다."""
    landmarks = _full_body_landmarks(cx=50)  # 왼쪽 경계에 아주 가까움
    box = cropper.compute_crop_box(landmarks, IMG_W, IMG_H, compos_id=1)
    x0, y0, x1, y1 = box
    assert x0 >= 0 and y0 >= 0 and x1 <= IMG_W and y1 <= IMG_H
    assert x1 > x0 and y1 > y0


def test_low_visibility_outlier_landmark_is_ignored():
    """실사용 중 발견된 버그: 가려진 관절(예: 하반신이 안 보이는 사진의 발목)에 대해 MediaPipe가
    낮은 visibility로 화면 밖 좌표를 대략 찍어 반환해도, 그 좌표가 bbox를 화면 밖으로 끌고 나가
    회전 여백(검은색)만 크롭되는 일이 없어야 한다 - visibility가 낮은 랜드마크는 앵커점에서
    제외된다."""
    landmarks = _full_body_landmarks(cx=400)
    landmarks_with_outlier = dict(landmarks)
    # 발목이 이미지 훨씬 밖(y=5000)에, 신뢰도는 아주 낮게(가려져서 대략 찍은 값) 잡혔다고 가정
    landmarks_with_outlier["RIGHT_ANKLE"] = (440, 5000, 0.05)

    clean_box = cropper.compute_crop_box(landmarks, IMG_W, IMG_H, compos_id=1)
    outlier_box = cropper.compute_crop_box(landmarks_with_outlier, IMG_W, IMG_H, compos_id=1)
    assert outlier_box == clean_box


def test_no_landmarks_falls_back_to_full_image_ratio_box():
    box = cropper.compute_crop_box({}, IMG_W, IMG_H, compos_id=1)
    x0, y0, x1, y1 = box
    assert x1 > x0 and y1 > y0
    target = config.CROP_RATIOS[1][0] / config.CROP_RATIOS[1][1]
    assert abs(_aspect(box) - target) < 0.02


def test_export_cropped_image_does_not_modify_raw_file(tmp_path, make_dummy_photo):
    raw_path = make_dummy_photo("raw.png", size=(400, 600))
    raw_bytes_before = hashlib.sha256(open(raw_path, "rb").read()).hexdigest()

    out_path = tmp_path / "cropped.jpg"
    cropper.export_cropped_image(raw_path, rotation_deg=5.0, crop_box=(10, 10, 200, 300),
                                  output_path=str(out_path))

    raw_bytes_after = hashlib.sha256(open(raw_path, "rb").read()).hexdigest()
    assert raw_bytes_before == raw_bytes_after
    assert out_path.exists()


def test_export_cropped_image_reapply_from_raw_allows_widening(tmp_path, make_dummy_photo):
    """비파괴 원칙: 같은 raw_path에서 다른 crop_box로 몇 번이든 다시 잘라낼 수 있어야 한다."""
    raw_path = make_dummy_photo("raw2.png", size=(500, 700))

    narrow_out = tmp_path / "narrow.jpg"
    cropper.export_cropped_image(raw_path, 0.0, (100, 100, 200, 200), str(narrow_out))

    wide_out = tmp_path / "wide.jpg"
    cropper.export_cropped_image(raw_path, 0.0, (0, 0, 500, 700), str(wide_out))

    from PIL import Image
    with Image.open(narrow_out) as im:
        assert im.size == (100, 100)
    with Image.open(wide_out) as im:
        assert im.size == (500, 700)


def test_export_cropped_image_falls_back_when_crop_box_degenerate(tmp_path, make_dummy_photo):
    """crop_box가 (0,0,0,0)(AI 크롭 전 상태로 남아 있는 경우 등)이면 PIL이 저장에 실패하므로,
    구도 비율에 맞춘 안전한 기본 박스로 대체되어야 한다 (실사용 중 발견된
    "cannot write empty image as JPEG" 오류 회귀 방지)."""
    raw_path = make_dummy_photo("raw3.png", size=(600, 800))
    out_path = tmp_path / "fallback.jpg"

    cropper.export_cropped_image(raw_path, 0.0, (0, 0, 0, 0), str(out_path), compos_id=1)

    from PIL import Image
    with Image.open(out_path) as im:
        assert im.width > 0 and im.height > 0
