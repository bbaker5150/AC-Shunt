import { fireEvent, render, screen } from "@testing-library/react";
import RiskDistributionVisualizer from "./RiskDistributionVisualizer";

const results = {
  nativeUnit: "V",
  nominalValue: 10,
  LLow: 9.8,
  LUp: 10.2,
  ALow: 9.8,
  AUp: 10.2,
  uUUT: 0.065,
  uCal: 0.021,
  uDev: 0.0683,
  expandedUncertainty: 0.042,
  pfa: 1.248,
  pfr: 3.672,
  pfa_term1: 0.624,
  pfa_term2: 0.624,
  pfr_term1: 1.836,
  pfr_term2: 1.836,
  gbResults: {
    GBLOW: 9.84,
    GBUP: 10.16,
    GBPFA: 0.48,
    GBPFR: 7.82,
    GBPFAT1: 0.24,
    GBPFAT2: 0.24,
    GBPFRT1: 3.91,
    GBPFRT2: 3.91,
  },
};

const calcResults = {
  calculatedBudgetGroups: [
    {
      id: "final",
      unit: "V",
      components: [
        {
          id: "reading",
          name: "Reading Accuracy",
          sourcePointLabel: "10 V range",
          distribution: "Rectangular",
          distributionDivisor: Math.sqrt(3),
          contribution: 0.012,
          type: "B",
        },
      ],
    },
  ],
};

test("switches between decision, guardband, and component views", () => {
  render(
    <RiskDistributionVisualizer
      results={results}
      calcResults={calcResults}
      onShowBreakdown={() => {}}
    />,
  );

  expect(screen.getByText("As specified")).toBeInTheDocument();
  expect(screen.getByText("1.248%")).toBeInTheDocument();

  fireEvent.click(screen.getByLabelText("Apply guardband"));
  expect(screen.getByText("Guardbanded")).toBeInTheDocument();
  expect(screen.getByText("0.48%")).toBeInTheDocument();
  expect(screen.getByText("Guardband acceptance width")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "3σ" }));
  expect(screen.getByText(/99.73% expected coverage/)).toBeInTheDocument();
  expect(screen.getByText("Extends beyond acceptance")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  expect(screen.getByText("135%")).toBeInTheDocument();

  fireEvent.mouseEnter(screen.getByTestId("risk-limit-tolerance-ltl"));
  expect(screen.getByText("9.8 V")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Component View" }));
  expect(screen.getByLabelText("Budget component")).toHaveValue("final-reading");
  expect(screen.getAllByText("Rectangular")).toHaveLength(2);
  expect(screen.getByText("Standard uncertainty")).toBeInTheDocument();
  expect(
    screen.getByText("Rectangular (sqrt 3) - 1.7321"),
  ).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Comparison distribution"), {
    target: { value: "triangular" },
  });
  expect(screen.getByText("Triangular (sqrt 6) - 2.4495")).toBeInTheDocument();
  expect(screen.getByText("0.0084853 V")).toBeInTheDocument();

  fireEvent.mouseEnter(screen.getByTestId("component-limit-lower"));
  expect(screen.getByText("-0.02078461 V")).toBeInTheDocument();
});
