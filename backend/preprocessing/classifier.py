# -*- coding: utf-8 -*-
"""구도 자동 분류 (요구사항 5.2).

4단계 하위 분류기(뷰방향 -> 신체부위 -> 다리벌림/팔벌림)를 거쳐 16개 구도 중 하나로 매핑한다.
각 단계는 (값, confidence)를 반환하고 최종 confidence는 관여한 단계들의 confidence를 곱해
계산한다 — 어느 한 단계라도 애매하면 전체 신뢰도가 떨어져 검수 UI의 "확인 필요" 배지가
뜨도록 하기 위함이다.

미해결 이슈(요구사항 5.2 명시): 정면 vs 후면 구분은 얼굴 랜드마크 신뢰도에 크게 의존하므로
오분류 가능성이 있고, 검수 UI에서 수동 재지정이 항상 가능해야 한다.
"""
import math

import config

Landmarks = dict[str, tuple[float, float, float, float]]

# view/region/variant 조합 -> compos_id ("generate ppt.py" 프로토타입의 LABEL_TO_FILE 명명 기준)
_COMPOS_TABLE: dict[tuple[str, str, str | None], int] = {
    ("front", "full", "apart"): 1,
    ("front", "full", "together"): 2,
    ("front", "torso", None): 3,
    ("front", "upper", "normal"): 4,
    ("front", "upper", "arms_spread"): 5,
    ("front", "lower", None): 6,
    ("side", "full", None): 7,
    ("side", "torso", None): 8,
    ("side", "upper", None): 9,
    ("side", "lower", None): 10,
    ("back", "full", "apart"): 11,
    ("back", "full", "together"): 12,
    ("back", "torso", None): 13,
    ("back", "upper", "normal"): 14,
    ("back", "upper", "arms_spread"): 15,
    ("back", "lower", None): 16,
}


def _visible(landmarks: Landmarks, name: str) -> bool:
    lm = landmarks.get(name)
    return lm is not None and lm[3] >= config.LANDMARK_VISIBILITY_THRESHOLD


def _any_visible(landmarks: Landmarks, names: list[str]) -> bool:
    return any(_visible(landmarks, n) for n in names)


def _all_visible(landmarks: Landmarks, names: list[str]) -> bool:
    return all(_visible(landmarks, n) for n in names)


def _mean_visibility(landmarks: Landmarks, names: list[str]) -> float:
    values = [landmarks[n][3] for n in names if n in landmarks]
    return sum(values) / len(values) if values else 0.0


def _clamp01(v: float) -> float:
    return max(0.0, min(1.0, v))


def _classify_view(landmarks: Landmarks) -> tuple[str, float]:
    """정면(front)/측면(side)/후면(back) 판별.

    어깨-골반 폭 비율로 측면 여부를 먼저 가르고, 정면/후면은 얼굴 랜드마크 가시성으로 구분한다.
    """
    l_sh, r_sh = landmarks.get("LEFT_SHOULDER"), landmarks.get("RIGHT_SHOULDER")
    l_hip, r_hip = landmarks.get("LEFT_HIP"), landmarks.get("RIGHT_HIP")
    if not all([l_sh, r_sh, l_hip, r_hip]):
        return "front", 0.0

    shoulder_w = abs(l_sh[0] - r_sh[0])
    hip_w = abs(l_hip[0] - r_hip[0])
    shoulder_mid_y = (l_sh[1] + r_sh[1]) / 2
    hip_mid_y = (l_hip[1] + r_hip[1]) / 2
    torso_h = abs(hip_mid_y - shoulder_mid_y)
    if torso_h < 1e-6:
        return "front", 0.0

    width_ratio = ((shoulder_w + hip_w) / 2) / torso_h
    threshold = config.SIDE_WIDTH_RATIO_THRESHOLD

    if width_ratio < threshold:
        confidence = _clamp01((threshold - width_ratio) / threshold)
        return "side", confidence

    face_names = ["NOSE", "LEFT_EYE", "RIGHT_EYE", "LEFT_EAR", "RIGHT_EAR"]
    face_vis = _mean_visibility(landmarks, face_names)
    view = "front" if face_vis >= config.LANDMARK_VISIBILITY_THRESHOLD else "back"
    confidence = _clamp01(abs(face_vis - config.LANDMARK_VISIBILITY_THRESHOLD) / config.LANDMARK_VISIBILITY_THRESHOLD)
    return view, confidence


