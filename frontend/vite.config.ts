import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

const DEFAULT_APP_ORIGIN = 'https://app.harmonymarket.click'

function tonConnectManifest(mode: string): Plugin {
  return {
    name: 'harmony-tonconnect-manifest',
    apply: 'build',
    writeBundle(options) {
      const env = loadEnv(mode, process.cwd(), 'VITE_')
      const manifestUrl = env.VITE_TON_MANIFEST_URL
      const origin = manifestUrl ? new URL(manifestUrl).origin : DEFAULT_APP_ORIGIN
      const outDir = options.dir ?? 'dist'
      writeFileSync(
        join(outDir, 'tonconnect-manifest.json'),
        `${JSON.stringify({
          url: origin,
          name: 'HARMONY.WORLD',
          iconUrl: `${origin}/icon-180.png`,
        }, null, 2)}\n`,
      )
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), nodePolyfills({ include: ['buffer'] }), tonConnectManifest(mode)],
  test: {
    setupFiles: ['./src/test/setupI18n.ts'],
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined

          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router-dom/')) {
            return 'vendor-react'
          }

          if (id.includes('/@tanstack/react-query/')) {
            return 'vendor-query'
          }

          if (
            id.includes('/@tonconnect/ui-react/') ||
            id.includes('/@tonconnect/ui/') ||
            id.includes('/@tonconnect/sdk/')
          ) {
            return 'vendor-tonconnect'
          }

          if (id.includes('/@ton/core/') || id.includes('/@ton/crypto/') || id.includes('/buffer/')) {
            return 'vendor-ton'
          }

          if (id.includes('/@tma.js/sdk/')) {
            return 'vendor-tma'
          }

          if (id.includes('/@sumsub/websdk-react/')) {
            return 'vendor-sumsub'
          }

          return 'vendor-misc'
        },
      },
    },
  },
}))
