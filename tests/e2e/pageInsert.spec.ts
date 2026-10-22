import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { rm } from "node:fs/promises";

const pageInsertBundle = `/tmp/docksnip-page-insert-${process.pid}.js`;

test.beforeAll(async () => {
  await build({
    entryPoints: ["src/content/drag/pageInsert.ts"],
    outfile: pageInsertBundle,
    bundle: true,
    platform: "browser",
    format: "iife",
    globalName: "DockSnipPageInsert",
    logLevel: "silent"
  });
});

test.afterAll(async () => {
  await rm(pageInsertBundle, { force: true });
});

test("delivers a two-image Folder to an attachment input exactly once", async ({ page }) => {
  await page.setContent('<input id="attachments" type="file" accept="image/*" multiple>');
  await page.addScriptTag({ path: pageInsertBundle });

  const delivery = await page.evaluate(async () => {
    const input = document.querySelector("#attachments");
    if (!(input instanceof HTMLInputElement)) throw new Error("Attachment input was not rendered.");
    const attachmentNames: string[] = [];
    const recordAttachments = () => {
      attachmentNames.push(...Array.from(input.files ?? []).map((file) => file.name));
    };
    input.addEventListener("input", recordAttachments);
    input.addEventListener("change", recordAttachments);

    const api = (window as typeof window & {
      DockSnipPageInsert: {
        placeFilesInCurrentPage(
          files: File[],
          environment: { currentOrigin(): string; isDockSnipNode(node: Node): boolean },
          preferredTarget?: Element
        ): Promise<{ ok: boolean }>;
      };
    }).DockSnipPageInsert;
    const result = await api.placeFilesInCurrentPage(
      [
        new File(["first"], "first.png", { type: "image/png" }),
        new File(["second"], "second.png", { type: "image/png" })
      ],
      { currentOrigin: () => "https://chatgpt.com", isDockSnipNode: () => false },
      document.body
    );
    return { result, attachmentNames };
  });

  expect(delivery).toEqual({
    result: { ok: true },
    attachmentNames: ["first.png", "second.png"]
  });
});

test("uses ChatGPT's drop zone instead of its duplicating hidden file input", async ({ page }) => {
  await page.setContent(`
    <div id="composer" contenteditable="true" style="width: 400px; height: 120px"></div>
    <input id="attachments" type="file" accept="image/*" multiple>
  `);
  await page.addScriptTag({ path: pageInsertBundle });

  const delivery = await page.evaluate(async () => {
    const composer = document.querySelector("#composer");
    const input = document.querySelector("#attachments");
    if (!(composer instanceof HTMLElement)) throw new Error("Composer was not rendered.");
    if (!(input instanceof HTMLInputElement)) throw new Error("Attachment input was not rendered.");
    const attachmentNames: string[] = [];
    const files = [
      new File(["first"], "first.png", { type: "image/png" }),
      new File(["second"], "second.png", { type: "image/png" })
    ];

    composer.addEventListener("drop", (event) => {
      attachmentNames.push(...Array.from(event.dataTransfer?.files ?? []).map((file) => file.name));
      event.preventDefault();
    });

    input.addEventListener("change", () => {
      const names = Array.from(input.files ?? []).map((file) => file.name);
      attachmentNames.push(...names, ...names);
    });

    const api = (window as typeof window & {
      DockSnipPageInsert: {
        placeFilesInCurrentPage(
          files: File[],
          environment: { currentOrigin(): string; isDockSnipNode(node: Node): boolean },
          preferredTarget?: Element
        ): Promise<{ ok: boolean }>;
      };
    }).DockSnipPageInsert;
    const result = await api.placeFilesInCurrentPage(
      files,
      { currentOrigin: () => "https://chatgpt.com", isDockSnipNode: () => false },
      composer
    );
    return { result, attachmentNames };
  });

  expect(delivery).toEqual({
    result: { ok: true },
    attachmentNames: ["first.png", "second.png"]
  });
});
