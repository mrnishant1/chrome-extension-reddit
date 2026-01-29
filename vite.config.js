import { defineConfig } from "vite";

export default defineConfig({
  root: "src",              
  build: {
    outDir: "../dist",      
    emptyOutDir: true,
    minify: false,
    rollupOptions: {

      input: {
        background: "src/background.js",
        popup: "src/popup.js",
        ui: "src/index.html",
        icon: "src/icon.png"
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name][extname]"
      }
    }
  },
  base: "./",
});
