import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    // @sinema/client is TypeScript source with its own React dev copy; use one React for all.
    dedupe: ["react", "react-dom", "@tanstack/react-query"],
  },
});
