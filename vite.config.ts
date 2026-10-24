/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// Modes allowed to use a real Firebase project. Empty on the multi-barber branch until the
// per-shop builds (docs/ARCHITECTURE.md, Phase 7), so .env.local's live config can't be used here.
const REAL_PROJECT_MODES: string[] = []

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Unit tests (mode "test") never touch Firebase.
  if (mode !== 'test' && !REAL_PROJECT_MODES.includes(mode)) {
    const projectId = loadEnv(mode, process.cwd(), 'VITE_').VITE_FIREBASE_PROJECT_ID ?? ''
    if (!projectId.startsWith('demo-')) {
      throw new Error(
        `Mode "${mode}" uses Firebase project "${projectId}". On this branch only demo- projects ` +
          '(the emulator) are allowed: use `npm run dev` / `npm run build`, which use --mode emulator.',
      )
    }
  }
  return {
    plugins: [react(), tailwindcss()],
    // Rules tests need the Firestore emulator, so they run separately (npm run test:emu).
    test: { include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'] },
  }
})
