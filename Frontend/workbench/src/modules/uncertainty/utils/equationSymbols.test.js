import { describe, expect, it } from "vitest";
import * as math from "mathjs";
import { symbolCategories } from "./equationSymbols";
import { validateEquation } from "./equationValidation";

// The f(x) menu must never offer something the engines can't handle: every
// function must exist in mathjs, every example must validate and evaluate,
// and the mcOnly flag must match the symbolic engine's actual capability —
// the tooltip promise ("Monte Carlo only") is enforced here, not assumed.

describe("equationSymbols catalog", () => {
  const allEntries = Object.entries(symbolCategories).flatMap(
    ([category, entries]) => entries.map((entry) => ({ category, ...entry })),
  );

  it("has entries in every category", () => {
    Object.values(symbolCategories).forEach((entries) => {
      expect(entries.length).toBeGreaterThan(0);
    });
  });

  allEntries
    .filter((entry) => entry.symbol.endsWith("()") && entry.symbol !== "()")
    .forEach((entry) => {
      describe(`${entry.category} / ${entry.symbol}`, () => {
        const fnName = entry.symbol.slice(0, -2);

        it("names a real mathjs function", () => {
          expect(typeof math[fnName]).toBe("function");
        });

        it("has an example that validates with no errors", () => {
          expect(entry.example).toBeTruthy();
          const result = validateEquation(entry.example);
          expect(result.status).toBe("ok");
          expect(result.error).toBeNull();
        });

        it(`is ${entry.mcOnly ? "NOT " : ""}symbolically differentiable, matching its mcOnly flag`, () => {
          const result = validateEquation(entry.example);
          if (entry.mcOnly) {
            expect(result.nonDifferentiable.length).toBeGreaterThan(0);
            // The tooltip must carry the Monte Carlo note.
            expect(entry.title).toMatch(/monte carlo/i);
          } else {
            expect(result.nonDifferentiable).toEqual([]);
          }
        });
      });
    });

  it("constants insert as mathjs constants, not variables", () => {
    const constants = symbolCategories.Constants;
    constants.forEach((entry) => {
      expect(math[entry.symbol]).toBeDefined();
      const result = validateEquation(entry.example);
      expect(result.status).toBe("ok");
      expect(result.variables).not.toContain(entry.symbol);
    });
  });

  it("offers no broken legacy symbols (ln, %, i, Infinity)", () => {
    const symbols = allEntries.map((entry) => entry.symbol);
    expect(symbols).not.toContain("ln()");
    expect(symbols).not.toContain("%");
    expect(symbols).not.toContain("i");
    expect(symbols).not.toContain("Infinity");
    // And the natural-log/base-10 labels are correct.
    const log = allEntries.find((entry) => entry.symbol === "log()");
    expect(log.title).toMatch(/natural/i);
    const log10 = allEntries.find((entry) => entry.symbol === "log10()");
    expect(log10.title).toMatch(/base 10/i);
  });
});
