# -*- coding: utf-8 -*-
"""에러 응답 포맷 통일: {"error_code": "...", "message": "..."} (요구사항 5.5.2)."""
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from preprocessing.pose_detector import PoseNotDetectedError
from state.session_store import SessionNotFoundError


class AppError(Exception):
    """라우트에서 명시적으로 던지는 일반 에러 (예: NO_PHOTOS, INVALID_JOB, PHOTO_NOT_FOUND)."""

    def __init__(self, error_code: str, message: str, status_code: int = 400):
        self.error_code = error_code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def _error_json(error_code: str, message: str, status_code: int) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"error_code": error_code, "message": message})


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _handle_app_error(request: Request, exc: AppError):
        return _error_json(exc.error_code, exc.message, exc.status_code)

    @app.exception_handler(SessionNotFoundError)
    async def _handle_session_not_found(request: Request, exc: SessionNotFoundError):
        return _error_json("SESSION_NOT_FOUND", str(exc), 404)

    @app.exception_handler(PoseNotDetectedError)
    async def _handle_pose_not_detected(request: Request, exc: PoseNotDetectedError):
        return _error_json("POSE_NOT_DETECTED", str(exc), 422)

    @app.exception_handler(Exception)
    async def _handle_unexpected(request: Request, exc: Exception):
        return _error_json("INTERNAL_ERROR", str(exc), 500)
