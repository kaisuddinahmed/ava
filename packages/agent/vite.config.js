import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        checkout: "checkout.html",
      },
    },
  },
  server: {
    port: 3001,
  },
});
