export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const SUPPORTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]);

export async function fetchImageForImport(
  value: string,
  fetchImage: typeof fetch = fetch
): Promise<Blob> {
  let url = validatedImportUrl(value);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      const response = await fetchImage(url.href, {
        signal: controller.signal,
        redirect: "manual",
        credentials: "omit",
        referrerPolicy: "no-referrer"
      });
      if (response.status >= 300 && response.status < 400) {
        if (redirects === MAX_REDIRECTS) throw new Error("That image redirected too many times.");
        const location = response.headers.get("location");
        if (!location) throw new Error("That image redirected without a destination.");
        url = validatedImportUrl(new URL(location, url).href);
        continue;
      }
      if (!response.ok) throw new Error("Could not load that image.");
      const type = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
      if (!SUPPORTED_IMAGE_TYPES.has(type)) throw new Error("That image format is not supported.");
      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_IMPORT_BYTES) throw tooLargeError();
      if (!response.body) throw new Error("Could not read that image.");
      return await readLimitedBlob(response.body, type);
    }
    throw new Error("That image redirected too many times.");
  } finally {
    clearTimeout(timeout);
  }
}

export function validatedImportUrl(value: string): URL {
  if (value.startsWith("data:image/")) {
    if (value.length > Math.ceil(MAX_IMPORT_BYTES * 1.4)) throw tooLargeError();
    return new URL(value);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("That image URL is invalid.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only web images can be docked.");
  }
  if (url.username || url.password) throw new Error("Image URLs containing credentials cannot be docked.");
  if (isNonPublicHostname(url.hostname)) {
    throw new Error("Images from local or private-network addresses cannot be docked.");
  }
  return url;
}

async function readLimitedBlob(stream: ReadableStream<Uint8Array>, type: string): Promise<Blob> {
  const reader = stream.getReader();
  const chunks: ArrayBuffer[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_IMPORT_BYTES) {
        await reader.cancel();
        throw tooLargeError();
      }
      chunks.push(new Uint8Array(value).buffer);
    }
  } finally {
    reader.releaseLock();
  }
  return new Blob(chunks, { type });
}

function isNonPublicHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || !host.includes(".")) {
    return true;
  }
  if (host.includes(":")) return isNonPublicIpv6(host);
  const octets = host.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = octets;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113);
}

function isNonPublicIpv6(host: string): boolean {
  const normalized = host.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (/^f[cd]/.test(normalized) || /^fe[89ab]/.test(normalized) || normalized.startsWith("ff")) return true;
  if (normalized === "2001:db8" || normalized.startsWith("2001:db8:")) return true;
  const mappedIpv4 = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mappedIpv4 ? isNonPublicHostname(mappedIpv4) : false;
}

function tooLargeError(): Error {
  return new Error("That image is larger than the 50 MB import limit.");
}
