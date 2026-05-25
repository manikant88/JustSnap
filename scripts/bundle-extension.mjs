import { build } from "esbuild";

const common = {
  bundle: true,
  platform: "browser",
  target: "chrome120",
  sourcemap: false,
  minify: true,
  logLevel: "info"
};

await build({
  ...common,
  entryPoints: ["src/content.tsx"],
  outfile: "dist/content.js",
  format: "iife",
  jsx: "automatic"
});

await build({
  ...common,
  entryPoints: ["src/background.ts"],
  outfile: "dist/background.js",
  format: "esm"
});
