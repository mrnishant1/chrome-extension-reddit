import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist/src",
    emptyOutDir: true,
     minify: false,
    rollupOptions: {
      input: {
        background: "src/background.js",
        popup: "src/popup.js",
        ui: "src/index.html",
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name][extname]",
      },
    },
  },
  base: "./",
  publicDir: false,
});
