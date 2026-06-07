import { describe, expect, it } from "vitest";
import {
  getRemainingCutPoints,
  preparePointForPaste,
} from "./pointClipboard";

const point = {
  id: "point-1",
  measurementAreaId: "area-1",
  associatedUutIds: ["uut-1"],
  uutTolerance: { max: 10 },
};

describe("preparePointForPaste", () => {
  it("removes the ID when copying a point", () => {
    expect(
      preparePointForPaste(point, {
        mode: "copy",
        targetUutId: "uut-2",
        targetAreaId: "area-2",
        targetTolerance: { max: 100 },
      }),
    ).toEqual({
      measurementAreaId: "area-2",
      associatedUutIds: ["uut-2"],
      uutTolerance: { max: 100 },
    });
  });

  it("preserves the ID when cutting a point", () => {
    expect(
      preparePointForPaste(point, {
        mode: "cut",
        targetUutId: "uut-2",
        targetAreaId: "area-2",
        targetTolerance: { max: 100 },
      }),
    ).toEqual({
      id: "point-1",
      measurementAreaId: "area-2",
      associatedUutIds: ["uut-2"],
      uutTolerance: { max: 100 },
    });
  });
});

describe("getRemainingCutPoints", () => {
  it("removes moved points while retaining rejected points", () => {
    const clipboard = [{ id: "point-1" }, { id: "point-2" }];

    expect(getRemainingCutPoints(clipboard, [{ id: "point-1" }])).toEqual([
      { id: "point-2" },
    ]);
  });
});
