import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { rm } from "node:fs/promises";

const clipboardBundle = `/tmp/docksnip-clipboard-${process.pid}.js`;

test.beforeAll(async () => {
  await build({
    entryPoints: ["src/content/drag/filePayload.ts"],
    outfile: clipboardBundle,
    bundle: true,
    platform: "browser",
    format: "iife",
    globalName: "DockSnipClipboard",
    logLevel: "silent"
  });
});

test.afterAll(async () => {
  await rm(clipboardBundle, { force: true });
});

test("copies a JPEG capture as a PNG clipboard image", async ({ context, page }) => {
  const origin = "https://clipboard.docksnip.test";
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  await page.route(`${origin}/`, (route) => route.fulfill({
    contentType: "text/html",
    body: "<!doctype html><button id='copy'>Copy capture</button>"
  }));
  await page.goto(`${origin}/`);
  await page.addScriptTag({ path: clipboardBundle });
  await page.evaluate(() => {
    const button = document.querySelector("#copy");
    if (!(button instanceof HTMLButtonElement)) throw new Error("Copy button was not rendered.");
    (window as typeof window & { __copyResult?: unknown }).__copyResult = undefined;
    button.addEventListener("click", async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 2;
      canvas.height = 2;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas was not available.");
      context.fillRect(0, 0, 2, 2);
      const jpeg = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("JPEG preparation failed.")),
        "image/jpeg"
      ));
      const api = (window as typeof window & {
        DockSnipClipboard: { copyFilesToClipboard(files: File[]): Promise<boolean> };
      }).DockSnipClipboard;
      const ok = await api.copyFilesToClipboard([
        new File([jpeg], "image.jpg", { type: "image/jpeg" })
      ]);
      const items = await navigator.clipboard.read();
      (window as typeof window & { __copyResult?: unknown }).__copyResult = {
        ok,
        types: items.flatMap((item) => item.types)
      };
    });
  });

  await page.getByRole("button", { name: "Copy capture" }).click();
  await page.waitForFunction(() => (window as typeof window & { __copyResult?: unknown }).__copyResult !== undefined);
  await expect.poll(() => page.evaluate(
    () => (window as typeof window & { __copyResult?: unknown }).__copyResult
  )).toEqual({ ok: true, types: ["image/png"] });
});
