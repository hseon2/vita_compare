# -*- coding: utf-8 -*-
"""세션(검수 위저드 진행) 상태 저장소.

DB를 두지 않는다 (요구사항 8절): 인메모리 dict + 세션당 JSON 캐시 파일 1개로 충분하다.
"새로고침 시에도 진행 중이던 세션 유지"를 서버 시작시 load_all_from_disk()로 만족시킨다.

models/schema.py의 PhotoAsset은 "PPT 생성 직전 확정된" 표현이라 compos_id가 이미 정해져
있어야 한다. 검수 위저드 진행 중에는 아직 구도가 배정되지 않은 사진(compos_id=0)도 다뤄야
하므로, 여기서는 PhotoRecord라는 더 풍부한 작업용 구조를 별도로 둔다. PPTJob(정식 스키마)은
PPT 생성 직전에 services/generate_service.py가 이 상태로부터 조립한다.
"""
import json
import threading
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Callable, Literal

import config
from models.schema import BodyCompRow, Patient

SessionType = Literal["start", "mid", "end"]


class SessionNotFoundError(Exception):
    def __init__(self, session_id: str):
        self.session_id = session_id
        super().__init__(f"세션을 찾을 수 없습니다: {session_id}")


@dataclass
class PhotoRecord:
    photo_id: str
    session_type: SessionType
    compos_id: int = 0                                    # 0 = 미분류
    raw_path: str = ""
    rotation_deg: float = 0.0
    crop_box: tuple[int, int, int, int] = (0, 0, 0, 0)     # (0,0,0,0) = 아직 AI 크롭 전
    cropped_path: str = ""                                # "" = 아직 익스포트 전 (비파괴 원칙)
    classification_confidence: float = 0.0
    manually_confirmed: bool = False
    pose_error: bool = False                               # PoseNotDetectedError 발생 여부


@dataclass
class GenerateStatus:
    state: Literal["idle", "running", "done", "error"] = "idle"
    progress: float = 0.0
    message: str = ""
    result_path: str | None = None


@dataclass
class SessionState:
    session_id: str
    created_at: str  # isoformat
    patient: Patient
    mode: str  # "standard" | "long"
    photos: dict[str, PhotoRecord] = field(default_factory=dict)  # photo_id -> record
    # session_type -> 촬영일(ISO "YYYY-MM-DD"). models.schema.ShootSession.session_date는
    # 세션(시작/중간/마지막) 단위 값이라 사진이 아닌 SessionState에 둔다. 사진 업로드시
    # 함께 전달되며, 요구사항의 "첫 슬라이드에만 날짜 캡션 표시"에 사용된다.
    session_dates: dict[str, str] = field(default_factory=dict)
    body_comp_rows: list[BodyCompRow] = field(default_factory=list)
    generate_status: GenerateStatus = field(default_factory=GenerateStatus)


_SESSIONS: dict[str, SessionState] = {}
_LOCK = threading.Lock()


def _cache_path(session_id: str):
    return config.SESSION_CACHE_DIR / f"{session_id}.json"


def _serialize(state: SessionState) -> dict:
    return {
        "session_id": state.session_id,
        "created_at": state.created_at,
        "patient": asdict(state.patient),
        "mode": state.mode,
        "photos": {pid: asdict(p) for pid, p in state.photos.items()},
        "session_dates": dict(state.session_dates),
        "body_comp_rows": [asdict(r) for r in state.body_comp_rows],
        "generate_status": asdict(state.generate_status),
    }


def _deserialize(data: dict) -> SessionState:
    photos = {
        pid: PhotoRecord(**{**p, "crop_box": tuple(p.get("crop_box") or (0, 0, 0, 0))})
        for pid, p in data.get("photos", {}).items()
    }
    body_comp_rows = [BodyCompRow(**r) for r in data.get("body_comp_rows", [])]
    generate_status = GenerateStatus(**data["generate_status"]) if data.get("generate_status") else GenerateStatus()
    return SessionState(
        session_id=data["session_id"],
        created_at=data["created_at"],
        patient=Patient(**data["patient"]),
        mode=data["mode"],
        photos=photos,
        session_dates=dict(data.get("session_dates", {})),
        body_comp_rows=body_comp_rows,
        generate_status=generate_status,
    )


def _persist(state: SessionState) -> None:
    with open(_cache_path(state.session_id), "w", encoding="utf-8") as f:
        json.dump(_serialize(state), f, ensure_ascii=False, indent=2)


def load_all_from_disk() -> None:
    """서버 시작시 호출: .session_cache/*.json을 모두 읽어 메모리에 복원."""
    config.SESSION_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    for path in config.SESSION_CACHE_DIR.glob("*.json"):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            state = _deserialize(data)
        except Exception:
            continue  # 손상된 캐시 파일은 무시
        _SESSIONS[state.session_id] = state


def create_session(patient_name: str, patient_id: str, mode: str) -> SessionState:
    session_id = uuid.uuid4().hex[:12]
    body_comp_rows = [
        BodyCompRow(label=label, start="", mid=None, end="", target="", highlight=False)
        for label in config.DEFAULT_BODY_COMP_LABELS
    ]
    state = SessionState(
        session_id=session_id,
        created_at=datetime.now().isoformat(),
        patient=Patient(name=patient_name, patient_id=patient_id),
        mode=mode,
        body_comp_rows=body_comp_rows,
    )
    with _LOCK:
        _SESSIONS[session_id] = state
        _persist(state)
    return state


def get_session(session_id: str) -> SessionState:
    with _LOCK:
        state = _SESSIONS.get(session_id)
    if state is None:
        raise SessionNotFoundError(session_id)
    return state


def update_session(session_id: str, mutator: Callable[[SessionState], None]) -> SessionState:
    """mutator(state)를 락 안에서 실행한 뒤 즉시 디스크에 반영하고 최신 상태를 반환한다."""
    with _LOCK:
        state = _SESSIONS.get(session_id)
        if state is None:
            raise SessionNotFoundError(session_id)
        mutator(state)
        _persist(state)
        return state


def delete_session(session_id: str) -> None:
    with _LOCK:
        _SESSIONS.pop(session_id, None)
        path = _cache_path(session_id)
        if path.exists():
            path.unlink()
