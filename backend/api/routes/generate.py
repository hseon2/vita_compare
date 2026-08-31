# -*- coding: utf-8 -*-
"""생성 엔드포인트: POST generate, GET generate/status, GET download (요구사항 5.5.1/5.5.2)."""
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks
from fastapi.responses import FileResponse

from api.errors import AppError
from api.schemas import GenerateStatusOut
from services.generate_service import run_generate_job
from state import session_store
from state.session_store import SessionState

router = APIRouter(prefix="/api/sessions", tags=["generate"])


@router.post("/{session_id}/generate", status_code=202)
def start_generate(session_id: str, background_tasks: BackgroundTasks) -> dict:
    state = session_store.get_session(session_id)
    if not state.body_comp_rows:
        raise AppError("INVALID_JOB", "체성분 항목이 없습니다.", 400)
    if not any(r.compos_id > 0 for r in state.photos.values()):
        raise AppError("INVALID_JOB", "구도가 배정된 사진이 없습니다.", 400)

    def mutator(s: SessionState) -> None:
        s.generate_status.state = "running"
        s.generate_status.progress = 0.0
        s.generate_status.message = "대기 중"
        s.generate_status.result_path = None

    session_store.update_session(session_id, mutator)
    background_tasks.add_task(run_generate_job, session_id)
    return {"ok": True}


@router.get("/{session_id}/generate/status", response_model=GenerateStatusOut)
def get_generate_status(session_id: str) -> GenerateStatusOut:
    gs = session_store.get_session(session_id).generate_status
    return GenerateStatusOut(state=gs.state, progress=gs.progress, message=gs.message, result_path=gs.result_path)


@router.get("/{session_id}/download")
def download_result(session_id: str) -> FileResponse:
    gs = session_store.get_session(session_id).generate_status
    if gs.state != "done" or not gs.result_path or not Path(gs.result_path).exists():
        raise AppError("NOT_GENERATED", "아직 생성된 PPT가 없습니다.", 404)

    response = FileResponse(
        gs.result_path,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename=Path(gs.result_path).name,
    )
    session_store.delete_session(session_id)  # 생성 완료 후 위저드 세션 상태는 폐기해도 무방 (요구사항 5.5.1)
    return response
