import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',   // относительные пути — обязательно для file:// в Electron
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
