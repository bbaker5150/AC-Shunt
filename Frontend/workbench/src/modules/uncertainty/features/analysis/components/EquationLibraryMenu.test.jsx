import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import EquationLibraryMenu from "./EquationLibraryMenu";

describe("EquationLibraryMenu", () => {
  it("renders the metrology areas and their equations", () => {
    render(<EquationLibraryMenu onSelect={vi.fn()} />);
    expect(screen.getByText("Electrical")).toBeTruthy();
    expect(screen.getByText("Dimensional")).toBeTruthy();
    expect(screen.getByText("AC waveform")).toBeTruthy();
    expect(screen.getByText("V * Irms * cos(theta)")).toBeTruthy();
  });

  it("hands the full equation entry to onSelect", () => {
    const onSelect = vi.fn();
    render(<EquationLibraryMenu onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /AC real power/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    const selected = onSelect.mock.calls[0][0];
    expect(selected.expression).toBe("V * Irms * cos(theta)");
    expect(selected.variables).toEqual({
      V: "Voltage",
      Irms: "Current",
      theta: "Phase Angle",
    });
  });
});
