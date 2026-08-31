# 실행 방법

백엔드와 프론트엔드를 각각 별도 프로세스로 띄운다 (로컬 전용, CORS 없음 - Vite가 `/api`,
`/static`을 `localhost:8000`으로 프록시한다).

```bash
# 터미널 1 - 백엔드
cd backend
source venv/bin/activate
uvicorn api.main:app --reload

# 터미널 2 - 프론트엔드
cd frontend
npm run dev
```

`http://localhost:5173` 접속.
