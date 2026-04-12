import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/frontend/', // GitHub Pages: /frontend/
  plugins: [react()],
})
