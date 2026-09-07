import { describe, it, expect } from "vitest";
import { bogotaDate, cents, safeCsvCell } from "../lib/domain";
import {
  sha256,
  hmacBase64,
  equal,
  verifyWompi,
  seal,
  unseal,
} from "../lib/crypto";
describe("Money, dates and integration signatures", () => {
  it("uses Bogotá date across UTC midnight", () =>
    expect(bogotaDate("2026-09-07T02:00:00Z")).toBe("2026-09-06"));
  it("converts money to exact cents and rejects invalid amounts", () => {
    expect(cents("123.45")).toBe(12345);
    expect(() => cents("NaN")).toThrow();
  });
  it("neutralizes spreadsheet formulas", () => {
    expect(safeCsvCell('=HYPERLINK("x")')).toMatch(/^'/);
    expect(safeCsvCell("+SUM(1,2)")).toMatch(/^'/);
  });
  it("verifies Wompi protected fields and rejects modified amounts", async () => {
    const event = {
      data: {
        transaction: { id: "abc", status: "APPROVED", amount_in_cents: 23800 },
      },
      timestamp: 1788739200,
      signature: {
        properties: [
          "transaction.id",
          "transaction.status",
          "transaction.amount_in_cents",
        ],
        checksum: "",
      },
    };
    event.signature.checksum = await sha256("abcAPPROVED238001788739200secret");
    expect(await verifyWompi(event, "secret")).toBe(true);
    event.data.transaction.amount_in_cents = 1;
    expect(await verifyWompi(event, "secret")).toBe(false);
    event.signature.properties = ["transaction.id"];
    expect(await verifyWompi(event, "secret")).toBe(false);
  });
  it("signs raw webhook bodies and detects body changes", async () => {
    const a = await hmacBase64("secret", '{"id":1}');
    expect(equal(a, await hmacBase64("secret", '{"id":1}'))).toBe(true);
    expect(equal(a, await hmacBase64("secret", '{"id":2}'))).toBe(false);
  });
  it("encrypts connection secrets and detects ciphertext changes", async () => {
    const key = btoa("a".repeat(32));
    const cipher = await seal({ secret: "private" }, key);
    expect(cipher).not.toContain("private");
    expect(await unseal(cipher, key)).toEqual({ secret: "private" });
    await expect(unseal(cipher, btoa("b".repeat(32)))).rejects.toThrow();
  });
});
