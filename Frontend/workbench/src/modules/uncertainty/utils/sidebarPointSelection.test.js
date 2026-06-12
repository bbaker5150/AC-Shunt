import { describe, expect, test } from "vitest";
import {
  findSidebarPointOccurrence,
  getSidebarPointRange,
  getVisibleSidebarPointOrder,
} from "./sidebarPointSelection";

const sidebarData = [
  {
    id: "area-1",
    uutGroups: [
      {
        id: "uut-1",
        rangeGroups: [
          {
            _id: "range-1",
            points: [{ id: "point-2" }, { id: "point-1" }],
          },
        ],
        uncategorizedPoints: [{ id: "point-other" }],
      },
      {
        id: "uut-2",
        rangeGroups: [
          {
            _id: "range-2",
            points: [{ id: "point-1" }, { id: "point-3" }],
          },
        ],
        uncategorizedPoints: [],
      },
    ],
    unassignedPoints: [{ id: "point-free" }],
  },
];

describe("getVisibleSidebarPointOrder", () => {
  test("matches visible expansion state and the active point sort", () => {
    const entries = getVisibleSidebarPointOrder(
      sidebarData,
      {
        expandedAreas: new Set(["area-1"]),
        expandedUuts: new Set(["uut-1"]),
        expandedRanges: new Set(["uut-1-range-1"]),
      },
      (points) => [...points].sort((a, b) => a.id.localeCompare(b.id)),
    );

    expect(entries).toEqual([
      { pointId: "point-1", contextUutId: "uut-1" },
      { pointId: "point-2", contextUutId: "uut-1" },
      { pointId: "point-other", contextUutId: "uut-1" },
      { pointId: "point-free", contextUutId: null },
    ]);
  });

  test("distinguishes the same point rendered under different UUTs", () => {
    const entries = getVisibleSidebarPointOrder(sidebarData, {
      expandedAreas: new Set(["area-1"]),
      expandedUuts: new Set(["uut-1", "uut-2"]),
      expandedRanges: new Set(["uut-1-range-1", "uut-2-range-2"]),
    });

    expect(findSidebarPointOccurrence(entries, "point-1", "uut-1")).toBe(1);
    expect(findSidebarPointOccurrence(entries, "point-1", "uut-2")).toBe(3);
    expect(
      getSidebarPointRange(
        entries,
        { pointId: "point-2", contextUutId: "uut-1" },
        { pointId: "point-3", contextUutId: "uut-2" },
      ),
    ).toEqual(["point-2", "point-1", "point-other", "point-3"]);
  });
});
