/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Rules tests need the Firestore emulator, so they run separately (npm run test:rules).
  test: { include: ['src/**/*.test.ts'] },
})
