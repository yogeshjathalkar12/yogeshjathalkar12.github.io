import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The React app is deployed to /ventures/raptor/app/ specifically —
// NOT /ventures/raptor/ — because that root path is still your existing
// static marketing site (index.html, styles.css, script.js). Deploying
// the SPA there would overwrite it. This base must match wherever the
// build output actually lands in the repo.
export default defineConfig({
  plugins: [react()],
  base: '/ventures/raptor/app/',
})
