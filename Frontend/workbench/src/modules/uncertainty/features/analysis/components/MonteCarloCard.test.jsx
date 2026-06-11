import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MonteCarloCard from "./MonteCarloCard";

// jsdom has no Worker, so useMonteCarlo falls back to the inline (synchronous)
// engine after its 400 ms debounce — these tests exercise the full real
// simulation path, just on the test thread.

const makeTmde = (variableType, value) => ({
  id: `tmde-${variableType}`,
  variableType,
  measurementPoint: { value, unit: "V" },
  floor: {
    high: 1,
    low: -1,
    unit: "V",
    symmetric: true,
    distribution: "1.7320508075688772",
  },
});

const baseProps = (overrides = {}) => ({
  testPointData: {
    id: "tp-1",
    equationString: "y = x",
    variableMappings: { x: "Length" },
    inputCorrelations: {},
    propagationMode: "montecarlo",
    ...overrides.testPointData,
  },
  tmdeTolerancesData: overrides.tmdeTolerancesData || [makeTmde("Length", 10)],
  manualComponents: [],
  uutNominal: { value: 10, unit: "V" },
  onUpdateTestPoint: overrides.onUpdateTestPoint || vi.fn(),
});

describe("MonteCarloCard", () => {
  it("runs the simulation and validates the linear budget on a linear equation", async () => {
    render(<MonteCarloCard {...baseProps()} />);
    expect(await screen.findByText(/Simulating/i)).toBeTruthy();

    await waitFor(
      () => expect(screen.getByTestId("mc-standard-uncertainty")).toBeTruthy(),
      { timeout: 10000 },
    );
    // u ≈ 1/√3 ≈ 0.5774 V from the ±1 V rectangular floor.
    const uText = screen.getByTestId("mc-standard-uncertainty").textContent;
    const uValue = parseFloat(uText);
    expect(Math.abs(uValue - 1 / Math.sqrt(3))).toBeLessThan(0.01);
    expect(screen.getByText(/Linear GUM validated/i)).toBeTruthy();
  }, 15000);

  it("declares Monte Carlo authoritative at a stationary point", async () => {
    render(
      <MonteCarloCard
        {...baseProps({
          testPointData: {
            equationString: "y = (x - 5)^2",
            variableMappings: { x: "Offset" },
          },
          tmdeTolerancesData: [makeTmde("Offset", 5)],
        })}
      />,
    );

    await waitFor(
      () => expect(screen.getByTestId("mc-standard-uncertainty")).toBeTruthy(),
      { timeout: 10000 },
    );
    expect(
      screen.getByText(/stationary point.*Monte Carlo values below are authoritative/i),
    ).toBeTruthy();
    // One-sided output: the simulated mean must sit above zero even though the
    // linear engine reports nothing at all here.
    const uValue = parseFloat(
      screen.getByTestId("mc-standard-uncertainty").textContent,
    );
    expect(uValue).toBeGreaterThan(0);
  }, 15000);

  it("switches the point back to linear propagation", async () => {
    const onUpdateTestPoint = vi.fn();
    render(<MonteCarloCard {...baseProps({ onUpdateTestPoint })} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Use linear \(GUM\) propagation/i }),
    );
    expect(onUpdateTestPoint).toHaveBeenCalledWith({
      propagationMode: "linear",
    });
  });

  it("persists a user-selected trial count", () => {
    const onUpdateTestPoint = vi.fn();
    render(<MonteCarloCard {...baseProps({ onUpdateTestPoint })} />);

    const select = screen.getByLabelText("Maximum Monte Carlo trials");
    // Default ceiling matches the engine default.
    expect(select).toHaveValue("400000");

    fireEvent.change(select, { target: { value: "100000" } });
    expect(onUpdateTestPoint).toHaveBeenCalledWith({ mcMaxSamples: 100000 });
  });

  it("reflects the point's persisted trial count", () => {
    render(
      <MonteCarloCard
        {...baseProps({ testPointData: { mcMaxSamples: 1000000 } })}
      />,
    );
    expect(screen.getByLabelText("Maximum Monte Carlo trials")).toHaveValue(
      "1000000",
    );
  });
});
