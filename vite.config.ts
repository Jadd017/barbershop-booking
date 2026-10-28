/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { listShops, readShop, shopProblems } from './scripts/shops.mjs'

/** HTML-escapes a value for an attribute or the title. */
const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * A shop's build: its name as the page title (until the live settings load), and the link
 * preview WhatsApp, Instagram and Facebook show (they don't run JavaScript, so it has to be in
 * index.html): og:title, og:description and og:image, the shop's logo copied to /og-image.png.
 */
function shopPreview(env: Record<string, string>, logoPath: string): Plugin {
  const name = escape(env.VITE_SHOP_NAME)
  const description = escape(`Book your appointment at ${env.VITE_SHOP_NAME} online.`)
  const image = `${env.VITE_SITE_URL}/og-image.png`
  return {
    name: 'shop-preview',
    transformIndexHtml(html) {
      const tags = [
        `<meta name="description" content="${description}" />`,
        `<meta property="og:type" content="website" />`,
        `<meta property="og:title" content="${name}" />`,
        `<meta property="og:description" content="${description}" />`,
        `<meta property="og:url" content="${escape(env.VITE_SITE_URL)}" />`,
        `<meta property="og:image" content="${escape(image)}" />`,
        `<meta name="twitter:card" content="summary" />`,
      ]
      return html
        .replace(/<title>[^<]*<\/title>/, `<title>${name}</title>`)
        .replace(/(\n[ \t]*)<\/head>/, (_, indent: string) => `${tags.map((t) => `${indent}  ${t}`).join('')}${indent}</head>`)
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'og-image.png', source: readFileSync(logoPath) })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const plugins = [react(), tailwindcss()]

  // `--mode <shop>`: one shop's site against its own Firebase project, from shops/<shop>/ only, so
  // nothing from the root .env files (.env.local is Eddy's live config) can leak in.
  if (listShops().includes(mode)) {
    const shop = readShop(mode)
    const problems = shopProblems(mode, shop)
    if (problems.length) throw new Error(`Shop "${mode}" isn't ready:\n- ${problems.join('\n- ')}`)
    const env = loadEnv(mode, shop.dir, 'VITE_')
    return { plugins: [...plugins, shopPreview(env, shop.logoPath)], envDir: shop.dir }
  }

  // Anything else may only use the emulator (demo- projects): `npm run dev` / `npm run build` use
  // --mode emulator. Unit tests (mode "test") never touch Firebase.
  if (mode !== 'test') {
    const projectId = loadEnv(mode, process.cwd(), 'VITE_').VITE_FIREBASE_PROJECT_ID ?? ''
    if (!projectId.startsWith('demo-')) {
      throw new Error(
        `Mode "${mode}" uses Firebase project "${projectId}". A real project needs a ` +
          `shop (shops/<shop>/, \`--mode <shop>\`); otherwise use the emulator: \`npm run dev\` / \`npm run build\`.`,
      )
    }
  }
  return {
    plugins,
    // Rules tests need the Firestore emulator, so they run separately (npm run test:emu).
    test: { include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'] },
  }
})
