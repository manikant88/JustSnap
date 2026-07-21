import { build } from "esbuild";
import { rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const output = `/tmp/docksnip-tests-${process.pid}.mjs`;
try {
  await build({
    entryPoints: ["tests/libraryModel.test.ts"],
    outfile: output,
    bundle: true,
    platform: "node",
    format: "esm",
    logLevel: "silent"
  });
  await import(pathToFileURL(output).href);
} finally {
  await rm(output, { force: true });
}
