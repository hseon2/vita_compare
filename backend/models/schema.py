# -*- coding: utf-8 -*-
"""요구사항 정의서 4절 데이터 모델. 필드명은 문서와 동일하게 유지한다.

PPTJob/ShootSession/PhotoAsset은 PPT 생성 직전에 조립되는 "확정된" 표현이다.
검수 위저드 진행 중의 작업 상태는 더 풍부한 구조가 필요해 backend/state/session_store.py
에 별도로 둔다 (예: 아직 구도가 배정되지 않은 사진, 세션타입 등).
"""
from dataclasses import dataclass, field
from datetime import date


@dataclass
class Patient:
    name: str
    patient_id: str  # 내부 식별자 (파일명 충돌 방지용, 이름과 별도)


@dataclass
class PhotoAsset:
    compos_id: int                     # 1~16 (0 = 미분류)
    raw_path: str                      # 원본 업로드 경로 (절대 불변)
    rotation_deg: float                # 적용된 수평 보정 각도
    crop_box: tuple[int, int, int, int]  # 최종 크롭 좌표 (x0,y0,x1,y1), 회전 후 이미지 기준
    cropped_path: str                  # 크롭 완료 이미지 경로 (생성 직전까지는 빈 문자열)
    classification_confidence: float   # 자동분류 신뢰도 (0~1)
    manually_confirmed: bool           # 검수 UI에서 사람이 확인했는지


@dataclass
class ShootSession:
    session_date: date          # 촬영일 (시작/중간/마지막 중 하나)
    session_type: str           # "start" | "mid" | "end"
    photos: dict[int, PhotoAsset] = field(default_factory=dict)  # key = 구도 번호(1~16)


@dataclass
class BodyCompRow:
    label: str              # 예: "복부둘레"
    start: str               # 예: "96.1cm" (단위 포함 문자열로 저장)
    mid: str | None          # 장기모드에서만 값, 표준모드는 None(빈칸으로 표시)
    end: str
    target: str               # 목표치(적정치), 범위 표현 가능 (예: "18~28%")
    highlight: bool            # True면 PPT에서 항목명+수치를 빨간 글씨로 표시
    # 변화량은 저장하지 않고 PPT 생성 시 start/end로 자동 계산 (단위 자동 매칭)


@dataclass
class PPTJob:
    patient: Patient
    mode: str                       # "standard" | "long"
    sessions: list[ShootSession]    # standard=2개(start,end), long=3개(start,mid,end)
    body_comp_rows: list[BodyCompRow]
    output_path: str
