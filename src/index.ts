import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  uploadBlob,
  MAX_GIF_SIZE as CATBOX_MAX_GIF_SIZE,
} from "./services/catbox";
import {
  uploadImageBlob,
  uploadImageUrl,
  MAX_FILE_SIZE as IMGBB_MAX_FILE_SIZE,
} from "./services/imgbb";

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

const checkOrigin = (allowedOrigin?: string, origin?: string) => {
  if (!allowedOrigin) {
    throw new HTTPException(403, {
      message: "ALLOWED_ORIGIN not set, blocking all requests",
    });
  }

  if (origin !== allowedOrigin) {
    throw new HTTPException(403, {
      message: `blocked request from origin: ${origin}`,
    });
  }
};

const checkContentLength = (maxFileSize: number, contentLength?: string) => {
  if (!contentLength) {
    throw new HTTPException(400, {
      message: "content length not specified",
    });
  }

  const fileSize = parseInt(contentLength, 10);
  if (fileSize > maxFileSize) {
    throw new HTTPException(413, {
      message: "request entity too large",
    });
  }
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
  const origin = c.req.header("Origin");
  checkOrigin(allowedOrigin, origin);

  const maxFileSize = getMaxUploadSize(c.env);
  const contentLength = c.req.header("Content-Length");
  checkContentLength(maxFileSize, contentLength);

  try {
    const { file } = await c.req.parseBody<Partial<BlobUploadBody>>();
    if (!file || !(file instanceof File)) {
      console.error("missing file in request body");

      return c.text("missing file in request body", 400);
    }

    // const isImg = file.type.startsWith("image/");
    // const isGif = file.type === "image/gif";
    // if (isGif) {
    //   const maxGifSize =
    //     CATBOX_MAX_GIF_SIZE > IMGBB_MAX_FILE_SIZE
    //       ? CATBOX_MAX_GIF_SIZE
    //       : IMGBB_MAX_FILE_SIZE;
    //   const isGifTooLarge = fileSize > maxGifSize;
    //   const maxGifSizeMb = Math.floor(maxGifSize / 1024 / 1024);

    //   console.error(
    //     `gif too large: ${fileSize} bytes (max: ${maxGifSizeMb} MB)`,
    //   );

    //   return c.text(`max supported gif size: ${maxGifSizeMb} MB`);
    // }

    const userhash = c.env.USERHASH;
    // const imgbbKey = c.env.IMGBB_API_KEY;
    // const isImgbbFileSize = fileSize < IMGBB_MAX_FILE_SIZE;
    // const useImgbb = isImg && isImgbbFileSize;
    // const useImgbbProvider = useImgbb && imgbbKey !== "";

    try {
      // const response = useImgbbProvider
      //   ? await uploadImageBlob(file, imgbbKey)
      //   : await uploadBlob(file, userhash);
      const response = await uploadBlob(file, userhash);
      const result = response.trim();

      c.header("Access-Control-Allow-Origin", allowedOrigin);
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
  const allowedOrigin = c.env.ALLOWED_ORIGIN;
  const origin = c.req.header("Origin");
  checkOrigin(allowedOrigin, origin);

  const maxFileSize = getMaxUploadSize(c.env);
  const contentLength = c.req.header("Content-Length");
  checkContentLength(maxFileSize, contentLength);

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
    // const imgbbKey = c.env.IMGBB_API_KEY;

    try {
      const file = await fetchFile(urlClean);
      const fileSize = file.size;
      // const isImg = file.type.startsWith("image/");
      // const isGif = file.type === "image/gif";
      // if (isGif) {
      //   const maxGifSize =
      //     CATBOX_MAX_GIF_SIZE > IMGBB_MAX_FILE_SIZE
      //       ? CATBOX_MAX_GIF_SIZE
      //       : IMGBB_MAX_FILE_SIZE;
      //   const isGifTooLarge = fileSize > maxGifSize;
      //   const maxGifSizeMb = Math.floor(maxGifSize / 1024 / 1024);

      //   return c.text(`max supported gif size: ${maxGifSizeMb} MB`);
      // }

      // Try to use ImgBB
      // try {
      //   if (!isImg) {
      //     throw new Error("not an image");
      //   }

      //   if (imgbbKey === "") {
      //     throw new Error("no ImgBB API key");
      //   }

      //   const isImgbbFileSize = fileSize < IMGBB_MAX_FILE_SIZE;
      //   if (!isImgbbFileSize) {
      //     throw new Error("file size too large");
      //   }

      //   const response = await uploadImageUrl(urlClean, imgbbKey);
      //   const result = response.trim();

      //   c.header("Access-Control-Allow-Origin", allowedOrigin);
      //   c.header("Content-Type", "text/plain");

      //   return c.text(result, 200);
      // } catch (err) {
      //   console.warn(
      //     "imgbb: failed to upload image URL to ImgBB",
      //     (err as Error).message,
      //   );
      // }

      // Use catbox
      try {
        // NOTE: Catbox URL upload is currently broken (returns empty image) so use blob upload
        const response = await uploadBlob(file, userhash);
        const result = response.trim();

        c.header("Access-Control-Allow-Origin", allowedOrigin);
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

// Block all other methods
app.all("*", (c) => {
  if (c.req.method !== "POST" && c.req.method !== "OPTIONS") {
    return c.text("method not allowed", 405);
  }

  return c.text("not found", 404);
});

export default app;
