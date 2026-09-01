import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 완전 클라이언트 사이드 앱(백엔드 없음) - 포즈검출/크롭/PPT생성이 전부 브라우저 안에서
// 돌아가므로 프록시가 필요 없다. Vercel처럼 루트 도메인에 배포하면 base는 기본값("/")으로
// 충분하다. GitHub Pages처럼 서브패스(username.github.io/repo/)에 올릴 땐 base를
// '/repo-name/'으로 바꿔야 한다.
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
