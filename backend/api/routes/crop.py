# -*- coding: utf-8 -*-
"""검수 엔드포인트: PATCH photos/{id}, GET photos, POST body-comp (요구사항 5.4, 5.5.2).

PATCH는 파일에 손대지 않고 crop_box/rotation_deg/compos_id 좌표만 갱신한다 (비파괴 원칙).
실제 픽셀 크롭은 services/generate_service.py가 PPT 생성 시점에만 수행한다.
"""
from collections import Counter
from pathlib import Path

from fastapi import APIRouter, Response

import config
from api.errors import AppError
from api.routes.upload import photo_to_out
from api.schemas import (
    BodyCompGetResponse,
    BodyCompRowIn,
    BodyCompSaveRequest,
    PhotoOut,
    PhotoPatchRequest,
    PhotosGroupedResponse,
)
from models.schema import BodyCompRow
from preprocessing.cropper import propose_crop_box
from preprocessing.pose_detector import PoseNotDetectedError, detect_landmarks
from state import session_store
from state.session_store import PhotoRecord, SessionState

router = APIRouter(prefix="/api/sessions", tags=["crop"])


def _duplicate_photo_ids(state: SessionState) -> set[str]:
    counts: Counter[tuple[str, int]] = Counter()
    for record in state.photos.values():
        if record.compos_id > 0:
            counts[(record.session_type, record.compos_id)] += 1
    return {
        photo_id
        for photo_id, record in state.photos.items()
        if record.compos_id > 0 and counts[(record.session_type, record.compos_id)] > 1
    }


def _missing_compos(state: SessionState) -> dict[str, list[int]]:
    session_types = ["start", "mid", "end"] if state.mode == "long" else ["start", "end"]
    assigned: dict[str, set[int]] = {st: set() for st in session_types}
    for record in state.photos.values():
        if record.session_type in assigned and record.compos_id > 0:
            assigned[record.session_type].add(record.compos_id)
    return {st: sorted(set(range(1, 17)) - ids) for st, ids in assigned.items()}


@router.get("/{session_id}/photos", response_model=PhotosGroupedResponse)
def get_session_photos(session_id: str) -> PhotosGroupedResponse:
    state = session_store.get_session(session_id)
    dup_ids = _duplicate_photo_ids(state)
    photos = []
    for photo_id, record in state.photos.items():
        out = photo_to_out(photo_id, record)
        out.duplicate = photo_id in dup_ids
        photos.append(out)
    return PhotosGroupedResponse(photos=photos, missing_compos=_missing_compos(state))


