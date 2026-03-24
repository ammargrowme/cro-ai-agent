import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-icons': ['lucide-react'],
          // Export libraries are lazy-loaded but grouped for caching
        }
      }
    },
    // Skip compressed size reporting for faster builds
    reportCompressedSize: false,
    // Target modern browsers for smaller output
    target: 'es2020',
  }
})
