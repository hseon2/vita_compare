# -*- coding: utf-8 -*-
"""업로드 엔드포인트: POST /api/sessions, POST /api/sessions/{id}/photos (요구사항 5.5.2)."""
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, UploadFile

import config
from api.errors import AppError
from api.schemas import (
    PhotoOut,
    SessionCreateRequest,
    SessionCreateResponse,
    SessionMetaResponse,
    SessionPatchRequest,
)
from ppt_generator.compos import label_for
from state import session_store
from state.session_store import PhotoRecord, SessionState

router = APIRouter(prefix="/api/sessions", tags=["upload"])


def photo_to_out(photo_id: str, record: PhotoRecord) -> PhotoOut:
    thumb_rel = Path(record.raw_path).resolve().relative_to(config.SOURCE_DIR.resolve())
    return PhotoOut(
        photo_id=photo_id,
        session_type=record.session_type,
        original_filename=record.original_filename,
        compos_id=record.compos_id,
        compos_label=label_for(record.compos_id) if record.compos_id else "미분류",
        classification_confidence=record.classification_confidence,
        low_confidence=record.classification_confidence < config.CONFIDENCE_THRESHOLD,
        manually_confirmed=record.manually_confirmed,
        pose_error=record.pose_error,
        rotation_deg=record.rotation_deg,
        crop_box=tuple(record.crop_box),
        thumbnail_url=f"{config.STATIC_URL_PREFIX}/{thumb_rel.as_posix()}",
        duplicate=False,
    )


@router.post("", response_model=SessionCreateResponse)
def create_session(body: SessionCreateRequest) -> SessionCreateResponse:
    patient_id = uuid.uuid4().hex[:8]
    state = session_store.create_session(body.patient_name, patient_id, body.mode)
    (config.SOURCE_DIR / body.patient_name / "raw").mkdir(parents=True, exist_ok=True)
    (config.SOURCE_DIR / body.patient_name / "cropped").mkdir(parents=True, exist_ok=True)
    (config.OUTPUT_DIR / body.patient_name).mkdir(parents=True, exist_ok=True)
    return SessionCreateResponse(session_id=state.session_id)


@router.get("/{session_id}", response_model=SessionMetaResponse)
def get_session_meta(session_id: str) -> SessionMetaResponse:
    """새로고침 후 화면1(환자명/모드)을 서버 상태만으로 복원하기 위한 조회 엔드포인트."""
    state = session_store.get_session(session_id)
    return SessionMetaResponse(
        session_id=state.session_id,
        patient_name=state.patient.name,
        mode=state.mode,
        created_at=state.created_at,
        session_dates=dict(state.session_dates),
    )


@router.patch("/{session_id}", response_model=SessionMetaResponse)
def patch_session_meta(session_id: str, body: SessionPatchRequest) -> SessionMetaResponse:
    """환자명 오타 수정, 촬영 도중 표준→장기 모드 전환 등 세션 생성 후 메타 정보 수정용."""
    def mutator(s: SessionState) -> None:
        if body.patient_name is not None:
            s.patient.name = body.patient_name
        if body.mode is not None:
            s.mode = body.mode

    state = session_store.update_session(session_id, mutator)
    (config.SOURCE_DIR / state.patient.name / "raw").mkdir(parents=True, exist_ok=True)
    (config.SOURCE_DIR / state.patient.name / "cropped").mkdir(parents=True, exist_ok=True)
    (config.OUTPUT_DIR / state.patient.name).mkdir(parents=True, exist_ok=True)
    return SessionMetaResponse(
        session_id=state.session_id,
        patient_name=state.patient.name,
        mode=state.mode,
        created_at=state.created_at,
        session_dates=dict(state.session_dates),
    )


@router.post("/{session_id}/photos", response_model=list[PhotoOut])
def upload_photos(
    session_id: str,
    session_type: str = Form(...),
    session_date: str | None = Form(None),
    files: list[UploadFile] = File(...),
) -> list[PhotoOut]:
    if session_type not in ("start", "mid", "end"):
        raise AppError("INVALID_SESSION_TYPE", f"알 수 없는 세션타입: {session_type}", 400)

    created: list[PhotoOut] = []

    def mutator(s: SessionState) -> None:
        if session_date:
            s.session_dates[session_type] = session_date
        raw_dir = config.SOURCE_DIR / s.patient.name / "raw" / session_type
        raw_dir.mkdir(parents=True, exist_ok=True)
        for f in files:
            ext = Path(f.filename or "").suffix.lower()
            if ext not in config.ALLOWED_IMAGE_EXTENSIONS:
                raise AppError("INVALID_FILE", f"지원하지 않는 파일 형식입니다: {f.filename}", 400)
            photo_id = uuid.uuid4().hex[:10]
            raw_path = raw_dir / f"{photo_id}{ext}"
            with open(raw_path, "wb") as out:
                out.write(f.file.read())
            record = PhotoRecord(
                photo_id=photo_id,
                session_type=session_type,
                raw_path=str(raw_path),
                original_filename=f.filename or "",
            )
            s.photos[photo_id] = record
            created.append(photo_to_out(photo_id, record))

    session_store.update_session(session_id, mutator)
    return created
