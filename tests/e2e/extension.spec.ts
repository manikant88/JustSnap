import { expect, test, chromium, type BrowserContext, type Page, type Worker } from "@playwright/test";
import path from "node:path";

const extensionPath = path.resolve("dist");

async function openTestPage(context: BrowserContext, url: string): Promise<Page> {
  const page = await context.newPage();
  await page.route("**/*", (route) => route.fulfill({
    contentType: "text/html",
    body: "<!doctype html><title>DockSnip test page</title><main><h1>Destination</h1></main>"
  }));
  await page.goto(url);
  return page;
}

async function showDock(worker: Worker, page: Page): Promise<void> {
  await worker.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url });
    if (!tab?.id) throw new Error("DockSnip test tab was not found.");
    await chrome.tabs.sendMessage(tab.id, { type: "JUSTSNAP_SHOW_RAIL" });
  }, page.url());
}

async function sendToPage(worker: Worker, page: Page, message: unknown): Promise<void> {
  await worker.evaluate(async ({ url, message }) => {
    const [tab] = await chrome.tabs.query({ url });
    if (!tab?.id) throw new Error("DockSnip test tab was not found.");
    await chrome.tabs.sendMessage(tab.id, message);
  }, { url: page.url(), message });
}

test("persists Folders, supports undo and keyboard input, and keeps crowded Docks overflow-visible", async () => {
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    let [serviceWorker] = context.serviceWorkers();
    serviceWorker ??= await context.waitForEvent("serviceworker");
    expect(await serviceWorker.evaluate(() => chrome.runtime.getManifest().name)).toBe("DockSnip");
    const extensionId = new URL(serviceWorker.url()).host;

    const firstPage = await openTestPage(context, "https://first.docksnip.test/");
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
    await expect(optionsPage.getByRole("heading", { name: "DockSnip" })).toBeVisible();
    await expect(optionsPage.getByText("Captures", { exact: true })).toBeVisible();
    await showDock(serviceWorker, firstPage);

    await expect(firstPage.locator("#justsnap-root")).toBeAttached();
    await firstPage.getByRole("button", { name: "Create a new folder" }).focus();
    await firstPage.keyboard.press("Enter");
    await expect(firstPage.getByRole("button", { name: "Folder, 0 captures" })).toBeVisible();

    const secondPage = await openTestPage(context, "https://second.docksnip.test/");
    await showDock(serviceWorker, secondPage);
    await expect(secondPage.locator("#justsnap-root")).toBeAttached();
    const folder = secondPage.getByRole("button", { name: "Folder, 0 captures" });
    await expect(folder).toBeVisible();

    await folder.hover();
    await secondPage.getByRole("button", { name: "Remove folder" }).click();
    await expect(secondPage.getByText("Folder deleted.")).toBeVisible();
    await expect(secondPage.getByRole("status")).toHaveCSS("border-radius", "999px");
    await expect(secondPage.getByRole("status")).toHaveCSS("min-height", "46px");
    const surfaceSizes = await secondPage.locator("#justsnap-root").evaluate((host) => {
      const shadow = host.shadowRoot;
      const toolbar = shadow?.querySelector(".justsnap-capture-toolbar")?.getBoundingClientRect();
      const notice = shadow?.querySelector(".justsnap-toolbar-notice")?.getBoundingClientRect();
      if (!toolbar || !notice) throw new Error("DockSnip toolbar surfaces were not rendered.");
      return {
        toolbar: { width: toolbar.width, height: toolbar.height },
        notice: { width: notice.width, height: notice.height }
      };
    });
    expect(surfaceSizes.notice.width).toBeLessThan(surfaceSizes.toolbar.width);
    expect(surfaceSizes.notice.height).toBeLessThan(surfaceSizes.toolbar.height);
    await secondPage.getByRole("button", { name: "Undo" }).click();
    await expect(secondPage.getByRole("button", { name: "Folder, 0 captures" })).toBeVisible();

    const createFolder = secondPage.getByRole("button", { name: "Create a new folder" });
    const folders = secondPage.getByRole("button", { name: "Folder, 0 captures" });
    for (let expectedCount = 2; expectedCount <= 20; expectedCount += 1) {
      await createFolder.click();
      await expect(folders).toHaveCount(expectedCount);
    }
    const overflow = await secondPage.locator("#justsnap-root").evaluate((host) => {
      const library = host.shadowRoot?.querySelector(".justsnap-library");
      if (!(library instanceof HTMLElement)) throw new Error("DockSnip library was not rendered.");
      const style = getComputedStyle(library);
      return { x: style.overflowX, y: style.overflowY, maxHeight: style.maxHeight };
    });
    expect(overflow).toEqual({ x: "visible", y: "visible", maxHeight: "none" });
    await folders.first().dispatchEvent("mouseover");
    await expect(secondPage.getByLabel("Folder captures")).toBeVisible();
    await expect(secondPage.getByRole("status")).toBeHidden({ timeout: 12_000 });
  } finally {
    await context.close();
  }
});

test("keeps the side Dock and capture toolbar visible while taking a screenshot", async () => {
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    let [serviceWorker] = context.serviceWorkers();
    serviceWorker ??= await context.waitForEvent("serviceworker");
    const page = await openTestPage(context, "https://capture.docksnip.test/");
    await showDock(serviceWorker, page);
    await sendToPage(serviceWorker, page, {
      type: "JUSTSNAP_START_CAPTURE",
      sessionId: "e2e-capture-session",
      captureCount: 0,
      captureIds: []
    });
    await expect(page.getByTitle("Done (Enter)")).toHaveCSS("background-color", "rgb(22, 134, 66)");
    await expect(page.locator(".justsnap-capture-toolbar")).toHaveCSS("opacity", "1");

    await page.locator("#justsnap-root").evaluate((host) => {
      const shadow = host.shadowRoot;
      if (!shadow) throw new Error("DockSnip shadow root was not rendered.");
      const hiddenTransitions: string[] = [];
      const recordHiddenState = () => {
        for (const selector of [".justsnap-rail", ".justsnap-capture-toolbar"]) {
          const surface = shadow.querySelector(selector);
          if (!(surface instanceof HTMLElement)) continue;
          const style = getComputedStyle(surface);
          if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
            hiddenTransitions.push(`${selector}:${surface.className}`);
          }
        }
      };
      recordHiddenState();
      new MutationObserver(recordHiddenState).observe(shadow, {
        attributes: true,
        attributeFilter: ["class", "style"],
        subtree: true
      });
      (window as typeof window & { __docksnipHiddenTransitions?: string[] }).__docksnipHiddenTransitions = hiddenTransitions;
    });

    await page.mouse.move(100, 100);
    await page.mouse.down();
    await page.mouse.move(320, 260, { steps: 4 });
    await page.mouse.up();
    await expect(page.getByRole("button", { name: "DockSnip capture" })).toBeVisible();

    const hiddenTransitions = await page.evaluate(
      () => (window as typeof window & { __docksnipHiddenTransitions?: string[] }).__docksnipHiddenTransitions ?? []
    );
    expect(hiddenTransitions).toEqual([]);

    await page.mouse.move(400, 300);
    await page.mouse.down();
    await page.mouse.move(408, 308);
    await page.mouse.up();
    const errorNotice = page.getByRole("alert");
    await expect(errorNotice).toContainText("Select a larger area.");
    await expect(errorNotice).toBeHidden({ timeout: 12_000 });
  } finally {
    await context.close();
  }
});
