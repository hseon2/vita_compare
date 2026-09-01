# -*- coding: utf-8 -*-
"""수평 조정 (요구사항 5.3).

어깨-어깨 라인(우선) 또는 눈-눈 라인(어깨 미검출 시 대체)의 기울기를 계산해 반대 방향으로
회전한다. 항상 raw_path(원본)를 기준으로 재계산하므로 비파괴적이며, 슬라이더로 각도를
몇 번이고 다시 조정해도 원본 화질이 그대로 유지된다.

어깨를 우선하는 이유: 이 앱의 사진은 전신/상반신 위주라 얼굴이 화면에서 작게 나오고, 눈-눈
간격은 그만큼 짧은 baseline이 된다. atan2(dy,dx)로 각도를 구할 때 baseline이 짧으면 MediaPipe
랜드마크의 몇 픽셀 오차만으로도 각도 추정치가 크게 흔들린다 (실사용 중 "수평조정이 이상하게
나온다" 문제로 확인됨). 어깨는 baseline이 훨씬 넓어 같은 픽셀 오차에도 각도 오차가 작다.
"""
import math

from PIL import Image

import config


def _order_by_image_x(p1, p2):
    """두 랜드마크를 이미지 x좌표 기준(작은 쪽이 left)으로 정렬해 반환.

    MediaPipe의 LEFT_*/RIGHT_* 라벨은 인체 해부학적 기준이라 정면/후면 촬영에 따라
    이미지상 좌우가 뒤바뀐다. atan2(dy,dx)로 각도를 구할 때 dx의 부호가 뒤집히면
    소각도 보정 대신 거의 180도짜리(이미지가 뒤집히는) 회전각이 나올 수 있으므로,
    항상 이미지 좌표 기준으로 정렬해 dx>=0을 보장한다.
    """
    return (p1, p2) if p1[0] <= p2[0] else (p2, p1)


def compute_rotation_angle(landmarks: dict, image_w: int, image_h: int) -> float:
    """어깨 라인(우선) 또는 눈 라인 기울기로부터 보정 회전각(도)을 계산.

    반환값은 그대로 apply_rotation()/PIL Image.rotate()에 전달하면 라인이 수평이 되도록
    설계되어 있다. 기준 랜드마크가 없거나 신뢰도가 낮으면 0.0을 반환한다.
    """
    left_shoulder = landmarks.get("LEFT_SHOULDER")
    right_shoulder = landmarks.get("RIGHT_SHOULDER")
    use_shoulders = (
        left_shoulder is not None
        and right_shoulder is not None
        and left_shoulder[3] >= config.LANDMARK_VISIBILITY_THRESHOLD
        and right_shoulder[3] >= config.LANDMARK_VISIBILITY_THRESHOLD
    )

    if use_shoulders:
        p1, p2 = left_shoulder, right_shoulder
    else:
        p1, p2 = landmarks.get("LEFT_EYE"), landmarks.get("RIGHT_EYE")

    if p1 is None or p2 is None:
        return 0.0

    left_pt, right_pt = _order_by_image_x(p1, p2)
    dx = (right_pt[0] - left_pt[0]) * image_w
    dy = (right_pt[1] - left_pt[1]) * image_h
    if dx == 0 and dy == 0:
        return 0.0
    return math.degrees(math.atan2(dy, dx))


def apply_rotation(raw_path: str, rotation_deg: float) -> Image.Image:
    """원본 이미지를 rotation_deg만큼 회전한 새 PIL Image를 반환 (원본 파일은 건드리지 않음).

    expand=True로 잘리는 부분 없이 캔버스를 확장한다. rotation_deg=0이면 원본과 동일한
    내용(회전 없음)을 반환한다.
    """
    img = Image.open(raw_path)
    if rotation_deg == 0:
        return img.copy()
    return img.rotate(rotation_deg, resample=Image.BICUBIC, expand=True, fillcolor=(0, 0, 0))


def transform_landmarks(
    landmarks: dict,
    orig_w: int,
    orig_h: int,
    rotation_deg: float,
    rotated_w: int,
    rotated_h: int,
) -> dict[str, tuple[float, float, float]]:
    """정규화된 원본 랜드마크를 회전 후 이미지의 픽셀 좌표(x, y, visibility)로 변환.

    rotated_w/rotated_h는 apply_rotation()이 실제로 반환한 이미지의 .size를 그대로 넘겨야
    한다 (PIL의 expand 캔버스 크기를 직접 재계산하면 반올림 방식 차이로 어긋날 수 있음).
    회전 변환 자체는 PIL.Image.rotate()가 사용하는 변환과 실측으로 검증된 동일한 공식을 쓴다.
    visibility는 그대로 통과시킨다 - cropper.py가 낮은 신뢰도 랜드마크(가려져서 MediaPipe가
    대략 찍은 좌표)를 앵커점 계산에서 걸러내는 데 사용한다.
    """
    theta = math.radians(rotation_deg)
    cos_t, sin_t = math.cos(theta), math.sin(theta)
    orig_cx, orig_cy = orig_w / 2, orig_h / 2
    new_cx, new_cy = rotated_w / 2, rotated_h / 2

    result: dict[str, tuple[float, float, float]] = {}
    for name, (x, y, _z, v) in landmarks.items():
        px, py = x * orig_w, y * orig_h
        rx, ry = px - orig_cx, py - orig_cy
        nx = rx * cos_t + ry * sin_t
        ny = -rx * sin_t + ry * cos_t
        result[name] = (nx + new_cx, ny + new_cy, v)
    return result
