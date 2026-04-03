import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
        target: 'http://127.0.0.1:3001',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true
      }
    },
    historyApiFallback: true
  }
})
