# -*- coding: utf-8 -*-
"""구도 분류 로직 검증.

주의: 이 테스트는 합성 랜드마크로 분류 로직/임계값의 자기일관성만 검증한다. 실제 환자
사진에 대한 정확도 검증은 사용자가 실사진을 제공해야 가능하며 이 범위 밖이다
(요구사항 5.2의 "정면 vs 후면 구분은 얼굴 랜드마크 신뢰도에 크게 의존" 이슈 참고).
"""
from preprocessing import classifier


def _lm(x, y, v=1.0, z=0.0):
    return (x, y, z, v)


def test_front_full_legs_apart_is_compos_1():
    landmarks = {
        "NOSE": _lm(0.50, 0.10), "LEFT_EYE": _lm(0.52, 0.09), "RIGHT_EYE": _lm(0.48, 0.09),
        "LEFT_EAR": _lm(0.55, 0.10), "RIGHT_EAR": _lm(0.45, 0.10),
        "LEFT_SHOULDER": _lm(0.58, 0.20), "RIGHT_SHOULDER": _lm(0.42, 0.20),
        "LEFT_HIP": _lm(0.56, 0.55), "RIGHT_HIP": _lm(0.44, 0.55),
        "LEFT_KNEE": _lm(0.60, 0.75), "RIGHT_KNEE": _lm(0.40, 0.75),
        "LEFT_ANKLE": _lm(0.69, 0.95), "RIGHT_ANKLE": _lm(0.31, 0.95),
        "LEFT_FOOT_INDEX": _lm(0.70, 0.98), "RIGHT_FOOT_INDEX": _lm(0.30, 0.98),
    }
    compos_id, confidence = classifier.classify(landmarks)
    assert compos_id == 1
    assert confidence >= 0.7


def test_front_full_legs_together_is_compos_2():
    landmarks = {
        "NOSE": _lm(0.50, 0.10), "LEFT_EYE": _lm(0.52, 0.09), "RIGHT_EYE": _lm(0.48, 0.09),
        "LEFT_EAR": _lm(0.55, 0.10), "RIGHT_EAR": _lm(0.45, 0.10),
        "LEFT_SHOULDER": _lm(0.58, 0.20), "RIGHT_SHOULDER": _lm(0.42, 0.20),
        "LEFT_HIP": _lm(0.56, 0.55), "RIGHT_HIP": _lm(0.44, 0.55),
        "LEFT_KNEE": _lm(0.51, 0.75), "RIGHT_KNEE": _lm(0.49, 0.75),
        "LEFT_ANKLE": _lm(0.508, 0.95), "RIGHT_ANKLE": _lm(0.492, 0.95),
        "LEFT_FOOT_INDEX": _lm(0.51, 0.98), "RIGHT_FOOT_INDEX": _lm(0.49, 0.98),
    }
    compos_id, confidence = classifier.classify(landmarks)
    assert compos_id == 2
    assert confidence >= 0.7


def test_back_full_legs_apart_is_compos_11():
    """얼굴 랜드마크 신뢰도가 낮으면 후면으로 판별되어야 한다."""
    landmarks = {
        "NOSE": _lm(0.50, 0.10, v=0.1), "LEFT_EYE": _lm(0.52, 0.09, v=0.1), "RIGHT_EYE": _lm(0.48, 0.09, v=0.1),
        "LEFT_EAR": _lm(0.55, 0.10, v=0.1), "RIGHT_EAR": _lm(0.45, 0.10, v=0.1),
        "LEFT_SHOULDER": _lm(0.58, 0.20), "RIGHT_SHOULDER": _lm(0.42, 0.20),
        "LEFT_HIP": _lm(0.56, 0.55), "RIGHT_HIP": _lm(0.44, 0.55),
        "LEFT_KNEE": _lm(0.60, 0.75), "RIGHT_KNEE": _lm(0.40, 0.75),
        "LEFT_ANKLE": _lm(0.69, 0.95), "RIGHT_ANKLE": _lm(0.31, 0.95),
        "LEFT_FOOT_INDEX": _lm(0.70, 0.98), "RIGHT_FOOT_INDEX": _lm(0.30, 0.98),
    }
    compos_id, confidence = classifier.classify(landmarks)
    assert compos_id == 11
    assert confidence >= 0.7


def test_side_full_is_compos_7():
    landmarks = {
        "LEFT_SHOULDER": _lm(0.51, 0.20), "RIGHT_SHOULDER": _lm(0.48, 0.20),
        "LEFT_HIP": _lm(0.505, 0.55), "RIGHT_HIP": _lm(0.475, 0.55),
        "LEFT_KNEE": _lm(0.50, 0.75), "RIGHT_KNEE": _lm(0.48, 0.75),
        "LEFT_ANKLE": _lm(0.50, 0.95), "RIGHT_ANKLE": _lm(0.48, 0.95),
    }
    compos_id, confidence = classifier.classify(landmarks)
    assert compos_id == 7
    assert confidence >= 0.5


def test_front_torso_is_compos_3():
    """머리가 프레임 밖(코 신뢰도 낮음)이라 체간 구도로 판별되어야 한다."""
    landmarks = {
        "NOSE": _lm(0.50, -0.05, v=0.4),
        "LEFT_EYE": _lm(0.52, -0.06, v=0.9), "RIGHT_EYE": _lm(0.48, -0.06, v=0.9),
        "LEFT_EAR": _lm(0.55, -0.05, v=0.9), "RIGHT_EAR": _lm(0.45, -0.05, v=0.9),
        "LEFT_SHOULDER": _lm(0.58, 0.10), "RIGHT_SHOULDER": _lm(0.42, 0.10),
        "LEFT_HIP": _lm(0.56, 0.45), "RIGHT_HIP": _lm(0.44, 0.45),
    }
    compos_id, confidence = classifier.classify(landmarks)
    assert compos_id == 3


