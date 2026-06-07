import { describe, expect, it } from "vitest";
import { getNextInstrumentSelection } from "./instrumentSelection";

describe("getNextInstrumentSelection", () => {
  it("unselects an instrument when it is clicked again", () => {
    expect(getNextInstrumentSelection(["uut-1"], "uut-1")).toEqual([]);
    expect(getNextInstrumentSelection(["uut-1", "uut-2"], "uut-1")).toEqual([
      "uut-2",
    ]);
  });

  it("single-selects an unselected instrument on a plain click", () => {
    expect(getNextInstrumentSelection(["uut-1"], "uut-2")).toEqual(["uut-2"]);
  });

  it("adds an unselected instrument on a modified click", () => {
    expect(
      getNextInstrumentSelection(["uut-1"], "uut-2", true),
    ).toEqual(["uut-1", "uut-2"]);
  });
});
