import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Config del EDITOR. El proyecto editable es independiente y tiene su propia
// config; aquí no se referencia.
export default defineConfig({
  plugins: [react()],
})
