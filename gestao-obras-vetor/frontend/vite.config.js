import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3001'

export default defineConfig({
  plugins: [react()],
  build: {
    // Evita a etapa "computing gzip size" para acelerar build em servidor menor.
    reportCompressedSize: false
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true
      },
      '/uploads': {
        target: apiProxyTarget,
        changeOrigin: true
      }
    },
    historyApiFallback: true
  }
})
