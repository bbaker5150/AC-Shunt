import { describe, test, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// The analysis tree transitively imports the full Plotly bundle; stub it so the
// jsdom smoke test doesn't load it. (Charts only render once a point is
// selected, which this no-backend test never reaches.)
vi.mock("plotly.js-dist", () => ({ default: {} }));

// No Django backend in unit tests: make the session store resolve into an
// empty state instead of hitting the network.
vi.mock("axios", () => {
  const ok = (data) => () => Promise.resolve({ data });
  return {
    default: {
      get: vi.fn(ok([])),
      post: vi.fn(ok({})),
      put: vi.fn(ok({})),
      delete: vi.fn(ok({})),
    },
  };
});

import UncertaintyApp from "./UncertaintyApp";
import { ThemeProvider } from "../../shared/ThemeContext";
import { NotificationProvider } from "../../shared/NotificationContext";

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    });
  }
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

describe("UncertaintyApp", () => {
  test("mounts the ported Uncertalytics app under the workbench shell", async () => {
    render(
      <ThemeProvider>
        <NotificationProvider>
          <MemoryRouter>
            <UncertaintyApp />
          </MemoryRouter>
        </NotificationProvider>
      </ThemeProvider>
    );

    // The ac-shunt-style chrome brand subtitle renders immediately.
    expect(
      await screen.findByText(/Uncertainty & Risk/i)
    ).toBeInTheDocument();
    // With no backend sessions, the empty-state placeholder is shown.
    expect(screen.getByText(/No Session Available/i)).toBeInTheDocument();
  });
});
