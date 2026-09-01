# -*- coding: utf-8 -*-
"""크롭 (요구사항 5.4).

핵심 원칙: AI 1차 자동크롭 -> 사람 확정/수정, 항상 비파괴적.

- compute_crop_box()/propose_crop_box(): 좌표만 계산해서 반환한다. 파일을 쓰지 않는다.
  검수 UI(PATCH /photos/{id})에서 사람이 드래그로 넓히거나 좁히거나 되돌리는 것도 결국
  이 crop_box 좌표를 갱신하는 것뿐이며, raw_path의 실제 픽셀은 절대 건드리지 않는다.
- export_cropped_image(): PPT 생성 직전(services/generate_service.py)에서 딱 한 번만 호출되어
  실제로 회전+크롭한 픽셀을 별도 파일로 저장한다. 이 함수 외에는 어디에서도 원본을 잘라
  파일로 저장하지 않는다 — 그래야 "한번 잘라낸 뒤 다시 넓힐 수 없는 구조"를 원천적으로 막는다.
"""
from pathlib import Path

from PIL import Image

import config
from preprocessing import leveler
from ppt_generator.compos import WIDE_COMPOS

FULL_COMPOS = {1, 2, 7, 11, 12}
TORSO_COMPOS = {3, 8, 13}
UPPER_COMPOS = {4, 5, 9, 14, 15}
LOWER_COMPOS = {6, 10, 16}

Point = tuple[float, float]
LandmarksPx = dict[str, tuple[float, float, float]]  # name -> (x, y, visibility)


def _visible(landmarks_px: LandmarksPx, name: str) -> Point | None:
    """visibility가 임계값 미만인 랜드마크(가려져서 MediaPipe가 대략 찍은 좌표)는 앵커점에서
    제외한다. 필터링 없이 쓰면 화면 밖 위치로 잘못 추정된 좌표 하나가 bbox 전체를 캔버스 밖으로
    끌고 나가, 회전으로 생긴 검은 여백(leveler.apply_rotation의 fillcolor)만 크롭되는 문제가
    있었다."""
    p = landmarks_px.get(name)
    if p is None or p[2] < config.LANDMARK_VISIBILITY_THRESHOLD:
        return None
    return (p[0], p[1])


def _category_for(compos_id: int) -> str:
    if compos_id in FULL_COMPOS:
        return "full"
    if compos_id in TORSO_COMPOS:
        return "torso"
    if compos_id in UPPER_COMPOS:
        return "upper"
    if compos_id in LOWER_COMPOS:
        return "lower"
    return "full"


def _estimate_head_top_y(landmarks_px: LandmarksPx) -> float | None:
    """정수리 y좌표 추정. MediaPipe에는 정수리 랜드마크가 없어 코-어깨중점 거리로 근사한다."""
    nose = _visible(landmarks_px, "NOSE")
    if nose is None:
        return None
    shoulders = [p for p in (_visible(landmarks_px, "LEFT_SHOULDER"), _visible(landmarks_px, "RIGHT_SHOULDER")) if p]
    if not shoulders:
        return nose[1]
    shoulder_mid_y = sum(p[1] for p in shoulders) / len(shoulders)
    return nose[1] - (shoulder_mid_y - nose[1]) * config.HEAD_MARGIN_FACTOR


def _collect_anchor_points(landmarks_px: LandmarksPx, compos_id: int) -> list[Point]:
    category = _category_for(compos_id)
    wide = compos_id in WIDE_COMPOS
    points: list[Point] = []

    if category in ("full", "upper", "torso"):
        for name in ("LEFT_SHOULDER", "RIGHT_SHOULDER"):
            p = _visible(landmarks_px, name)
            if p is not None:
                points.append(p)

    if category in ("full", "upper"):
        head_top_y = _estimate_head_top_y(landmarks_px)
        if head_top_y is not None:
            nose = _visible(landmarks_px, "NOSE")
            head_x = nose[0] if nose is not None else (points[0][0] if points else None)
            if head_x is not None:
                points.append((head_x, head_top_y))

    if category in ("full", "lower"):
        for name in ("LEFT_HIP", "RIGHT_HIP", "LEFT_KNEE", "RIGHT_KNEE",
                      "LEFT_ANKLE", "RIGHT_ANKLE", "LEFT_FOOT_INDEX", "RIGHT_FOOT_INDEX"):
            p = _visible(landmarks_px, name)
            if p is not None:
                points.append(p)
    elif category in ("upper", "torso"):
        for name in ("LEFT_HIP", "RIGHT_HIP"):
            p = _visible(landmarks_px, name)
            if p is not None:
                points.append(p)

    if category == "upper" and wide:
        for name in ("LEFT_WRIST", "RIGHT_WRIST", "LEFT_ELBOW", "RIGHT_ELBOW"):
            p = _visible(landmarks_px, name)
            if p is not None:
                points.append(p)

    return points


def _center_and_clamp(cx: float, cy: float, crop_w: float, crop_h: float,
                       img_w: int, img_h: int) -> tuple[int, int, int, int]:
    if crop_w > img_w or crop_h > img_h:
        scale = min(img_w / crop_w, img_h / crop_h)
        crop_w *= scale
        crop_h *= scale

    x0 = cx - crop_w / 2
    y0 = cy - crop_h / 2
    x1 = x0 + crop_w
    y1 = y0 + crop_h

    if x0 < 0:
        x1 -= x0
        x0 = 0
    if y0 < 0:
        y1 -= y0
        y0 = 0
    if x1 > img_w:
        x0 -= (x1 - img_w)
        x1 = img_w
    if y1 > img_h:
        y0 -= (y1 - img_h)
        y1 = img_h

    x0 = max(0.0, x0)
    y0 = max(0.0, y0)

    return int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))


