import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.API_PORT || 8788}`,
        changeOrigin: false,
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: `${root}index.html`,
        confirmation: `${root}confirmation.html`,
      },
    },
  },
})
