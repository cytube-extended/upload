import { Hono } from "hono";
import { uploadBlob, uploadUrl } from "./services/catbox";

interface Env {
  USERHASH: string;
  ALLOWED_ORIGIN: string;
  MAX_UPLOAD_SIZE: string;
}

interface BlobUploadBody {
  file: File;
}

interface UrlUploadBody {
  url: string;
  fetch?: "true" | "false";
}

const CLOUDFLARE_MAX_BODY_SIZE = 100 * 1024 * 1024; // 100 MB
const DEFAULT_MAX_UPLOAD_SIZE = CLOUDFLARE_MAX_BODY_SIZE;
const FALLBACK_MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50 MB

const getMaxUploadSize = (env: Env): number => {
  const raw = env.MAX_UPLOAD_SIZE;
  if (!raw) {
    return DEFAULT_MAX_UPLOAD_SIZE;
  }

  const n = parseInt(raw, 10);
  if (isNaN(n) || n <= 0) {
    console.warn(`Invalid MAX_UPLOAD_SIZE, using fallback 50 MB: ${raw}`);

    return FALLBACK_MAX_UPLOAD_SIZE;
  }

  return n;
};

const fetchFile = async (url: string): Promise<File> => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch url content: ${response.status}`);
  }

  const blob = await response.blob();
  const filename = new URL(url).pathname.split("/").pop() || "file";
  const file = new File([blob], filename, { type: blob.type });

  return file;
};

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  const allowedOrigin = c.env.ALLOWED_ORIGIN;

  // Preflight
  if (c.req.method === "OPTIONS") {
    if (allowedOrigin) {
      c.header("Access-Control-Allow-Origin", allowedOrigin);
      c.header("Access-Control-Allow-Methods", "POST, OPTIONS");
      c.header("Access-Control-Allow-Headers", "Content-Type");
    }

    return c.text("", 200);
  }

  await next();
});

app.post("/blob", async (c) => {
  const allowedOrigin = c.env.ALLOWED_ORIGIN;
  if (!allowedOrigin) {
    console.error("ALLOWED_ORIGIN not set, blocking all requests");

    return c.text("forbidden", 403);
  }

  const origin = c.req.header("Origin");
  if (origin !== allowedOrigin) {
    console.warn(`blocked request from origin: ${origin}`);

    return c.text("forbidden", 403);
  }

  const contentLength = c.req.header("Content-Length");
  if (!contentLength) {
    return c.text("content length not specified", 400);
  }

  const maxFileSize = getMaxUploadSize(c.env);
  const fileSize = parseInt(contentLength, 10);
  if (fileSize > maxFileSize) {
    return c.text("request entity too large", 413);
  }

  try {
    const { file } = await c.req.parseBody<Partial<BlobUploadBody>>();
    if (!file || !(file instanceof File)) {
      return c.text("missing file in request body", 400);
    }

    const userhash = c.env.USERHASH;
    try {
      const response = await uploadBlob(file, userhash);
      const result = response.trim();

      c.header("Access-Control-Allow-Origin", allowedOrigin);
      c.header("Content-Type", "text/plain");

      return c.text(result, 200);
    } catch (err) {
      return c.text(`catbox upload failed: ${(err as Error).message}`, 500);
    }
  } catch (err) {
    return c.text(`failed to parse body: ${(err as Error).message}`, 400);
  }
});

app.post("/url", async (c) => {
  const allowedOrigin = c.env.ALLOWED_ORIGIN;
  if (!allowedOrigin) {
    console.error("ALLOWED_ORIGIN not set, blocking all requests");

    return c.text("forbidden", 403);
  }

  const origin = c.req.header("Origin");
  if (origin !== allowedOrigin) {
    console.warn(`blocked request from origin: ${origin}`);

    return c.text("forbidden", 403);
  }

  const contentLength = c.req.header("Content-Length");
  if (!contentLength) {
    return c.text("content length not specified", 400);
  }

  const maxFileSize = getMaxUploadSize(c.env);
  const fileSize = parseInt(contentLength, 10);
  if (fileSize > maxFileSize) {
    return c.text("request entity too large", 413);
  }

  try {
    const { url, fetch: toFetch } =
      await c.req.parseBody<Partial<UrlUploadBody>>();
    if (typeof url !== "string") {
      return c.text("missing url in request body", 400);
    }

    if (url.length === 0) {
      return c.text("empty url in request body", 400);
    }

    try {
      new URL(url);
    } catch (err) {
      return c.text(
        `invalid url in request body: ${(err as Error).message}`,
        400,
      );
    }

    const userhash = c.env.USERHASH;
    try {
      const urlClean = url.trim();
      const shouldFetch = toFetch === "true";
      const response = shouldFetch
        ? await uploadBlob(await fetchFile(urlClean), userhash)
        : await uploadUrl(urlClean, userhash);
      const result = response.trim();

      c.header("Access-Control-Allow-Origin", allowedOrigin);
      c.header("Content-Type", "text/plain");

      return c.text(result, 200);
    } catch (err) {
      return c.text(`catbox upload failed: ${(err as Error).message}`, 500);
    }
  } catch (err) {
    return c.text(`failed to parse body: ${(err as Error).message}`, 400);
  }
});

// Block all other methods
app.all("*", (c) => {
  if (c.req.method !== "POST" && c.req.method !== "OPTIONS") {
    return c.text("method not allowed", 405);
  }

  return c.text("not found", 404);
});

export default app;
