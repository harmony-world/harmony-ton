import { describe, expect, it } from "vitest";
import { parseUploadUrl } from "../services/upload-cleanup.js";

describe("parseUploadUrl", () => {
  it("parses valid upload URL", () => {
    const result = parseUploadUrl("/uploads/a1b2c3d4-e5f6-1a2b-9c8d-e7f6a5b4c3d2.jpg");
    expect(result).toEqual({
      filename: "a1b2c3d4-e5f6-1a2b-9c8d-e7f6a5b4c3d2.jpg",
      normalizedUrl: "/uploads/a1b2c3d4-e5f6-1a2b-9c8d-e7f6a5b4c3d2.jpg",
    });
  });

  it("accepts png extension", () => {
    const result = parseUploadUrl("/uploads/a1b2c3d4-e5f6-1a2b-9c8d-e7f6a5b4c3d2.png");
    expect(result?.filename).toBe("a1b2c3d4-e5f6-1a2b-9c8d-e7f6a5b4c3d2.png");
  });

  it("accepts jpeg extension", () => {
    const result = parseUploadUrl("/uploads/a1b2c3d4-e5f6-1a2b-9c8d-e7f6a5b4c3d2.jpeg");
    expect(result?.filename).toBe("a1b2c3d4-e5f6-1a2b-9c8d-e7f6a5b4c3d2.jpeg");
  });

  it("rejects non-upload prefix", () => {
    expect(parseUploadUrl("/images/a1b2c3d4-e5f6-1a2b-9c8d-e7f6a5b4c3d2.jpg")).toBeNull();
  });

  it("rejects path traversal", () => {
    expect(parseUploadUrl("/uploads/../etc/passwd")).toBeNull();
    expect(parseUploadUrl("/uploads/..%2Fetc%2Fpasswd")).toBeNull();
  });

  it("rejects query strings", () => {
    expect(parseUploadUrl("/uploads/a1b2c3d4-e5f6-1a2b-9c8d-e7f6a5b4c3d2.jpg?v=1")).toBeNull();
  });

  it("rejects hash fragments", () => {
    expect(parseUploadUrl("/uploads/a1b2c3d4-e5f6-1a2b-9c8d-e7f6a5b4c3d2.jpg#section")).toBeNull();
  });

  it("rejects non-UUID filenames", () => {
    expect(parseUploadUrl("/uploads/not-a-uuid.jpg")).toBeNull();
    expect(parseUploadUrl("/uploads/malicious.exe")).toBeNull();
  });

  it("rejects subdirectory traversal", () => {
    expect(parseUploadUrl("/uploads/subdir/a1b2c3d4-e5f6-1a2b-9c8d-e7f6a5b4c3d2.jpg")).toBeNull();
  });

  it("rejects backslash paths", () => {
    expect(parseUploadUrl("/uploads/foo\\bar.jpg")).toBeNull();
  });
});
