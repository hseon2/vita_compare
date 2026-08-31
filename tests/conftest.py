# -*- coding: utf-8 -*-
import pytest
from PIL import Image


@pytest.fixture
def make_dummy_photo(tmp_path):
    """지정한 파일명/크기/색상으로 더미 이미지를 만들어 절대경로(str)를 반환."""
    def _make(name: str, size=(600, 800), color=(200, 200, 200)) -> str:
        path = tmp_path / name
        Image.new("RGB", size, color).save(path)
        return str(path)
    return _make


@pytest.fixture(autouse=True)
def isolate_config_dirs(tmp_path, monkeypatch):
    """config의 경로 상수를 tmp_path 하위로 돌려 테스트가 실제 저장소를 건드리지 않게 한다."""
    import config

    monkeypatch.setattr(config, "SOURCE_DIR", tmp_path / "source")
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path / "output")
    monkeypatch.setattr(config, "SESSION_CACHE_DIR", tmp_path / "session_cache")
    monkeypatch.setattr(config, "LOG_DIR", tmp_path / "logs")
    for d in (config.SOURCE_DIR, config.OUTPUT_DIR, config.SESSION_CACHE_DIR, config.LOG_DIR):
        d.mkdir(parents=True, exist_ok=True)
    yield
