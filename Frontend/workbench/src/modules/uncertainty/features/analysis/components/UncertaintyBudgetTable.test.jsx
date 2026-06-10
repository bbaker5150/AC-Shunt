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

  it("uses empirical Monte Carlo values for the final budget totals", () => {
    renderDirectBudget({
      components: [
        {
          id: "measurement-equation",
          name: "Measurement Equation Uncertainty",
          sourcePointLabel: "Measurement Equation",
          type: "B",
          value: 1,
          unit: "V",
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
      referencePoint: { name: "Voltage", unit: "V" },
      propagationMode: "montecarlo",
      riskResults: {
        riskMethod: "empirical",
        pfa: 1.1,
        pfr: 2.2,
        tur: 4,
      },
      mcSummary: {
        meanBase: 10,
        uBase: 1.5,
        intervalLowBase: 7,
        intervalHighBase: 14,
      },
    });

    expect(
      screen.getAllByText("Monte Carlo", { selector: ".method-chip" }),
    ).toHaveLength(2);
    expect(screen.getByText("Empirical")).toBeInTheDocument();
    expect(screen.getByText("1.5000 V")).toBeInTheDocument();
    expect(screen.getByText("+4.0000 / -3.0000")).toBeInTheDocument();
    expect(
      screen.getByText(/Empirical shortest 95% coverage interval/),
    ).toBeInTheDocument();
  });
});
