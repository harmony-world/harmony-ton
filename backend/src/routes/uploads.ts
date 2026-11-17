import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { deleteUnreferencedUploads, resolveUploadsDir } from "../services/upload-cleanup.js";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png"]);
const MAX_FILE_SIZE = 5 * 1024 * 1024;

function ext(mime: string): string {
  return mime === "image/png" ? ".png" : ".jpg";
}

function detectImageMime(buf: Buffer): "image/jpeg" | "image/png" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "image/png";
  }

  return null;
}

export async function uploadRoutes(app: FastifyInstance) {
  await app.register(multipart, { limits: { fileSize: MAX_FILE_SIZE, files: 1 } });

  const uploadsDir = resolveUploadsDir();

  await fs.mkdir(uploadsDir, { recursive: true });

  app.post("/uploads/image", async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: "No file uploaded" });
    }
    if (!ALLOWED_MIME.has(data.mimetype)) {
      return reply.code(400).send({ error: "Only JPEG and PNG are allowed" });
    }

    const filename = `${crypto.randomUUID()}${ext(data.mimetype)}`;
    const dest = path.join(uploadsDir, filename);
    const buf = await data.toBuffer();

    if (buf.length > MAX_FILE_SIZE) {
      return reply.code(400).send({ error: "File too large" });
    }

    const detectedMime = detectImageMime(buf);
    if (!detectedMime || detectedMime !== data.mimetype) {
      return reply.code(400).send({ error: "Invalid image file" });
    }

    await fs.writeFile(dest, buf);
    return reply.code(201).send({ url: `/uploads/${filename}` });
  });

  app.delete<{
    Body: { urls: string[] };
  }>(
    "/uploads/image",
    {
      schema: {
        body: {
          type: "object",
          required: ["urls"],
          additionalProperties: false,
          properties: {
            urls: {
              type: "array",
              minItems: 1,
              maxItems: 10,
              items: { type: "string", minLength: 1, maxLength: 120 },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const result = await deleteUnreferencedUploads({
        prisma: app.prisma,
        uploadsDir,
        urls: request.body.urls,
        logger: app.log,
      });

      return reply.code(200).send(result);
    }
  );
}
