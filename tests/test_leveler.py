# -*- coding: utf-8 -*-
"""수평 조정 로직 검증 - 합성 랜드마크로 각도 계산/좌표 변환의 자기일관성을 확인한다."""
import math

from preprocessing import leveler


def _lm(x, y, z=0.0, v=1.0):
    return (x, y, z, v)


def test_level_eyes_gives_zero_angle():
    landmarks = {"LEFT_EYE": _lm(0.6, 0.4), "RIGHT_EYE": _lm(0.4, 0.4)}
    angle = leveler.compute_rotation_angle(landmarks, image_w=800, image_h=1000)
    assert math.isclose(angle, 0.0, abs_tol=1e-6)


def test_tilted_eyes_gives_small_corrective_angle():
    """해부학적 라벨상 LEFT_EYE.x > RIGHT_EYE.x (정면 촬영 시 흔한 배치)여도 소각도가 나와야 한다."""
    landmarks = {"LEFT_EYE": _lm(0.62, 0.42), "RIGHT_EYE": _lm(0.40, 0.40)}
    angle = leveler.compute_rotation_angle(landmarks, image_w=800, image_h=1000)
    assert abs(angle) < 30  # 180도 근처로 튀면 안 됨 (이미지 좌표 기준 정렬 검증)


def test_prefers_shoulders_over_eyes_when_both_present():
    """어깨가 있으면 눈이 아니라 어깨 기울기를 우선 사용해야 한다.

    이 앱의 사진은 전신/상반신 위주라 눈-눈 간격(baseline)이 매우 짧고, 그만큼 MediaPipe
    랜드마크의 몇 픽셀 오차만으로도 각도 추정이 크게 흔들린다 (실사용 중 "수평조정이
    이상하게 나온다"로 확인된 문제). 어깨는 baseline이 넓어 훨씬 안정적이므로 우선한다.
    """
    landmarks = {
        "LEFT_EYE": _lm(0.51, 0.10), "RIGHT_EYE": _lm(0.49, 0.101),  # 거의 수평(노이즈 수준)
        "LEFT_SHOULDER": _lm(0.60, 0.30), "RIGHT_SHOULDER": _lm(0.40, 0.35),  # 뚜렷하게 기울어짐
    }
    angle = leveler.compute_rotation_angle(landmarks, image_w=800, image_h=1000)
    assert -20 < angle < -10  # 어깨 기준 약 -17.3도. 눈이 쓰였다면 0에 가까웠을 것


def test_falls_back_to_eyes_when_shoulders_low_visibility():
    landmarks = {
        "LEFT_SHOULDER": _lm(0.65, 0.55, v=0.1), "RIGHT_SHOULDER": _lm(0.35, 0.50, v=0.1),
        "LEFT_EYE": _lm(0.6, 0.4), "RIGHT_EYE": _lm(0.4, 0.42),
    }
    angle = leveler.compute_rotation_angle(landmarks, image_w=800, image_h=1000)
    assert angle != 0.0


def test_missing_landmarks_returns_zero():
    angle = leveler.compute_rotation_angle({}, image_w=800, image_h=1000)
    assert angle == 0.0


def test_apply_rotation_zero_degrees_is_noop_size(tmp_path, make_dummy_photo):
    path = make_dummy_photo("photo.png", size=(400, 600))
    img = leveler.apply_rotation(path, 0.0)
    assert img.size == (400, 600)


def test_apply_rotation_expands_canvas(tmp_path, make_dummy_photo):
    path = make_dummy_photo("photo.png", size=(400, 600))
    img = leveler.apply_rotation(path, 15.0)
    assert img.size != (400, 600)
    assert img.size[0] > 400 and img.size[1] > 600


def test_transform_landmarks_matches_actual_rotation(tmp_path, make_dummy_photo):
    """transform_landmarks가 PIL이 실제로 회전시킨 픽셀 위치와 일치하는지 실측 검증."""
    from PIL import Image, ImageDraw

    w, h = 300, 500
    path = tmp_path / "marker.png"
    img = Image.new("RGB", (w, h), (0, 0, 0))
    draw = ImageDraw.Draw(img)
    px, py = 220, 130
    draw.point((px, py), fill=(0, 255, 0))
    img.save(path)

    angle = 9.5
    rotated = leveler.apply_rotation(str(path), angle)
    rotated_nn = Image.open(path).rotate(angle, resample=Image.NEAREST, expand=True, fillcolor=(0, 0, 0))

    found = None
    for y in range(rotated_nn.size[1]):
        for x in range(rotated_nn.size[0]):
            if rotated_nn.getpixel((x, y)) == (0, 255, 0):
                found = (x, y)
                break
        if found:
            break
    assert found is not None

    landmarks = {"PT": (px / w, py / h, 0.0, 1.0)}
    predicted = leveler.transform_landmarks(landmarks, w, h, angle, *rotated.size)["PT"]
    assert abs(predicted[0] - found[0]) < 1.5
    assert abs(predicted[1] - found[1]) < 1.5
