import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/nse-csv': {
        target: 'https://archives.nseindia.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/nse-csv/, '')
      },
      '/amfi-nav': {
        target: 'https://portal.amfiindia.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/amfi-nav/, '')
      },
      '/yahoo-api': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/yahoo-api/, '')
      },
      '/yahoo-search': {
        target: 'https://query2.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/yahoo-search/, '')
      }
    }
  }
})