import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 백엔드(FastAPI, uvicorn)는 CORS 미들웨어 없이 localhost:8000에서만 서비스한다.
// 브라우저가 항상 Vite origin에만 요청하도록 /api, /static을 프록시한다.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/static': 'http://localhost:8000',
    },
  },
})
