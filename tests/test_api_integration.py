# -*- coding: utf-8 -*-
"""API 통합 테스트: 업로드 -> 분류 -> 검수(PATCH) -> 체성분 -> 생성 -> 폴링 -> 다운로드 전체 흐름.

업로드하는 사진은 단색 더미 이미지라 실제 포즈가 검출되지 않는다 (POSE_NOT_DETECTED
warning 경로 검증). 구도 배정은 검수 UI를 흉내낸 PATCH 호출로 대신한다.
"""
import io
import time

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from api.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def _dummy_jpg_bytes(size=(600, 800), color=(128, 128, 128)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="JPEG")
    return buf.getvalue()


def test_full_pipeline_standard_mode(client):
    r = client.post("/api/sessions", json={"patient_name": "테스트환자", "mode": "standard"})
    assert r.status_code == 200
    session_id = r.json()["session_id"]

    files = [("files", ("p1.jpg", _dummy_jpg_bytes(), "image/jpeg"))]
    r = client.post(f"/api/sessions/{session_id}/photos",
                     data={"session_type": "start", "session_date": "2026-01-05"}, files=files)
    assert r.status_code == 200
    start_photo_id = r.json()[0]["photo_id"]

    files = [("files", ("p2.jpg", _dummy_jpg_bytes(), "image/jpeg"))]
    r = client.post(f"/api/sessions/{session_id}/photos",
                     data={"session_type": "end", "session_date": "2026-03-10"}, files=files)
    assert r.status_code == 200
    end_photo_id = r.json()[0]["photo_id"]

    r = client.post(f"/api/sessions/{session_id}/classify")
    assert r.status_code == 200
    body = r.json()
    assert any(w["error_code"] == "POSE_NOT_DETECTED" for w in body["warnings"])

    r = client.post(f"/api/sessions/{session_id}/generate")
    assert r.status_code == 400
    assert r.json()["error_code"] == "INVALID_JOB"

    for photo_id in (start_photo_id, end_photo_id):
        r = client.patch(f"/api/sessions/{session_id}/photos/{photo_id}",
                          json={"compos_id": 1, "crop_box": [0, 0, 600, 800]})
        assert r.status_code == 200
        assert r.json()["manually_confirmed"] is True

    r = client.post(f"/api/sessions/{session_id}/body-comp", json={
        "rows": [{"label": "체중", "start": "70kg", "mid": None, "end": "60kg",
                  "target": "55kg", "highlight": True}]
    })
    assert r.status_code == 200

    r = client.post(f"/api/sessions/{session_id}/generate")
    assert r.status_code == 202

    for _ in range(30):
        r = client.get(f"/api/sessions/{session_id}/generate/status")
        status = r.json()
        if status["state"] in ("done", "error"):
            break
        time.sleep(0.2)

    assert status["state"] == "done", status
    assert status["result_path"].endswith(".pptx")

    r = client.get(f"/api/sessions/{session_id}/download")
    assert r.status_code == 200
    assert r.content[:2] == b"PK"  # pptx는 zip 컨테이너

    # 생성 완료 후 세션은 폐기됨
    r = client.get(f"/api/sessions/{session_id}/photos")
    assert r.status_code == 404
    assert r.json()["error_code"] == "SESSION_NOT_FOUND"


def test_session_meta_and_body_comp_roundtrip(client):
    r = client.post("/api/sessions", json={"patient_name": "메타테스트", "mode": "long"})
    session_id = r.json()["session_id"]

    r = client.get(f"/api/sessions/{session_id}")
    assert r.status_code == 200
    meta = r.json()
    assert meta["patient_name"] == "메타테스트"
    assert meta["mode"] == "long"

    # 저장 전에는 기본 12개 항목이 빈 값으로 조회되어야 함
    r = client.get(f"/api/sessions/{session_id}/body-comp")
    assert r.status_code == 200
    assert len(r.json()["rows"]) == 12

    rows = [{"label": "체중", "start": "70kg", "mid": "65kg", "end": "60kg",
             "target": "55kg", "highlight": True}]
    r = client.post(f"/api/sessions/{session_id}/body-comp", json={"rows": rows})
    assert r.status_code == 200

    r = client.get(f"/api/sessions/{session_id}/body-comp")
    assert r.status_code == 200
    saved = r.json()["rows"]
    assert saved == rows


def test_patch_session_meta_updates_patient_name_and_mode(client):
    r = client.post("/api/sessions", json={"patient_name": "오타환자", "mode": "standard"})
    session_id = r.json()["session_id"]

    r = client.patch(f"/api/sessions/{session_id}", json={"patient_name": "홍길동", "mode": "long"})
    assert r.status_code == 200
    meta = r.json()
    assert meta["patient_name"] == "홍길동"
    assert meta["mode"] == "long"

    r = client.get(f"/api/sessions/{session_id}")
    assert r.json()["patient_name"] == "홍길동"
    assert r.json()["mode"] == "long"


def test_reassign_compos_without_crop_box_recomputes_safely(client):
    """분류확인 화면의 드롭다운처럼 compos_id만 바꾸고 crop_box는 안 보내는 경로.
    포즈 미검출이어도 crop_box가 깨지지 않고(0,0,0,0 방치) 이후 생성 단계에서 안전해야 한다."""
    r = client.post("/api/sessions", json={"patient_name": "재지정테스트", "mode": "standard"})
    session_id = r.json()["session_id"]

    files = [("files", ("p1.jpg", _dummy_jpg_bytes(), "image/jpeg"))]
    r = client.post(f"/api/sessions/{session_id}/photos", data={"session_type": "start"}, files=files)
    photo_id = r.json()[0]["photo_id"]

    r = client.patch(f"/api/sessions/{session_id}/photos/{photo_id}", json={"compos_id": 3})
    assert r.status_code == 200
    body = r.json()
    assert body["compos_id"] == 3
    # 더미 이미지라 포즈 미검출이 정상 - crop_box는 (0,0,0,0)으로 남아도 되며,
    # export_cropped_image가 생성 시점에 안전하게 대체한다 (test_cropper.py에서 별도 검증).
    assert body["pose_error"] is True


def test_invalid_file_extension_rejected(client):
    r = client.post("/api/sessions", json={"patient_name": "확장자테스트", "mode": "standard"})
    session_id = r.json()["session_id"]

    files = [("files", ("p1.txt", b"not an image", "text/plain"))]
    r = client.post(f"/api/sessions/{session_id}/photos", data={"session_type": "start"}, files=files)
    assert r.status_code == 400
    assert r.json()["error_code"] == "INVALID_FILE"


def test_missing_session_returns_404(client):
    r = client.get("/api/sessions/does-not-exist/photos")
    assert r.status_code == 404
    assert r.json()["error_code"] == "SESSION_NOT_FOUND"
