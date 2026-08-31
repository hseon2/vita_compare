# -*- coding: utf-8 -*-
"""PPT 생성 서비스: 세션 상태 -> PPTJob 조립 -> 실제 크롭 파일 export -> PPT 렌더링.

FastAPI BackgroundTasks에서 호출되는 단일 진입점(run_generate_job)을 제공한다. 로컬 단일
사용자 도구이므로 Celery/Redis 없이 인메모리 GenerateStatus 갱신만으로 폴링을 지원한다.

실제 픽셀 크롭(cropper.export_cropped_image)은 여기서만, 딱 한 번 호출된다 — 요구사항
5.4의 "픽셀을 실제로 잘라내 별도 파일로 저장하는 건 최종 확정 시점에만 수행" 원칙의
유일한 실행 지점.
"""
import logging
import traceback
from datetime import date, datetime

import config
from models.schema import PhotoAsset, PPTJob, ShootSession
from ppt_generator.generate_ppt import build_presentation_from_job
from preprocessing.cropper import export_cropped_image
from state import session_store
from state.session_store import PhotoRecord, SessionState

logger = logging.getLogger("generate")


def _set_pairing(mode: str) -> list[tuple[str, str]]:
    return config.LONG_MODE_SET_PAIRING if mode == "long" else config.STANDARD_MODE_SET_PAIRING


def _session_types_for(mode: str) -> list[str]:
    return ["start", "mid", "end"] if mode == "long" else ["start", "end"]


def _parse_iso_date(text: str) -> date:
    try:
        return date.fromisoformat(text)
    except (TypeError, ValueError):
        return date.today()


def _format_caption_date(d: date) -> str:
    return d.strftime("%Y.%m.%d")


def _resolve_output_path(patient_name: str) -> str:
    """동일 환자 재생성 시 기존 파일을 덮어쓰지 않도록 파일명에 순번을 붙인다."""
    out_dir = config.OUTPUT_DIR / patient_name
    out_dir.mkdir(parents=True, exist_ok=True)
    today = datetime.now().strftime("%Y%m%d")
    base_name = f"{patient_name}님_프레젠테이션_{today}"
    candidate = out_dir / f"{base_name}.pptx"
    n = 2
    while candidate.exists():
        candidate = out_dir / f"{base_name}_{n}.pptx"
        n += 1
    return str(candidate)


def _group_by_session_type(state: SessionState) -> dict[str, dict[int, PhotoRecord]]:
    grouped: dict[str, dict[int, PhotoRecord]] = {"start": {}, "mid": {}, "end": {}}
    for record in state.photos.values():
        if record.compos_id <= 0:
            continue
        grouped.setdefault(record.session_type, {})[record.compos_id] = record
    return grouped


def _export_all_crops(grouped: dict[str, dict[int, PhotoRecord]], patient_name: str,
                       on_progress) -> None:
    all_records = [r for by_compos in grouped.values() for r in by_compos.values()]
    total = len(all_records) or 1
    for i, record in enumerate(all_records):
        cropped_path = str(
            config.SOURCE_DIR / patient_name / "cropped" / record.session_type
            / f"{record.compos_id:02d}.jpg"
        )
        export_cropped_image(record.raw_path, record.rotation_deg, tuple(record.crop_box), cropped_path,
                              compos_id=record.compos_id)
        record.cropped_path = cropped_path
        on_progress(0.1 + 0.6 * (i + 1) / total)


def _build_photo_sets(state: SessionState, grouped: dict[str, dict[int, PhotoRecord]]) -> dict[int, list[dict]]:
    photo_sets: dict[int, list[dict]] = {}
    for before_type, after_type in _set_pairing(state.mode):
        before_map, after_map = grouped.get(before_type, {}), grouped.get(after_type, {})
        before_date = _format_caption_date(_parse_iso_date(state.session_dates.get(before_type, "")))
        after_date = _format_caption_date(_parse_iso_date(state.session_dates.get(after_type, "")))
        for compos_id in sorted(set(before_map) & set(after_map)):
            before_rec, after_rec = before_map[compos_id], after_map[compos_id]
            photo_sets.setdefault(compos_id, []).append({
                "before": before_rec.cropped_path,
                "after": after_rec.cropped_path,
                "before_date": before_date,
                "after_date": after_date,
            })
    return photo_sets


def _build_shoot_sessions(state: SessionState, grouped: dict[str, dict[int, PhotoRecord]]) -> list[ShootSession]:
    sessions = []
    for session_type in _session_types_for(state.mode):
        session_date = _parse_iso_date(state.session_dates.get(session_type, ""))
        photos = {
            compos_id: PhotoAsset(
                compos_id=rec.compos_id,
                raw_path=rec.raw_path,
                rotation_deg=rec.rotation_deg,
                crop_box=tuple(rec.crop_box),
                cropped_path=rec.cropped_path,
                classification_confidence=rec.classification_confidence,
                manually_confirmed=rec.manually_confirmed,
            )
            for compos_id, rec in grouped.get(session_type, {}).items()
        }
        sessions.append(ShootSession(session_date=session_date, session_type=session_type, photos=photos))
    return sessions


def _update_status(session_id: str, **kwargs) -> None:
    def mutator(s: SessionState) -> None:
        for k, v in kwargs.items():
            setattr(s.generate_status, k, v)

    session_store.update_session(session_id, mutator)


def run_generate_job(session_id: str) -> None:
    """BackgroundTasks 타깃. 예외는 여기서 모두 잡아 GenerateStatus.state="error"로 노출한다."""
    try:
        _update_status(session_id, state="running", progress=0.05, message="사진 정리 중")
        state = session_store.get_session(session_id)
        grouped = _group_by_session_type(state)

        def _progress_cb(p: float) -> None:
            _update_status(session_id, progress=p)

        _update_status(session_id, progress=0.1, message="사진 크롭 처리 중")
        _export_all_crops(grouped, state.patient.name, _progress_cb)
        # record.cropped_path 변경사항을 디스크 캐시에 반영
        session_store.update_session(session_id, lambda s: None)

        photo_sets = _build_photo_sets(state, grouped)
        sessions = _build_shoot_sessions(state, grouped)
        output_path = _resolve_output_path(state.patient.name)

        job = PPTJob(
            patient=state.patient,
            mode=state.mode,
            sessions=sessions,
            body_comp_rows=state.body_comp_rows,
            output_path=output_path,
        )

        _update_status(session_id, progress=0.85, message="PPT 렌더링 중")
        build_presentation_from_job(job, photo_sets)

        _update_status(session_id, state="done", progress=1.0, message="완료", result_path=output_path)
        logger.info("PPT 생성 완료: session=%s output=%s", session_id, output_path)
    except Exception as exc:  # noqa: BLE001 - 백그라운드 작업 최상위이므로 광범위하게 잡아 상태로 노출
        logger.error("PPT 생성 실패: session=%s\n%s", session_id, traceback.format_exc())
        _update_status(session_id, state="error", message=str(exc))