def _classify_region(landmarks: Landmarks) -> tuple[str, float]:
    """전신/상반신/체간/하반신 판별. 어느 랜드마크 그룹이 프레임 안에 들어왔는지로 결정."""
    head_in_frame = _visible(landmarks, "NOSE")
    shoulder_visible = _any_visible(landmarks, ["LEFT_SHOULDER", "RIGHT_SHOULDER"])
    hip_visible = _any_visible(landmarks, ["LEFT_HIP", "RIGHT_HIP"])
    knee_visible = _any_visible(landmarks, ["LEFT_KNEE", "RIGHT_KNEE"])
    ankle_visible = _any_visible(landmarks, ["LEFT_ANKLE", "RIGHT_ANKLE"])

    decisive_names: list[str]
    if shoulder_visible and hip_visible and knee_visible and ankle_visible:
        region = "full"
        decisive_names = ["LEFT_SHOULDER", "RIGHT_SHOULDER", "LEFT_HIP", "RIGHT_HIP",
                           "LEFT_KNEE", "RIGHT_KNEE", "LEFT_ANKLE", "RIGHT_ANKLE"]
    elif head_in_frame and shoulder_visible and hip_visible and not knee_visible:
        region = "upper"
        decisive_names = ["NOSE", "LEFT_SHOULDER", "RIGHT_SHOULDER", "LEFT_HIP", "RIGHT_HIP"]
    elif shoulder_visible and hip_visible and not head_in_frame and not knee_visible:
        region = "torso"
        decisive_names = ["LEFT_SHOULDER", "RIGHT_SHOULDER", "LEFT_HIP", "RIGHT_HIP"]
    elif hip_visible and knee_visible and ankle_visible and not shoulder_visible:
        region = "lower"
        decisive_names = ["LEFT_HIP", "RIGHT_HIP", "LEFT_KNEE", "RIGHT_KNEE", "LEFT_ANKLE", "RIGHT_ANKLE"]
    else:
        # 애매한 패턴 - 그나마 가장 가까운 카테고리로 낮은 신뢰도로 폴백
        if shoulder_visible and hip_visible:
            region = "upper" if not knee_visible else "full"
        elif hip_visible:
            region = "lower"
        else:
            region = "upper"
        decisive_names = ["LEFT_SHOULDER", "RIGHT_SHOULDER", "LEFT_HIP", "RIGHT_HIP"]
        thr = config.LANDMARK_VISIBILITY_THRESHOLD
        conf = _clamp01(_mean_visibility(landmarks, decisive_names))
        return region, min(conf, 0.4)

    thr = config.LANDMARK_VISIBILITY_THRESHOLD
    diffs = [abs(landmarks[n][3] - thr) / max(thr, 1 - thr) for n in decisive_names if n in landmarks]
    confidence = _clamp01(sum(diffs) / len(diffs)) if diffs else 0.0
    return region, confidence


def _classify_leg_spread(landmarks: Landmarks) -> tuple[str, float]:
    """다리 벌림/오므림 판별 (전신 구도에서만 사용). 발목간 거리 / 어깨너비 비율 기준."""
    l_ankle, r_ankle = landmarks.get("LEFT_ANKLE"), landmarks.get("RIGHT_ANKLE")
    l_sh, r_sh = landmarks.get("LEFT_SHOULDER"), landmarks.get("RIGHT_SHOULDER")
    if not all([l_ankle, r_ankle, l_sh, r_sh]):
        return "together", 0.0

    ankle_dist = math.hypot(l_ankle[0] - r_ankle[0], l_ankle[1] - r_ankle[1])
    shoulder_w = math.hypot(l_sh[0] - r_sh[0], l_sh[1] - r_sh[1])
    if shoulder_w < 1e-6:
        return "together", 0.0

    leg_ratio = ankle_dist / shoulder_w
    threshold = config.LEG_SPREAD_RATIO_THRESHOLD
    variant = "apart" if leg_ratio > threshold else "together"
    confidence = _clamp01(abs(leg_ratio - threshold) / threshold)
    return variant, confidence


def _classify_arm_spread(landmarks: Landmarks) -> tuple[str, float]:
    """팔벌림 여부 판별 (상반신 구도 5, 15번 후보에서만 사용). 팔꿈치-어깨 각도가 수평에 가까운지."""
    sides = [("LEFT_SHOULDER", "LEFT_ELBOW"), ("RIGHT_SHOULDER", "RIGHT_ELBOW")]
    angles = []
    for sh_name, el_name in sides:
        sh, el = landmarks.get(sh_name), landmarks.get(el_name)
        if sh is None or el is None or sh[3] < config.LANDMARK_VISIBILITY_THRESHOLD or el[3] < config.LANDMARK_VISIBILITY_THRESHOLD:
            continue
        angle = math.degrees(math.atan2(el[1] - sh[1], el[0] - sh[0]))
        angle_from_horizontal = min(abs(angle), abs(180 - abs(angle)))
        angles.append(angle_from_horizontal)

    if not angles:
        return "normal", 0.0

    avg_angle = sum(angles) / len(angles)
    threshold = config.ARM_SPREAD_ANGLE_THRESHOLD_DEG
    variant = "arms_spread" if avg_angle < threshold else "normal"
    confidence = _clamp01(abs(avg_angle - threshold) / threshold)
    return variant, confidence


def classify(landmarks: Landmarks) -> tuple[int, float]:
    """랜드마크로부터 (compos_id, confidence)를 반환. 절대 예외를 던지지 않고,
    완전히 애매한 경우에도 최선의 추정치를 낮은 confidence와 함께 반환한다.
    """
    view, view_conf = _classify_view(landmarks)
    region, region_conf = _classify_region(landmarks)

    variant: str | None = None
    variant_conf = 1.0

    if region == "full" and view in ("front", "back"):
        variant, variant_conf = _classify_leg_spread(landmarks)
    elif region == "upper" and view in ("front", "back"):
        variant, variant_conf = _classify_arm_spread(landmarks)

    key = (view, region, variant)
    compos_id = _COMPOS_TABLE.get(key)
    if compos_id is None:
        # 조합이 테이블에 없으면(예: 측면+전신+variant처럼 정의되지 않은 조합) region/view만으로 재시도
        fallback_key = (view, region, None)
        compos_id = _COMPOS_TABLE.get(fallback_key, 1)
        variant_conf = min(variant_conf, 0.3)

    confidence = _clamp01(view_conf * region_conf * variant_conf)
    return compos_id, confidence
