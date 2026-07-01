import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { fetchFile } from "./utils";
import { uploadBlob } from "./services/catbox";

interface Env {
  USERHASH: string;
  ALLOWED_ORIGIN: string;
  MAX_UPLOAD_SIZE: string;
  IMGBB_API_KEY: string;
}

interface BlobUploadBody {
  file: File;
}

interface UrlUploadBody {
  url: string;
}

// Cloudflare max body size limit
const DEFAULT_MAX_UPLOAD_SIZE = 100 * 1024 * 1024; // 100 MB

const app = new Hono<{ Bindings: Env }>();

app.use(
  "*",
  // CORS
  (c, next) => {
    const allowedOrigin = c.env.ALLOWED_ORIGIN;
    if (!allowedOrigin) {
      throw new HTTPException(403, {
        message: "ALLOWED_ORIGIN not set, blocking all requests",
      });
    }

    const corsMiddlewareHandler = cors({
      origin: c.env.ALLOWED_ORIGIN,
      allowMethods: ["POST"],
      allowHeaders: ["Content-Type"],
    });

    return corsMiddlewareHandler(c, next);
  },
  // Content Length header validation
  async (c, next) => {
    const contentLength = c.req.header("Content-Length");
    if (!contentLength) {
      return c.text("Missing Content-Length header", 411);
    }

    if (isNaN(Number(contentLength))) {
      return c.text("Invalid Content-Length header", 400);
    }

    await next();
  },
  // Body size validation
  (c, next) => {
    const envMaxUploadSize = parseInt(c.env.MAX_UPLOAD_SIZE, 10);
    const useDefault = isNaN(envMaxUploadSize) || envMaxUploadSize <= 0;
    const maxSize = useDefault ? DEFAULT_MAX_UPLOAD_SIZE : envMaxUploadSize;

    const bodyLimitMiddlewareHandler = bodyLimit({
      maxSize,
      onError: (c) => c.text("entity too large", 413),
    });

    return bodyLimitMiddlewareHandler(c, next);
  },
);

app.post("/blob", async (c) => {
  try {
    const { file } = await c.req.parseBody<Partial<BlobUploadBody>>();
    if (!file || !(file instanceof File)) {
      console.error("missing file in request body");

      return c.text("missing file in request body", 400);
    }

    const userhash = c.env.USERHASH;

    try {
      const response = await uploadBlob(file, userhash);
      const result = response.trim();

      c.header("Content-Type", "text/plain");

      return c.text(result, 200);
    } catch (err) {
      console.error(`upload failed: ${(err as Error).message}`);

      return c.text(`upload failed: ${(err as Error).message}`, 500);
    }
  } catch (err) {
    console.error(`failed to parse body: ${(err as Error).message}`);

    return c.text(`failed to parse body: ${(err as Error).message}`, 400);
  }
});

app.post("/url", async (c) => {
  try {
    const { url } = await c.req.parseBody<Partial<UrlUploadBody>>();
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

    const urlClean = url.trim();
    const userhash = c.env.USERHASH;

    try {
      const file = await fetchFile(urlClean);

      // Use catbox
      try {
        const response = await uploadBlob(file, userhash);
        const result = response.trim();

        c.header("Content-Type", "text/plain");

        return c.text(result, 200);
      } catch (err) {
        return c.text(
          `catbox: failed to upload file: ${(err as Error).message}`,
          500,
        );
      }
    } catch (err) {
      return c.text(`failed to fetch file: ${(err as Error).message}`, 500);
    }
  } catch (err) {
    return c.text(`failed to parse body: ${(err as Error).message}`, 400);
  }
});

app.all("*", (c) => {
  if (c.req.method !== "POST" && c.req.method !== "OPTIONS") {
    return c.text("method not allowed", 405);
  }

  return c.text("not found", 404);
});

export default app;
