import { describe, expect, it } from "vitest";
import { prepareImportedSession } from "./useSessionManager";

describe("prepareImportedSession", () => {
  it("always creates a separate session without changing nested IDs", () => {
    const loadedSession = {
      id: 100,
      name: "Torque Session",
      measurementAreas: [{ id: "area-1", name: "Torque" }],
      uuts: [{ id: "uut-1", measurementAreaId: "area-1" }],
      testPoints: [
        {
          id: "point-1",
          measurementAreaId: "area-1",
          associatedUutIds: ["uut-1"],
        },
      ],
    };
    const existing = [
      { id: 100, name: "Torque Session" },
      { id: 500, name: "Torque Session (Imported)" },
    ];

    const imported = prepareImportedSession(loadedSession, existing, 500);

    expect(imported.id).toBe(501);
    expect(imported.name).toBe("Torque Session (Imported 2)");
    expect(imported.measurementAreas[0].id).toBe("area-1");
    expect(imported.uuts[0].id).toBe("uut-1");
    expect(imported.testPoints[0].id).toBe("point-1");
    expect(loadedSession).toMatchObject({
      id: 100,
      name: "Torque Session",
    });
  });
});
