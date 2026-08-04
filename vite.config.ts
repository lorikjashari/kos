import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    // Match GitHub Actions Node (no browser globals) unless a file opts into jsdom
    environment: 'node',
  },
})