def test_front_upper_normal_is_compos_4():
    landmarks = {
        "NOSE": _lm(0.50, 0.10), "LEFT_EYE": _lm(0.52, 0.09), "RIGHT_EYE": _lm(0.48, 0.09),
        "LEFT_EAR": _lm(0.55, 0.10), "RIGHT_EAR": _lm(0.45, 0.10),
        "LEFT_SHOULDER": _lm(0.58, 0.20), "RIGHT_SHOULDER": _lm(0.42, 0.20),
        "LEFT_HIP": _lm(0.56, 0.55), "RIGHT_HIP": _lm(0.44, 0.55),
        "LEFT_ELBOW": _lm(0.60, 0.35), "RIGHT_ELBOW": _lm(0.40, 0.35),
    }
    compos_id, confidence = classifier.classify(landmarks)
    assert compos_id == 4
    assert confidence >= 0.5


def test_front_upper_arms_spread_is_compos_5():
    landmarks = {
        "NOSE": _lm(0.50, 0.10), "LEFT_EYE": _lm(0.52, 0.09), "RIGHT_EYE": _lm(0.48, 0.09),
        "LEFT_EAR": _lm(0.55, 0.10), "RIGHT_EAR": _lm(0.45, 0.10),
        "LEFT_SHOULDER": _lm(0.58, 0.20), "RIGHT_SHOULDER": _lm(0.42, 0.20),
        "LEFT_HIP": _lm(0.56, 0.55), "RIGHT_HIP": _lm(0.44, 0.55),
        "LEFT_ELBOW": _lm(0.85, 0.22), "RIGHT_ELBOW": _lm(0.15, 0.22),
    }
    compos_id, confidence = classifier.classify(landmarks)
    assert compos_id == 5
    assert confidence >= 0.5


def test_back_upper_arms_spread_is_compos_15():
    landmarks = {
        "NOSE": _lm(0.50, 0.10, v=0.9),
        "LEFT_EYE": _lm(0.52, 0.09, v=0.1), "RIGHT_EYE": _lm(0.48, 0.09, v=0.1),
        "LEFT_EAR": _lm(0.55, 0.10, v=0.1), "RIGHT_EAR": _lm(0.45, 0.10, v=0.1),
        "LEFT_SHOULDER": _lm(0.58, 0.20), "RIGHT_SHOULDER": _lm(0.42, 0.20),
        "LEFT_HIP": _lm(0.56, 0.55), "RIGHT_HIP": _lm(0.44, 0.55),
        "LEFT_ELBOW": _lm(0.85, 0.22), "RIGHT_ELBOW": _lm(0.15, 0.22),
    }
    compos_id, confidence = classifier.classify(landmarks)
    assert compos_id == 15


def test_lower_body_only_returns_valid_compos_with_low_confidence():
    """어깨/얼굴 랜드마크가 전혀 없는 하반신 단독 촬영은 정면/후면을 landmark만으로
    구분할 수 없다 (요구사항 5.2 미해결 이슈와 동일한 근본적 한계) - 이 경우 검수 UI의
    '확인 필요' 배지(confidence < 0.7)로 사람이 확인하도록 유도하는 것이 설계 의도다.
    """
    landmarks = {
        "LEFT_HIP": _lm(0.56, 0.10), "RIGHT_HIP": _lm(0.44, 0.10),
        "LEFT_KNEE": _lm(0.55, 0.40), "RIGHT_KNEE": _lm(0.45, 0.40),
        "LEFT_ANKLE": _lm(0.54, 0.70), "RIGHT_ANKLE": _lm(0.46, 0.70),
    }
    compos_id, confidence = classifier.classify(landmarks)
    assert compos_id in (6, 16)
    assert confidence < 0.7


def test_borderline_leg_spread_yields_low_confidence():
    """다리벌림/오므림 경계값 근처에서는 신뢰도가 낮게 나와야 검수 UI 배지가 뜬다."""
    landmarks = {
        "NOSE": _lm(0.50, 0.10), "LEFT_EYE": _lm(0.52, 0.09), "RIGHT_EYE": _lm(0.48, 0.09),
        "LEFT_EAR": _lm(0.55, 0.10), "RIGHT_EAR": _lm(0.45, 0.10),
        "LEFT_SHOULDER": _lm(0.58, 0.20), "RIGHT_SHOULDER": _lm(0.42, 0.20),
        "LEFT_HIP": _lm(0.56, 0.55), "RIGHT_HIP": _lm(0.44, 0.55),
        "LEFT_KNEE": _lm(0.57, 0.75), "RIGHT_KNEE": _lm(0.43, 0.75),
        # 어깨너비(0.16)의 1.2배(임계값) 근방인 발목간격
        "LEFT_ANKLE": _lm(0.596, 0.95), "RIGHT_ANKLE": _lm(0.404, 0.95),
        "LEFT_FOOT_INDEX": _lm(0.60, 0.98), "RIGHT_FOOT_INDEX": _lm(0.40, 0.98),
    }
    compos_id, confidence = classifier.classify(landmarks)
    assert compos_id in (1, 2)
    assert confidence < 0.7


def test_empty_landmarks_never_raises():
    compos_id, confidence = classifier.classify({})
    assert isinstance(compos_id, int)
    assert 0.0 <= confidence <= 1.0
