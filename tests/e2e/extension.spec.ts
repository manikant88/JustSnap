import { expect, test, chromium, type BrowserContext, type Page, type Worker } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

const extensionPath = path.resolve("dist");

async function openTestPage(context: BrowserContext, url: string, body = "<main><h1>Destination</h1></main>"): Promise<Page> {
  const page = await context.newPage();
  await page.route(url, (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><title>DockSnip test page</title>${body}`
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

async function inspectIconAlpha(page: Page, size: number) {
  const dataUrl = `data:image/png;base64,${readFileSync(path.join(extensionPath, "icons", `icon-${size}.png`)).toString("base64")}`;
  return page.evaluate(async ({ dataUrl, size }) => {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Could not inspect extension icon pixels.");
    context.drawImage(image, 0, 0, size, size);
    const pixels = context.getImageData(0, 0, size, size).data;
    const alphaAt = (x: number, y: number) => pixels[(y * size + x) * 4 + 3];
    let minX = size;
    let minY = size;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (alphaAt(x, y) === 0) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    return {
      corners: [alphaAt(0, 0), alphaAt(size - 1, 0), alphaAt(0, size - 1), alphaAt(size - 1, size - 1)],
      bounds: { minX, minY, maxX, maxY }
    };
  }, { dataUrl, size });
}

test("renders the toolbar identity and an unfilled Close control", async () => {
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
    const page = await openTestPage(context, "https://toolbar-logo.docksnip.test/");
    await showDock(serviceWorker, page);

    const logomark = page.locator(".justsnap-toolbar-logomark");
    await expect(logomark).toBeVisible();
    await expect.poll(() => logomark.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(512);
    await expect.poll(() => page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].some((font) =>
        font.family.replace(/^['"]|['"]$/g, "") === "Host Grotesk" && font.status === "loaded"
      );
    })).toBe(true);
    await expect(page.getByText("Add images to your dock", { exact: true })).toHaveCSS("font-family", '"Host Grotesk"');
    await expect(page.getByRole("button", { name: "Dock it" })).toHaveCSS("font-weight", "600");
    await expect(page.getByRole("button", { name: "Snip it" })).toHaveCSS("font-weight", "600");
    const toolbarPlacement = await page.locator("#justsnap-root").evaluate((host) => {
      const toolbar = host.shadowRoot?.querySelector(".justsnap-capture-toolbar")?.getBoundingClientRect();
      if (!toolbar) throw new Error("DockSnip toolbar was not rendered.");
      return { top: toolbar.top, bottom: toolbar.bottom, viewportHeight: window.innerHeight };
    });
    expect(toolbarPlacement.viewportHeight - toolbarPlacement.bottom).toBeCloseTo(60, 0);
    expect(toolbarPlacement.top).toBeGreaterThan(toolbarPlacement.viewportHeight / 2);
    const dockEdge = await page.locator("#justsnap-root").evaluate((host) => {
      const shadow = host.shadowRoot;
      const edge = shadow?.querySelector(".justsnap-rail-silhouette-edge");
      const stops = [...(shadow?.querySelectorAll("#docksnip-rail-edge-fade stop") ?? [])];
      return {
        stroke: edge instanceof SVGPathElement ? getComputedStyle(edge).stroke : "",
        edgeColor: getComputedStyle(host).getPropertyValue("--docksnip-dock-edge").trim(),
        stopOpacities: stops.map((stop) => stop.getAttribute("stop-opacity"))
      };
    });
    expect(dockEdge.stroke).toContain("docksnip-rail-edge-fade");
    expect(dockEdge.edgeColor).toBe("rgba(203, 213, 225, 0.08)");
    expect(dockEdge.stopOpacities).toEqual(["1", "1", "0.24"]);
    for (const size of [16, 32, 48, 128, 512]) {
      const icon = await inspectIconAlpha(page, size);
      expect(icon.corners, `${size}px icon corners`).toEqual([0, 0, 0, 0]);
      expect(icon.bounds.minX, `${size}px icon left bound`).toBeLessThanOrEqual(1);
      expect(icon.bounds.minY, `${size}px icon top bound`).toBeLessThanOrEqual(1);
      expect(icon.bounds.maxX, `${size}px icon right bound`).toBeGreaterThanOrEqual(size - 2);
      expect(icon.bounds.maxY, `${size}px icon bottom bound`).toBeGreaterThanOrEqual(size - 2);
    }
    const close = page.getByRole("button", { name: /Close/ });
    await expect(close).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await close.hover();
    await expect(close).toHaveCSS("background-color", "rgb(74, 32, 35)");
    await expect(close).toHaveCSS("color", "rgba(254, 202, 202, 0.98)");
  } finally {
    await context.close();
  }
});

test("offers Dock image for image elements but not CSS page backgrounds", async () => {
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    viewport: { width: 900, height: 700 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    let [serviceWorker] = context.serviceWorkers();
    serviceWorker ??= await context.waitForEvent("serviceworker");
    const imageData = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='240'%3E%3Crect width='400' height='240' fill='%230ea5e9'/%3E%3C/svg%3E";
    const page = await openTestPage(
      context,
      "https://page-images.docksnip.test/",
      `<main style="width: 700px; height: 300px; background-image: url(&quot;${imageData}&quot;); background-size: cover"></main><img alt="Dockable reference" src="${imageData}" width="400" height="240">`
    );
    await showDock(serviceWorker, page);

    await page.locator("main").hover({ position: { x: 350, y: 150 } });
    await expect(page.getByRole("button", { name: "Dock image" })).toBeHidden();

    await page.getByAltText("Dockable reference").hover({ position: { x: 200, y: 120 } });
    const dockImage = page.getByRole("button", { name: "Dock image" });
    await expect(dockImage).toBeVisible();
    await dockImage.hover();
    await expect(dockImage).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(dockImage).toHaveCSS("color", "rgb(5, 5, 6)");
  } finally {
    await context.close();
  }
});

test("preserves an active folder destination when switching tabs", async () => {
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
    const firstPage = await openTestPage(context, "https://add-first.docksnip.test/");
    await firstPage.bringToFront();
    await serviceWorker.evaluate(async () => {
      await chrome.runtime.sendMessage({ type: "JUSTSNAP_TOGGLE_RAIL" });
    });
    await expect(firstPage.locator("#justsnap-root")).toBeAttached();
    await firstPage.getByRole("button", { name: "Add Folder" }).click();
    await expect(firstPage.getByText("Adding to folder", { exact: true })).toBeVisible();

    const secondPage = await openTestPage(context, "https://add-second.docksnip.test/");
    await secondPage.bringToFront();
    await expect(secondPage.locator("#justsnap-root")).toBeAttached();
    await expect(secondPage.getByText("Adding to folder", { exact: true })).toBeVisible();
    await expect(secondPage.getByRole("button", { name: "Folder, 0 captures" })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("closes a populated folder flyout over Dock controls and undoes destructive actions", async () => {
  test.setTimeout(60_000);
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    viewport: { width: 450, height: 678 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    let [serviceWorker] = context.serviceWorkers();
    serviceWorker ??= await context.waitForEvent("serviceworker");
    const page = await openTestPage(context, "https://flyout-controls.docksnip.test/");
    await showDock(serviceWorker, page);

    await page.getByRole("button", { name: "Add Folder" }).click();
    const folder = page.getByRole("button", { name: "Folder, 0 captures" });
    await folder.hover();
    await expect(page.getByText("Adding to folder", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Snip it" }).click();
    await page.mouse.move(40, 180);
    await page.mouse.down();
    await page.mouse.move(180, 300);
    await page.mouse.up();
    await page.mouse.move(210, 180);
    await page.mouse.down();
    await page.mouse.move(350, 300);
    await page.mouse.up();
    await page.getByTitle("Done snipping (Enter)").click();
    await page.getByTitle("Finish adding (Enter)").click();

    const populatedFolder = page.getByRole("button", { name: "Folder, 2 captures" });
    await populatedFolder.hover();
    await expect(page.getByLabel("Folder captures")).toBeVisible();
    const addFolderControl = page.getByRole("button", { name: "Add Folder" });
    await addFolderControl.hover();
    const addFolderBox = await addFolderControl.boundingBox();
    if (!addFolderBox) throw new Error("Add Folder control has no layout box.");
    await page.mouse.move(addFolderBox.x - 24, addFolderBox.y + addFolderBox.height / 2);
    await page.waitForTimeout(250);
    await expect(page.getByLabel("Folder captures")).toBeHidden();

    await populatedFolder.hover();
    await expect(page.getByLabel("Folder captures")).toBeVisible();
    await page.getByRole("button", { name: "Clear Dock" }).hover();
    await page.waitForTimeout(250);
    await expect(page.getByLabel("Folder captures")).toBeHidden();

    await populatedFolder.hover();
    await page.getByRole("button", { name: "Folder capture" }).first().hover();
    await page.getByRole("button", { name: "Remove capture" }).click();
    await expect(page.getByRole("status")).toContainText("Image deleted.");
    await expect(page.getByRole("button", { name: "Folder, 1 captures" })).toBeVisible();
    await page.getByRole("button", { name: "Clear Dock" }).click();
    const confirmation = page.getByRole("alertdialog", { name: "Clear Dock" });
    const deletionNotice = page.getByRole("status");
    await expect(confirmation).toBeVisible();
    const [confirmationBox, deletionNoticeBox] = await Promise.all([
      confirmation.boundingBox(),
      deletionNotice.boundingBox()
    ]);
    if (!confirmationBox || !deletionNoticeBox) throw new Error("Notification surfaces have no layout boxes.");
    expect(confirmationBox.y + confirmationBox.height + 7).toBeLessThanOrEqual(deletionNoticeBox.y);
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("status")).toContainText("Image restored.");
    await expect(page.getByRole("button", { name: "Folder, 2 captures" })).toBeVisible();

    await page.getByRole("button", { name: "Clear Dock" }).click();
    await page.getByRole("button", { name: "Clear all" }).click();
    await expect(page.getByRole("status")).toContainText("Dock cleared.");
    await expect(page.getByRole("button", { name: "Folder, 2 captures" })).toBeHidden();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("status")).toContainText("Dock restored.");
    await expect(page.getByRole("button", { name: "Folder, 2 captures" })).toBeVisible();
  } finally {
    await context.close();
  }
});

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
    const controlGeometry = await firstPage.locator("#justsnap-root").evaluate((host) => {
      const shadow = host.shadowRoot;
      const rail = shadow?.querySelector(".justsnap-rail")?.getBoundingClientRect();
      const create = shadow?.querySelector('[aria-label="Add Folder"]');
      const clear = shadow?.querySelector('[aria-label="Clear Dock"]');
      if (!rail || !(create instanceof HTMLElement) || !(clear instanceof HTMLElement)) {
        throw new Error("Dock controls were not rendered.");
      }
      const createRect = create.getBoundingClientRect();
      const clearRect = clear.getBoundingClientRect();
      return {
        createRadius: Number.parseFloat(getComputedStyle(create).borderTopLeftRadius),
        clearRadius: Number.parseFloat(getComputedStyle(clear).borderBottomLeftRadius),
        topInset: createRect.top - rail.top,
        bottomInset: rail.bottom - clearRect.bottom,
        leftInset: createRect.left - rail.left,
        rightInset: rail.right - createRect.right
      };
    });
    expect(controlGeometry.createRadius).toBeGreaterThanOrEqual(14);
    expect(controlGeometry.clearRadius).toBe(controlGeometry.createRadius);
    expect(controlGeometry.topInset).toBeGreaterThanOrEqual(5);
    expect(controlGeometry.bottomInset).toBeGreaterThanOrEqual(5);
    expect(controlGeometry.leftInset).toBeGreaterThanOrEqual(8);
    expect(controlGeometry.rightInset).toBeGreaterThanOrEqual(8);
    const controlInsets = [
      controlGeometry.topInset,
      controlGeometry.bottomInset,
      controlGeometry.leftInset,
      controlGeometry.rightInset
    ];
    expect(Math.max(...controlInsets) - Math.min(...controlInsets)).toBeLessThanOrEqual(1);
    await firstPage.getByRole("button", { name: "Add Folder" }).focus();
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
        notice: { width: notice.width, height: notice.height, bottom: notice.bottom },
        toolbarTop: toolbar.top
      };
    });
    expect(surfaceSizes.notice.width).toBeLessThan(surfaceSizes.toolbar.width);
    expect(surfaceSizes.notice.height).toBeLessThan(surfaceSizes.toolbar.height);
    expect(surfaceSizes.notice.bottom).toBeLessThan(surfaceSizes.toolbarTop);
    await secondPage.getByRole("button", { name: "Undo" }).click();
    await expect(secondPage.getByRole("button", { name: "Folder, 0 captures" })).toBeVisible();

    const createFolder = secondPage.getByRole("button", { name: "Add Folder" });
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
    await createFolder.hover();
    await expect(secondPage.getByLabel("Folder captures")).toBeHidden();
    await folders.first().dispatchEvent("mouseover");
    await expect(secondPage.getByLabel("Folder captures")).toBeVisible();
    await secondPage.getByRole("button", { name: "Clear Dock" }).hover();
    await expect(secondPage.getByLabel("Folder captures")).toBeHidden();
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
    await expect(page.getByTitle("Done snipping (Enter)")).toHaveCSS("background-color", "rgb(22, 134, 66)");
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