@router.patch("/{session_id}/photos/{photo_id}", response_model=PhotoOut)
def patch_photo(session_id: str, photo_id: str, body: PhotoPatchRequest) -> PhotoOut:
    def mutator(s: SessionState) -> None:
        record = s.photos.get(photo_id)
        if record is None:
            raise AppError("PHOTO_NOT_FOUND", f"사진을 찾을 수 없습니다: {photo_id}", 404)

        changed = False
        if body.session_type is not None and body.session_type != record.session_type:
            # 미리보기에서 시작일<->종료일 섹션으로 드래그해 옮긴 경우 - 실제 파일도 해당
            # session_type 하위 폴더로 옮겨야 raw_path가 계속 유효하다.
            old_raw = Path(record.raw_path)
            new_raw_dir = config.SOURCE_DIR / s.patient.name / "raw" / body.session_type
            new_raw_dir.mkdir(parents=True, exist_ok=True)
            new_raw_path = new_raw_dir / old_raw.name
            if old_raw.exists():
                old_raw.rename(new_raw_path)
            record.raw_path = str(new_raw_path)
            if record.cropped_path:
                old_cropped = Path(record.cropped_path)
                if old_cropped.exists():
                    new_cropped_dir = config.SOURCE_DIR / s.patient.name / "cropped" / body.session_type
                    new_cropped_dir.mkdir(parents=True, exist_ok=True)
                    new_cropped_path = new_cropped_dir / old_cropped.name
                    old_cropped.rename(new_cropped_path)
                    record.cropped_path = str(new_cropped_path)
            record.session_type = body.session_type
            changed = True
        if body.compos_id is not None:
            record.compos_id = body.compos_id
            record.classification_confidence = 1.0
            changed = True

            # 구도만 재지정되고(크롭박스는 이번 요청에 없음) 새 구도 기준 크롭 제안이 아직 없으면
            # 새로 계산한다 (수평각은 자동으로 건드리지 않는다 - 회전은 항상 사람이 슬라이더로
            # 직접 조절한다는 원칙). 이걸 안 하면 crop_box가 이전 구도(또는 미분류 상태의
            # (0,0,0,0))에 머물러 있다가 PPT 생성 시점에야 문제가 드러난다.
            if body.crop_box is None:
                try:
                    landmarks = detect_landmarks(record.raw_path)
                    record.crop_box = propose_crop_box(
                        record.raw_path, landmarks, record.rotation_deg, record.compos_id
                    )
                    record.pose_error = False
                except PoseNotDetectedError:
                    record.pose_error = True
                    # crop_box는 손대지 않는다 - export_cropped_image가 생성 시점에
                    # 구도 비율 기준 기본 박스로 안전하게 대체한다.
        if body.rotation_deg is not None:
            record.rotation_deg = body.rotation_deg
            changed = True
        if body.crop_box is not None:
            record.crop_box = body.crop_box
            changed = True

        if body.manually_confirmed is not None:
            record.manually_confirmed = body.manually_confirmed
        elif changed:
            record.manually_confirmed = True

        if body.crop_box is not None and body.sync_size and record.compos_id > 0:
            new_w = body.crop_box[2] - body.crop_box[0]
            new_h = body.crop_box[3] - body.crop_box[1]
            for other_id, other in s.photos.items():
                if other_id == photo_id or other.compos_id != record.compos_id:
                    continue
                ox0, oy0, ox1, oy1 = other.crop_box
                ocx, ocy = (ox0 + ox1) / 2, (oy0 + oy1) / 2
                other.crop_box = (
                    max(0, int(round(ocx - new_w / 2))),
                    max(0, int(round(ocy - new_h / 2))),
                    max(0, int(round(ocx + new_w / 2))),
                    max(0, int(round(ocy + new_h / 2))),
                )

    state = session_store.update_session(session_id, mutator)
    return photo_to_out(photo_id, state.photos[photo_id])


@router.delete("/{session_id}/photos/{photo_id}", status_code=204)
def delete_photo(session_id: str, photo_id: str) -> Response:
    """업로드 미리보기에서 잘못 올린 사진을 삭제한다. 원본/크롭 파일도 함께 지운다."""
    removed: PhotoRecord | None = None

    def mutator(s: SessionState) -> None:
        nonlocal removed
        removed = s.photos.pop(photo_id, None)
        if removed is None:
            raise AppError("PHOTO_NOT_FOUND", f"사진을 찾을 수 없습니다: {photo_id}", 404)

    session_store.update_session(session_id, mutator)
    if removed is not None:
        for path_str in (removed.raw_path, removed.cropped_path):
            if path_str:
                Path(path_str).unlink(missing_ok=True)
    return Response(status_code=204)


@router.get("/{session_id}/body-comp", response_model=BodyCompGetResponse)
def get_body_comp(session_id: str) -> BodyCompGetResponse:
    """새로고침 후 화면4(체성분 입력폼)을 서버 상태만으로 복원하기 위한 조회 엔드포인트."""
    state = session_store.get_session(session_id)
    rows = [
        BodyCompRowIn(label=r.label, start=r.start, mid=r.mid, end=r.end,
                      target=r.target, highlight=r.highlight)
        for r in state.body_comp_rows
    ]
    return BodyCompGetResponse(rows=rows)


@router.post("/{session_id}/body-comp")
def save_body_comp(session_id: str, body: BodyCompSaveRequest) -> dict:
    def mutator(s: SessionState) -> None:
        s.body_comp_rows = [
            BodyCompRow(label=r.label, start=r.start, mid=r.mid, end=r.end,
                        target=r.target, highlight=r.highlight)
            for r in body.rows
        ]

    session_store.update_session(session_id, mutator)
    return {"ok": True}
