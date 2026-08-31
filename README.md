# Vita Compare

한의원 다이어트 환자의 전(Before)-후(After) 비교 사진을 업로드하면, 구도 자동 분류 → 수평 조정 →
크롭 → PPT 자동 생성까지 처리하는 로컬 자동화 도구입니다.

- **완전 로컬 처리**: MediaPipe/OpenCV/Pillow 등 로컬 오픈소스 라이브러리만 사용, 클라우드 API 호출 없음
- 자세한 기능/화면/데이터 모델 명세는 [requirements.md](requirements.md) 참고

## 구조

```
backend/    FastAPI + MediaPipe 기반 전처리·분류·크롭·PPT생성 API
frontend/   React + TypeScript + Vite 기반 5단계 위저드 UI
```

## 실행 방법

두 프로세스를 각각 띄웁니다 (완전 로컬, 외부 노출 없음).

```bash
# 1) 백엔드
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python scripts/download_pose_model.py   # 최초 1회, 포즈검출 모델 다운로드
uvicorn api.main:app --reload

# 2) 프론트엔드 (새 터미널)
cd frontend
npm install
npm run dev
```

`http://localhost:5173` 접속. 프론트엔드는 Vite 프록시로 `/api`, `/static`을 `localhost:8000`
백엔드로 전달합니다.

## 테스트

```bash
cd backend && source venv/bin/activate
pytest ../tests/ -v
```
