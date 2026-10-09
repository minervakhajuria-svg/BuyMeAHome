import { describe, expect, it } from "vitest";
import { BASE_WEIGHTS } from "./weights";

describe("base weights", () => {
  it("sum to 100", () => {
    expect(Object.values(BASE_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });
});
