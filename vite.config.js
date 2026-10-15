import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      output: {
        // three.js is only loaded on the first switch to 3D: keep its core and its addons
        // (lines, post-processing) in their own lazy chunks.
        manualChunks(id) {
          if (id.includes('node_modules/three/examples/')) return 'three-addons';
          if (id.includes('node_modules/three/')) return 'three';
          return undefined;
        }
      }
    }
  },
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node'
  }
});
