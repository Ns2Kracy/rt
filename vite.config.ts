import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'
import solid from 'vite-plugin-solid'

export default defineConfig({
  root: 'web',
  base: './',
  publicDir: 'public',
  resolve: {
    alias: {
      'solid-js/store': 'solid-js',
      'solid-js/web': '@solidjs/web',
    },
  },
  plugins: [
    solid({
      dev: false,
      hot: false,
      solid: {
        moduleName: '@solidjs/web',
      },
    }),
    tailwindcss(),
  ],
  build: {
    outDir: 'static',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: assetInfo => {
          const name = assetInfo.names?.[0] ?? assetInfo.name ?? ''
          return name.endsWith('.css') ? 'assets/styles.css' : 'assets/[name][extname]'
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/v2/api/rt': 'http://127.0.0.1:49321',
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
