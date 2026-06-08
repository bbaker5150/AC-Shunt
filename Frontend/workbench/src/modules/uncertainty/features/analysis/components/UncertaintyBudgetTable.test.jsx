import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import UncertaintyBudgetTable from "./UncertaintyBudgetTable";

const renderDirectBudget = (overrides = {}) => {
  const props = {
    components: [
      {
        id: "measurement-equation",
        name: "Measurement Equation Uncertainty",
        sourcePointLabel: "Measurement Equation",
        type: "B",
        value: 1,
        unit: "in-oz",
        distribution: "Other (Std. Unc.)",
        isCore: true,
      },
    ],
    calcResults: {
      combined_uncertainty: 1,
      effective_dof: Infinity,
      k_value: 2,
      expanded_uncertainty: 2,
    },
    referencePoint: { name: "Torque", unit: "in-oz" },
    uncertaintyConfidence: 95,
    measurementType: "direct",
    hasTmde: true,
    onAddManualComponent: vi.fn(),
    onOpenRepeatability: vi.fn(),
    ...overrides,
  };

  render(<UncertaintyBudgetTable {...props} />);
  return props;
};

describe("UncertaintyBudgetTable direct budget actions", () => {
  it("keeps one Add action and Repeatability on the final budget table", () => {
    const props = renderDirectBudget();

    const addButtons = screen.getAllByTitle(
      "Add component to Torque Uncertainty Budget",
    );
    expect(addButtons).toHaveLength(1);

    fireEvent.click(addButtons[0]);
    expect(props.onAddManualComponent).toHaveBeenCalledOnce();
    expect(props.onAddManualComponent).toHaveBeenCalledWith(null);

    fireEvent.click(screen.getByTitle("Repeatability Calculator"));
    expect(props.onOpenRepeatability).toHaveBeenCalledOnce();
  });
});
