import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],

    // Relative base so the built assets resolve correctly when deployed to a
    // GitHub Pages project subpath (e.g. robkiessling.github.io/solarion/).
    base: './',

    server: {
        open: true,

        // Disable hot module replacement / live reload
        hmr: false,
    },

    build: {
        // Keep emitting into dist/ so `npm run deploy-github` (gh-pages -d dist) still works.
        outDir: 'dist',
        emptyOutDir: true,
    },
});
