import { act, renderHook, waitFor } from "@testing-library/react";
import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import useSessionManager, {
  prepareImportedSession,
} from "./useSessionManager";

vi.mock("axios", () => ({
  default: {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  axios.delete.mockResolvedValue({});
  axios.post.mockResolvedValue({});
  axios.put.mockResolvedValue({});
  axios.get.mockImplementation((url) =>
    Promise.resolve({
      data: url.endsWith("/sessions/")
        ? [
            {
              id: 1,
              name: "Original",
              testPoints: [],
            },
          ]
        : [],
    }),
  );
});

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

describe("session undo history", () => {
  it("restores the active session's previous snapshot", async () => {
    const { result } = renderHook(() => useSessionManager());

    await waitFor(() => {
      expect(result.current.currentSessionData?.name).toBe("Original");
    });

    act(() => {
      result.current.updateSession({
        ...result.current.currentSessionData,
        name: "Edited",
      });
    });
    expect(result.current.currentSessionData.name).toBe("Edited");

    let didUndo = false;
    act(() => {
      didUndo = result.current.undoLastSessionChange();
    });

    expect(didUndo).toBe(true);
    expect(result.current.currentSessionData.name).toBe("Original");
  });
});
