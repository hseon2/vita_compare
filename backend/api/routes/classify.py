# -*- coding: utf-8 -*-
"""분류 엔드포인트: POST /api/sessions/{id}/classify (요구사항 5.2, 5.5.2).

포즈 미검출/저신뢰 사진이 있어도 배치 전체를 실패시키지 않고 개별 warnings로 보고한다.
분류 직후 leveler/cropper로 회전각과 AI 1차 크롭박스까지 함께 제안해, 검수 UI(화면3)가
바로 "AI가 1차 자동크롭한 결과"를 보여줄 수 있도록 한다.
"""
from fastapi import APIRouter
from PIL import Image

import config
from api.errors import AppError
from api.routes.upload import photo_to_out
from api.schemas import ClassifyResponse, ClassifyWarning
from preprocessing import classifier, leveler
from preprocessing.cropper import propose_crop_box
from preprocessing.pose_detector import PoseNotDetectedError, detect_landmarks
from state import session_store
from state.session_store import SessionState

router = APIRouter(prefix="/api/sessions", tags=["classify"])


@router.post("/{session_id}/classify", response_model=ClassifyResponse)
def classify_session_photos(session_id: str) -> ClassifyResponse:
    existing = session_store.get_session(session_id)
    if not existing.photos:
        raise AppError("NO_PHOTOS", "업로드된 사진이 없습니다.", 400)

    warnings: list[ClassifyWarning] = []

    def mutator(s: SessionState) -> None:
        for photo_id, record in s.photos.items():
            try:
                landmarks = detect_landmarks(record.raw_path)
            except PoseNotDetectedError:
                record.pose_error = True
                record.compos_id = 0
                record.classification_confidence = 0.0
                warnings.append(ClassifyWarning(
                    photo_id=photo_id, error_code="POSE_NOT_DETECTED",
                    message=f"인물을 검출하지 못했습니다: {record.raw_path}",
                ))
                continue

            record.pose_error = False
            compos_id, confidence = classifier.classify(landmarks)
            record.compos_id = compos_id
            record.classification_confidence = confidence
            record.manually_confirmed = False

            with Image.open(record.raw_path) as im:
                orig_w, orig_h = im.size
            record.rotation_deg = leveler.compute_rotation_angle(landmarks, orig_w, orig_h)
            record.crop_box = propose_crop_box(record.raw_path, landmarks, record.rotation_deg, compos_id)

            if confidence < config.CONFIDENCE_THRESHOLD:
                warnings.append(ClassifyWarning(
                    photo_id=photo_id, error_code="LOW_CONFIDENCE",
                    message=f"분류 신뢰도가 낮습니다 ({confidence:.2f}) - 확인이 필요합니다.",
                ))

    state = session_store.update_session(session_id, mutator)
    photos_out = [photo_to_out(pid, rec) for pid, rec in state.photos.items()]
    return ClassifyResponse(photos=photos_out, warnings=warnings)
