import { describe, expect, it } from "vitest";
import * as math from "mathjs";
import { equationLibrary } from "./equationLibrary";

// Mirror of the equation editor's variable extraction (UncertaintyPanel
// handleEquationChange): a symbol that exists on the mathjs namespace is NOT
// treated as a variable, so a library entry using such a name (e.g. `phi`,
// the golden ratio) would silently lose that variable.
const extractEditorVariables = (expression) => {
  const node = math.parse(expression);
  const vars = new Set();
  node.traverse((n) => {
    if (
      n.isSymbolNode &&
      !math[n.name] &&
      !["e", "pi", "i"].includes(n.name.toLowerCase())
    ) {
      vars.add(n.name);
    }
  });
  return vars;
};

describe("equationLibrary", () => {
  it("has areas with uniquely named equations", () => {
    expect(equationLibrary.length).toBeGreaterThan(0);
    const names = equationLibrary.flatMap((a) =>
      a.equations.map((eq) => eq.name),
    );
    expect(new Set(names).size).toBe(names.length);
    equationLibrary.forEach((area) => {
      expect(area.area).toBeTruthy();
      expect(area.equations.length).toBeGreaterThan(0);
    });
  });

  equationLibrary.forEach((area) => {
    area.equations.forEach((equation) => {
      describe(`${area.area} / ${equation.name}`, () => {
        it("parses and its declared variables match the editor's extraction", () => {
          const extracted = extractEditorVariables(equation.expression);
          const declared = new Set(Object.keys(equation.variables));
          expect([...extracted].sort()).toEqual([...declared].sort());
          // Every variable has a non-empty suggested display name.
          Object.values(equation.variables).forEach((name) =>
            expect(String(name).trim().length).toBeGreaterThan(0),
          );
          expect(String(equation.description).trim().length).toBeGreaterThan(0);
        });

        it("is symbolically differentiable per variable (linear engine compatible)", () => {
          const node = math.parse(equation.expression);
          Object.keys(equation.variables).forEach((symbol) => {
            expect(() => math.derivative(node, symbol)).not.toThrow();
          });
        });
      });
    });
  });
});
