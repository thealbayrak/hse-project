import { describe, expect, it } from "vitest";
import { audioExtension, isImageFile, sanitizeFileName } from "@/lib/media";

describe("audioExtension", () => {
  it("maps recorder MIME types to extensions", () => {
    expect(audioExtension("audio/mp4")).toBe("m4a");
    expect(audioExtension("audio/webm;codecs=opus")).toBe("webm");
    expect(audioExtension("audio/aac")).toBe("aac");
    expect(audioExtension("")).toBe("webm");
  });
});

describe("sanitizeFileName", () => {
  it("strips unsafe characters and caps the length", () => {
    expect(sanitizeFileName("Göteborg bild (1).JPG")).toBe("G_teborg_bild__1_.JPG");
    expect(sanitizeFileName("x".repeat(100)).length).toBe(80);
  });
});

describe("isImageFile", () => {
  it("accepts HEIC files Safari reports with an empty MIME type", () => {
    expect(isImageFile(new File([""], "IMG_0001.HEIC", { type: "" }))).toBe(true);
    expect(isImageFile(new File([""], "notes.txt", { type: "text/plain" }))).toBe(false);
    expect(isImageFile(new File([""], "blob", { type: "image/jpeg" }))).toBe(true);
  });
});
