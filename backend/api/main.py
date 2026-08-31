# -*- coding: utf-8 -*-
"""FastAPI 앱 진입점: 라우터 등록, /static 마운트, 시작시 세션 캐시 로드.

로컬호스트 전용으로만 서비스한다 (요구사항 1절 "완전 로컬 처리"). 실행:
    cd backend && uvicorn api.main:app --reload
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

import config
from api.errors import register_error_handlers
from api.routes import classify, crop, generate, upload
from state import session_store


@asynccontextmanager
async def lifespan(app: FastAPI):
    config.configure_logging()
    session_store.load_all_from_disk()
    yield


app = FastAPI(title="Vita Compare API", lifespan=lifespan)

register_error_handlers(app)

app.include_router(upload.router)
app.include_router(classify.router)
app.include_router(crop.router)
app.include_router(generate.router)

app.mount(config.STATIC_URL_PREFIX, StaticFiles(directory=str(config.SOURCE_DIR)), name="static")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
