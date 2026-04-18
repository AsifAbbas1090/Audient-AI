import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      // Proxy all /api/* requests to the Flask backend so cookies are same-origin
      '/api': {
        target:       'http://localhost:5000',
        changeOrigin: true,
      },
      // Proxy Socket.IO upgrade requests (ws: true enables WebSocket proxying)
      '/socket.io': {
        target:          'http://localhost:5000',
        changeOrigin:    true,
        ws:              true,
        rewriteWsOrigin: true,
      },
    },
  },
})

