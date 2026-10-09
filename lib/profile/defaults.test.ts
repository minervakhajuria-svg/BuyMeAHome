import { describe, expect, it } from "vitest";
import { buyerProfile } from "@/lib/schemas";
import { mentionsProtectedAttribute } from "@/lib/guards";
import { resolveProfile } from "./defaults";

describe("resolveProfile", () => {
  it("lists every default used for an empty profile", () => {
    const { resolved, usedDefaults } = resolveProfile(buyerProfile.parse({}));
    expect(resolved.adults).toBe(2);
    expect(resolved.budget).toBeNull();
    expect(resolved.school).toBeNull();
    expect(resolved.khata).toBe("a_only");
    expect(resolved.reraWithOcCcRequired).toBe(true);
    expect(resolved.infrastructure.flood_history).toBe("nice_to_have");
    expect(usedDefaults.some((l) => l.includes("commute was not scored"))).toBe(true);
    expect(usedDefaults.some((l) => l.includes("no budget filter"))).toBe(true);
    expect(usedDefaults.some((l) => l.includes("Schools"))).toBe(false);
  });

  it("uses given answers and reports no defaults for them", () => {
    const { resolved, usedDefaults } = resolveProfile(
      buyerProfile.parse({
        household: { adults: 3, kidAges: [6], parentsLiving: true, pets: false },
        work: {
          workplaces: [{ who: "you", hub: "orr_bellandur" }],
          officeDaysPerWeek: 3,
          maxCommuteMinutes: 60,
          mode: "metro",
        },
        schools: { board: "CBSE", maxSchoolRunMinutes: 15 },
        budget: { allInBudget: { min: 12000000, max: 15000000 }, householdMonthlyIncome: 300000 },
        legal: { khata: "b_acceptable", reraWithOcCcRequired: false },
      }),
    );
    expect(resolved.adults).toBe(3);
    expect(resolved.workHubs).toEqual(["orr_bellandur"]);
    expect(resolved.school).toEqual({ board: "CBSE", maxRunMinutes: 15 });
    expect(resolved.budget).toEqual({ min: 12000000, max: 15000000 });
    expect(resolved.khata).toBe("b_acceptable");
    expect(usedDefaults.some((l) => l.startsWith("Household") || l.startsWith("Schools") || l.startsWith("Legal"))).toBe(false);
  });

  it("treats remote-only workplaces as no commute", () => {
    const { resolved } = resolveProfile(buyerProfile.parse({ work: { workplaces: [{ who: "you", hub: "remote" }] } }));
    expect(resolved.workHubs).toEqual([]);
  });
});

describe("mentionsProtectedAttribute", () => {
  it("flags caste and religion terms only", () => {
    expect(mentionsProtectedAttribute("No Brahmin neighbours")).toBe(true);
    expect(mentionsProtectedAttribute("want my own religion nearby")).toBe(true);
    expect(mentionsProtectedAttribute("no ground floor, no noisy bars")).toBe(false);
  });
});
