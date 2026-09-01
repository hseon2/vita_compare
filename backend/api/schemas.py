# -*- coding: utf-8 -*-
"""API 요청/응답 Pydantic 모델 (요구사항 5.5.2)."""
from pydantic import BaseModel, Field


class SessionCreateRequest(BaseModel):
    patient_name: str
    mode: str = Field(pattern="^(standard|long)$")


class SessionCreateResponse(BaseModel):
    session_id: str


class SessionPatchRequest(BaseModel):
    patient_name: str | None = None
    mode: str | None = Field(default=None, pattern="^(standard|long)$")


class SessionMetaResponse(BaseModel):
    session_id: str
    patient_name: str
    mode: str
    created_at: str
    session_dates: dict[str, str]


class PhotoOut(BaseModel):
    photo_id: str
    session_type: str
    original_filename: str
    compos_id: int
    compos_label: str
    classification_confidence: float
    low_confidence: bool
    manually_confirmed: bool
    option_confirmed: bool
    pose_error: bool
    rotation_deg: float
    crop_box: tuple[int, int, int, int]
    thumbnail_url: str
    duplicate: bool = False


class PhotosGroupedResponse(BaseModel):
    photos: list[PhotoOut]
    missing_compos: dict[str, list[int]]  # session_type -> 1~16 중 미배정 구도 목록


class ClassifyWarning(BaseModel):
    photo_id: str
    error_code: str
    message: str


class ClassifyResponse(BaseModel):
    photos: list[PhotoOut]
    warnings: list[ClassifyWarning]


class PhotoPatchRequest(BaseModel):
    compos_id: int | None = None
    session_type: str | None = Field(default=None, pattern="^(start|mid|end)$")
    rotation_deg: float | None = None
    crop_box: tuple[int, int, int, int] | None = None
    manually_confirmed: bool | None = None
    option_confirmed: bool | None = None
    sync_size: bool = True  # crop_box 크기 변경시 동일 구도의 다른 세션타입에도 동기화


class BodyCompRowIn(BaseModel):
    label: str
    start: str = ""
    mid: str | None = None
    end: str = ""
    target: str = ""
    highlight: bool = False


class BodyCompSaveRequest(BaseModel):
    rows: list[BodyCompRowIn]


class BodyCompGetResponse(BaseModel):
    rows: list[BodyCompRowIn]


class GenerateStatusOut(BaseModel):
    state: str
    progress: float
    message: str
    result_path: str | None = None


class ErrorResponse(BaseModel):
    error_code: str
    message: str
