import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import encodeWebp, { init as initWebp } from "@jsquash/webp/encode.js";
import { parseUploadUrl } from "../services/upload-cleanup.js";

export const WIDGET_PHOTO_PREFIX = "data:image/webp;base64,";
export const WIDGET_PHOTO_MAX_CHARS = 1024;
export const WIDGET_PHOTO_RE = /^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/;
const SIZES: ReadonlyArray<readonly [number, number]> = [
  [96, 96],
  [80, 80],
  [64, 64],
];
const QUALITIES = [40, 30, 22, 16, 11, 7, 4];
const MAX_FILE_BYTES = 15 * 1024 * 1024;

type Rgba = { width: number; height: number; data: Uint8Array };

function decode(buf: Buffer): Rgba | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    const raw = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 256 });
    return { width: raw.width, height: raw.height, data: raw.data };
  }
  if (buf.length >= 8 && buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a) {
    const png = PNG.sync.read(buf);
    return { width: png.width, height: png.height, data: png.data };
  }
  return null;
}

export function cropAndShrink(img: Rgba, w: number, h: number): Uint8ClampedArray {
  let cw = img.width;
  let ch = (cw * h) / w;
  if (ch > img.height) {
    ch = img.height;
    cw = (ch * w) / h;
  }
  const x0 = (img.width - cw) / 2;
  const y0 = (img.height - ch) / 2;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let oy = 0; oy < h; oy++) {
    const ys = Math.floor(y0 + (oy * ch) / h);
    const ye = Math.max(ys + 1, Math.floor(y0 + ((oy + 1) * ch) / h));
    for (let ox = 0; ox < w; ox++) {
      const xs = Math.floor(x0 + (ox * cw) / w);
      const xe = Math.max(xs + 1, Math.floor(x0 + ((ox + 1) * cw) / w));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let y = ys; y < ye; y++) {
        for (let x = xs; x < xe; x++) {
          const o = (y * img.width + x) * 4;
          r += img.data[o]!;
          g += img.data[o + 1]!;
          b += img.data[o + 2]!;
          n++;
        }
      }
      const o = (oy * w + ox) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = 255;
    }
  }
  return out;
}

let encoderReady: Promise<unknown> | null = null;
const wasm = (globalThis as unknown as { WebAssembly: { compile(bytes: Uint8Array): Promise<unknown> } }).WebAssembly;
const initWithModule = initWebp as unknown as (module: unknown) => Promise<unknown>;

function ensureEncoder(): Promise<unknown> {
  encoderReady ??= (async () => {
    const require = createRequire(import.meta.url);
    const file = require.resolve("@jsquash/webp/codec/enc/webp_enc_simd.wasm");
    return initWithModule(await wasm.compile(readFileSync(file)));
  })();
  return encoderReady;
}

export async function buildWidgetPhotoDataUrl(buf: Buffer): Promise<string | null> {
  const img = decode(buf);
  if (!img || img.width < 1 || img.height < 1) return null;
  await ensureEncoder();
  for (const [w, h] of SIZES) {
    const data = cropAndShrink(img, w, h);
    for (const quality of QUALITIES) {
      const webp = await encodeWebp({ data, width: w, height: h, colorSpace: "srgb" } as never, { quality, method: 6 });
      const url = WIDGET_PHOTO_PREFIX + Buffer.from(webp).toString("base64");
      if (url.length <= WIDGET_PHOTO_MAX_CHARS) return url;
    }
  }
  return null;
}

const cache = new Map<string, string | null>();
const CACHE_MAX = 200;

export async function loadWidgetPhoto(photos: string[], uploadsDir: string): Promise<string | null> {
  const url = photos[0];
  if (!url) return null;
  const parsed = parseUploadUrl(url);
  if (!parsed) return null;
  if (cache.has(parsed.filename)) return cache.get(parsed.filename)!;
  const file = path.join(path.resolve(uploadsDir), parsed.filename);
  let photo: string | null;
  try {
    const stat = await fs.stat(file);
    photo = stat.size <= MAX_FILE_BYTES ? await buildWidgetPhotoDataUrl(await fs.readFile(file)) : null;
  } catch {
    return null;
  }
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(parsed.filename, photo);
  return photo;
}
