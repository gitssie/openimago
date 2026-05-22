import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { quasar, transformAssetUrls } from '@quasar/vite-plugin'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    vue({ template: { transformAssetUrls } }),
    quasar({ sassVariables: 'src/css/quasar.variables.scss' }),
  ],
  resolve: {
    alias: {
      src: resolve(__dirname, './src'),
      layouts: resolve(__dirname, './src/layouts'),
      pages: resolve(__dirname, './src/pages'),
      components: resolve(__dirname, './src/components'),
      stores: resolve(__dirname, './src/stores'),
      boot: resolve(__dirname, './src/boot'),
    },
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/__tests__/setup.ts'],
    css: true,
  },
  server: {
    fs: {
      allow: [resolve(__dirname, '..'), resolve(__dirname, '../..')],
    },
  },
})
