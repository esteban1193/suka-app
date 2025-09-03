import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// IMPORTANT:
// - If deploying to https://USER.github.io/REPO_NAME/  -> set base: '/REPO_NAME/'
// - If deploying to https://USER.github.io            -> set base: '/'
export default defineConfig({
  plugins: [react()],
  base: '/REPO_NAME/',
})
