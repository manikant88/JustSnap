import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(projectRoot, "public/logos/docksnip-logomark.svg");
const outputDirectory = path.join(projectRoot, "public/icons");
const iconSizes = [16, 32, 48, 128, 512];

const source = await readFile(sourcePath, "utf8");
const sourceUrl = `data:image/svg+xml;base64,${Buffer.from(source).toString("base64")}`;
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  await mkdir(outputDirectory, { recursive: true });

  for (const size of iconSizes) {
    const pngDataUrl = await page.evaluate(async ({ sourceUrl, size }) => {
      const image = new Image();
      image.src = sourceUrl;
      await image.decode();

      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not create the icon rendering context.");

      context.clearRect(0, 0, size, size);
      context.drawImage(image, 0, 0, size, size);
      return canvas.toDataURL("image/png");
    }, { sourceUrl, size });

    const png = Buffer.from(pngDataUrl.slice(pngDataUrl.indexOf(",") + 1), "base64");
    await writeFile(path.join(outputDirectory, `icon-${size}.png`), png);
  }
} finally {
  await browser.close();
}
