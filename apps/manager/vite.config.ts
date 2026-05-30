import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Frontend del manager. Se construye a dist/web; el server lo sirve en prod.
export default defineConfig({
  root: 'src/web',
  plugins: [react()],
  build: { outDir: '../../dist/web', emptyOutDir: true },
})
