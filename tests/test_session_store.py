# -*- coding: utf-8 -*-
"""세션 상태 저장소 검증: 생성/수정/JSON 직렬화-복원 라운드트립."""
import pytest

from state import session_store
from state.session_store import PhotoRecord


def test_create_and_get_session():
    state = session_store.create_session("홍길동", "pid1", "standard")
    fetched = session_store.get_session(state.session_id)
    assert fetched.patient.name == "홍길동"
    assert fetched.mode == "standard"
    assert len(fetched.body_comp_rows) == 12  # config.DEFAULT_BODY_COMP_LABELS 개수


def test_get_missing_session_raises():
    with pytest.raises(session_store.SessionNotFoundError):
        session_store.get_session("does-not-exist")


def test_update_session_persists_and_reloads():
    state = session_store.create_session("김철수", "pid2", "long")

    def mutator(s):
        s.photos["p1"] = PhotoRecord(photo_id="p1", session_type="start", compos_id=1,
                                      raw_path="/tmp/x.jpg", crop_box=(0, 0, 100, 100))
        s.session_dates["start"] = "2026-01-05"

    session_store.update_session(state.session_id, mutator)

    # 메모리 dict를 비우고 디스크 캐시에서 재로드해도 값이 살아있어야 한다
    # ("새로고침 시에도 진행 중이던 세션 유지", 요구사항 5.5.1)
    session_store._SESSIONS.clear()
    session_store.load_all_from_disk()

    reloaded = session_store.get_session(state.session_id)
    assert reloaded.photos["p1"].compos_id == 1
    assert reloaded.photos["p1"].crop_box == (0, 0, 100, 100)
    assert reloaded.session_dates["start"] == "2026-01-05"


def test_delete_session_removes_memory_and_cache():
    state = session_store.create_session("이영희", "pid3", "standard")
    session_id = state.session_id
    cache_path = session_store._cache_path(session_id)
    assert cache_path.exists()

    session_store.delete_session(session_id)
    assert not cache_path.exists()
    with pytest.raises(session_store.SessionNotFoundError):
        session_store.get_session(session_id)
