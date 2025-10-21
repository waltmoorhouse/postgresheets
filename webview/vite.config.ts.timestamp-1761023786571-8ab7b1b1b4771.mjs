// vite.config.ts
import { defineConfig } from "file:///Users/walt/code/AI_projects/postgre-sheets/webview/node_modules/vite/dist/node/index.js";
import { svelte } from "file:///Users/walt/code/AI_projects/postgre-sheets/webview/node_modules/@sveltejs/vite-plugin-svelte/src/index.js";
import path from "node:path";
var __vite_injected_original_dirname = "/Users/walt/code/AI_projects/postgre-sheets/webview";
var vite_config_default = defineConfig({
  plugins: [svelte({
    compilerOptions: {
      hydratable: true
    }
  })],
  base: "./",
  build: {
    outDir: path.resolve(__vite_injected_original_dirname, "../media"),
    emptyOutDir: true,
    assetsDir: ".",
    sourcemap: false,
    cssCodeSplit: true,
    rollupOptions: {
      input: {
        "data-editor/main": path.resolve(__vite_injected_original_dirname, "./src/main.ts"),
        "schema-designer/main": path.resolve(__vite_injected_original_dirname, "./src/schema-designer/main.ts"),
        "create-table/main": path.resolve(__vite_injected_original_dirname, "./src/create-table/main.ts"),
        "drop-table/main": path.resolve(__vite_injected_original_dirname, "./src/drop-table/main.ts"),
        "add-connection/main": path.resolve(__vite_injected_original_dirname, "./src/add-connection/main.ts")
      },
      output: {
        entryFileNames: "[name].js",
        assetFileNames: "[name][extname]",
        chunkFileNames: "chunks/[name].js"
      }
    }
  },
  resolve: {
    alias: {
      $lib: path.resolve(__vite_injected_original_dirname, "./src/lib")
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvd2FsdC9jb2RlL0FJX3Byb2plY3RzL3Bvc3RncmUtc2hlZXRzL3dlYnZpZXdcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9Vc2Vycy93YWx0L2NvZGUvQUlfcHJvamVjdHMvcG9zdGdyZS1zaGVldHMvd2Vidmlldy92aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vVXNlcnMvd2FsdC9jb2RlL0FJX3Byb2plY3RzL3Bvc3RncmUtc2hlZXRzL3dlYnZpZXcvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCB7IHN2ZWx0ZSB9IGZyb20gJ0BzdmVsdGVqcy92aXRlLXBsdWdpbi1zdmVsdGUnO1xuaW1wb3J0IHBhdGggZnJvbSAnbm9kZTpwYXRoJztcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW3N2ZWx0ZSh7XG4gICAgY29tcGlsZXJPcHRpb25zOiB7XG4gICAgICBoeWRyYXRhYmxlOiB0cnVlXG4gICAgfVxuICB9KV0sXG4gIGJhc2U6ICcuLycsXG4gIGJ1aWxkOiB7XG4gICAgb3V0RGlyOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi4vbWVkaWEnKSxcbiAgICBlbXB0eU91dERpcjogdHJ1ZSxcbiAgICBhc3NldHNEaXI6ICcuJyxcbiAgICBzb3VyY2VtYXA6IGZhbHNlLFxuICAgIGNzc0NvZGVTcGxpdDogdHJ1ZSxcbiAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICBpbnB1dDoge1xuICAgICAgICAnZGF0YS1lZGl0b3IvbWFpbic6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuL3NyYy9tYWluLnRzJyksXG4gICAgICAgICdzY2hlbWEtZGVzaWduZXIvbWFpbic6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuL3NyYy9zY2hlbWEtZGVzaWduZXIvbWFpbi50cycpLFxuICAgICAgICAnY3JlYXRlLXRhYmxlL21haW4nOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi9zcmMvY3JlYXRlLXRhYmxlL21haW4udHMnKSxcbiAgICAgICAgJ2Ryb3AtdGFibGUvbWFpbic6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuL3NyYy9kcm9wLXRhYmxlL21haW4udHMnKSxcbiAgICAgICAgJ2FkZC1jb25uZWN0aW9uL21haW4nOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi9zcmMvYWRkLWNvbm5lY3Rpb24vbWFpbi50cycpXG4gICAgICB9LFxuICAgICAgb3V0cHV0OiB7XG4gICAgICAgIGVudHJ5RmlsZU5hbWVzOiAnW25hbWVdLmpzJyxcbiAgICAgICAgYXNzZXRGaWxlTmFtZXM6ICdbbmFtZV1bZXh0bmFtZV0nLFxuICAgICAgICBjaHVua0ZpbGVOYW1lczogJ2NodW5rcy9bbmFtZV0uanMnXG4gICAgICB9XG4gICAgfVxuICB9LFxuICByZXNvbHZlOiB7XG4gICAgYWxpYXM6IHtcbiAgICAgICRsaWI6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuL3NyYy9saWInKVxuICAgIH1cbiAgfVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQTJVLFNBQVMsb0JBQW9CO0FBQ3hXLFNBQVMsY0FBYztBQUN2QixPQUFPLFVBQVU7QUFGakIsSUFBTSxtQ0FBbUM7QUFJekMsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUyxDQUFDLE9BQU87QUFBQSxJQUNmLGlCQUFpQjtBQUFBLE1BQ2YsWUFBWTtBQUFBLElBQ2Q7QUFBQSxFQUNGLENBQUMsQ0FBQztBQUFBLEVBQ0YsTUFBTTtBQUFBLEVBQ04sT0FBTztBQUFBLElBQ0wsUUFBUSxLQUFLLFFBQVEsa0NBQVcsVUFBVTtBQUFBLElBQzFDLGFBQWE7QUFBQSxJQUNiLFdBQVc7QUFBQSxJQUNYLFdBQVc7QUFBQSxJQUNYLGNBQWM7QUFBQSxJQUNkLGVBQWU7QUFBQSxNQUNiLE9BQU87QUFBQSxRQUNMLG9CQUFvQixLQUFLLFFBQVEsa0NBQVcsZUFBZTtBQUFBLFFBQzNELHdCQUF3QixLQUFLLFFBQVEsa0NBQVcsK0JBQStCO0FBQUEsUUFDL0UscUJBQXFCLEtBQUssUUFBUSxrQ0FBVyw0QkFBNEI7QUFBQSxRQUN6RSxtQkFBbUIsS0FBSyxRQUFRLGtDQUFXLDBCQUEwQjtBQUFBLFFBQ3JFLHVCQUF1QixLQUFLLFFBQVEsa0NBQVcsOEJBQThCO0FBQUEsTUFDL0U7QUFBQSxNQUNBLFFBQVE7QUFBQSxRQUNOLGdCQUFnQjtBQUFBLFFBQ2hCLGdCQUFnQjtBQUFBLFFBQ2hCLGdCQUFnQjtBQUFBLE1BQ2xCO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQUNBLFNBQVM7QUFBQSxJQUNQLE9BQU87QUFBQSxNQUNMLE1BQU0sS0FBSyxRQUFRLGtDQUFXLFdBQVc7QUFBQSxJQUMzQztBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