def _fallback_box(img_w: int, img_h: int, ratio_w: int, ratio_h: int) -> tuple[int, int, int, int]:
    """랜드마크가 전혀 없을 때: 이미지 전체를 비율에 맞춰 중앙 크롭."""
    target_ratio = ratio_w / ratio_h
    if img_w / target_ratio <= img_h:
        crop_w, crop_h = img_w, img_w / target_ratio
    else:
        crop_h, crop_w = img_h, img_h * target_ratio
    return _center_and_clamp(img_w / 2, img_h / 2, crop_w, crop_h, img_w, img_h)


def compute_crop_box(
    landmarks_px: LandmarksPx,
    rotated_w: int,
    rotated_h: int,
    compos_id: int,
) -> tuple[int, int, int, int]:
    """랜드마크(회전 후 이미지의 픽셀 좌표) 기반 AI 1차 크롭박스 (x0,y0,x1,y1) 계산.

    파일을 읽거나 쓰지 않는 순수 함수. 앵커 랜드마크가 부족해도 예외를 던지지 않고
    항상 사용 가능한 제안값을 반환한다 (사람이 확정/수정할 시작점이 항상 있어야 하므로).
    """
    ratio_w, ratio_h = config.CROP_RATIOS.get(compos_id, (3, 4))
    points = _collect_anchor_points(landmarks_px, compos_id)

    if not points:
        return _fallback_box(rotated_w, rotated_h, ratio_w, ratio_h)

    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)
    bbox_w, bbox_h = x1 - x0, y1 - y0

    if bbox_w <= 0 or bbox_h <= 0:
        return _fallback_box(rotated_w, rotated_h, ratio_w, ratio_h)

    side_margin = bbox_w * 0.08
    x0 -= side_margin
    x1 += side_margin
    bbox_w = x1 - x0

    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2

    target_ratio = ratio_w / ratio_h
    if bbox_w / target_ratio >= bbox_h:
        crop_w, crop_h = bbox_w, bbox_w / target_ratio
    else:
        crop_h, crop_w = bbox_h, bbox_h * target_ratio

    crop_w *= config.CROP_PADDING_FACTOR
    crop_h *= config.CROP_PADDING_FACTOR

    return _center_and_clamp(cx, cy, crop_w, crop_h, rotated_w, rotated_h)


def propose_crop_box(
    raw_path: str,
    landmarks: dict[str, tuple[float, float, float, float]],
    rotation_deg: float,
    compos_id: int,
) -> tuple[int, int, int, int]:
    """편의 함수: 원본 정규화 랜드마크 + 회전각으로부터 회전 후 이미지 기준 crop_box를 바로 계산.

    내부적으로 apply_rotation()을 호출해 실제 회전 캔버스 크기를 얻은 뒤 compute_crop_box에
    위임한다 (leveler.transform_landmarks가 PIL expand 캔버스와 정확히 일치하도록 검증되어 있음).
    """
    with Image.open(raw_path) as im:
        orig_w, orig_h = im.size

    rotated = leveler.apply_rotation(raw_path, rotation_deg)
    rotated_w, rotated_h = rotated.size

    landmarks_px = leveler.transform_landmarks(landmarks, orig_w, orig_h, rotation_deg, rotated_w, rotated_h)
    return compute_crop_box(landmarks_px, rotated_w, rotated_h, compos_id)


def export_cropped_image(raw_path: str, rotation_deg: float, crop_box: tuple[int, int, int, int],
                          output_path: str, compos_id: int = 1) -> str:
    """PPT 생성 직전에만 호출: 원본을 회전 후 crop_box로 잘라 output_path에 저장.

    raw_path는 절대 수정하지 않는다 (leveler.apply_rotation은 새 이미지를 반환할 뿐 원본을
    건드리지 않음).

    crop_box가 (0,0,0,0) 등 비정상(가로/세로가 0 이하)이면 PIL이 "cannot write empty image"로
    저장에 실패한다. AI 크롭 제안이 아직 없거나(예: 분류확인 화면에서 구도만 재지정하고 크롭
    화면을 거치지 않은 사진) 클라이언트가 잘못된 좌표를 보낸 경우를 대비해, 이 경우 이미지
    전체를 구도 비율에 맞춰 중앙 크롭한 안전한 기본값으로 대체한다.
    """
    rotated = leveler.apply_rotation(raw_path, rotation_deg)

    x0, y0, x1, y1 = crop_box
    if x1 <= x0 or y1 <= y0:
        ratio_w, ratio_h = config.CROP_RATIOS.get(compos_id, (3, 4))
        crop_box = _fallback_box(rotated.width, rotated.height, ratio_w, ratio_h)

    cropped = rotated.crop(crop_box)
    if cropped.mode not in ("RGB", "L"):
        cropped = cropped.convert("RGB")

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    save_kwargs = {"quality": 95} if out.suffix.lower() in (".jpg", ".jpeg") else {}
    cropped.save(output_path, **save_kwargs)
    return output_path
