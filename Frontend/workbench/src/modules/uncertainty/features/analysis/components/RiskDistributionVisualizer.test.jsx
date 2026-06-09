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
  gbResults: {
    GBLOW: 9.84,
    GBUP: 10.16,
    GBPFA: 0.48,
    GBPFR: 7.82,
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

test("switches between risk, guardband, and component views", () => {
  render(
    <RiskDistributionVisualizer
      results={results}
      calcResults={calcResults}
      onShowBreakdown={() => {}}
    />,
  );

  expect(screen.getByText("As specified")).toBeInTheDocument();
  expect(screen.getByText("1.248%")).toBeInTheDocument();

  // Limit values are always visible on the chart.
  expect(screen.getByText("9.8 V")).toBeInTheDocument();
  expect(screen.getByText("10.2 V")).toBeInTheDocument();

  // Acceptance markers are hidden while they coincide with the tolerance limits.
  expect(
    screen.queryByTestId("risk-limit-acceptance-lal"),
  ).not.toBeInTheDocument();

  fireEvent.click(screen.getByLabelText("Apply guardband"));
  expect(screen.getByText("Guardbanded")).toBeInTheDocument();
  expect(screen.getByText("0.48%")).toBeInTheDocument();
  expect(screen.getByText("Guardband acceptance width")).toBeInTheDocument();
  expect(screen.getByTestId("risk-limit-acceptance-gbl")).toBeInTheDocument();
  expect(screen.getByText("9.84 V")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Component View" }));
  expect(screen.getByLabelText("Budget component")).toHaveValue("final-reading");
  expect(screen.getByText("Rectangular")).toBeInTheDocument();
  expect(screen.getByText("Standard uncertainty")).toBeInTheDocument();
  expect(screen.getByText("0.012 V")).toBeInTheDocument();
  expect(
    screen.getByText("Rectangular (sqrt 3) - 1.7321"),
  ).toBeInTheDocument();
  expect(screen.getByTestId("component-limit-lower")).toHaveTextContent(
    "-0.020785 V",
  );
});
