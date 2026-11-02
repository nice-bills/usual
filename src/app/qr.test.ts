import jsQR from "jsqr";
import qrcode from "qrcode-generator";
import { describe, expect, it } from "vitest";
import { addressIn } from "./qr";

const address = `0x${"ab".repeat(32)}`;

describe("reading a wallet QR", () => {
  it("finds the address, bare or in a link", () => {
    expect(addressIn(address)).toBe(address);
    expect(addressIn(`sui:${address}?amount=5`)).toBe(address);
  });
  it("ignores anything else", () => {
    expect(addressIn("https://example.com")).toBeNull();
    expect(addressIn("0x1234")).toBeNull();
  });
  it("decodes the QR Usual itself shows for adding money", () => {
    const qr = qrcode(0, "M");
    qr.addData(address);
    qr.make();
    const scale = 4;
    const quiet = 4;
    const size = (qr.getModuleCount() + quiet * 2) * scale;
    const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const row = Math.floor(y / scale) - quiet;
      const col = Math.floor(x / scale) - quiet;
      if (row < 0 || col < 0 || row >= qr.getModuleCount() || col >= qr.getModuleCount() || !qr.isDark(row, col)) continue;
      pixels.fill(0, (y * size + x) * 4, (y * size + x) * 4 + 3);
    }
    expect(addressIn(jsQR(pixels, size, size)?.data ?? "")).toBe(address);
  });
});
