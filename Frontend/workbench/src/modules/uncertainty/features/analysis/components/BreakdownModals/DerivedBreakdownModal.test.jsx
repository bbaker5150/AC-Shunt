import { render, screen } from "@testing-library/react";
import DerivedBreakdownModal from "./DerivedBreakdownModal";

// y = x² at x = 1 V with a ±1 V rectangular floor (u = 1/√3): the classic
// nonlinear case where the ½f″u² Taylor term is ~29% of the first-order
// contribution. The budget components mirror what useUncertaintyCalculation
// builds from calculateDerivedUncertainty's breakdown.
const RECT = "1.7320508075688772";

const makeBreakdownData = (overrides = {}) => ({
  equationString: "y = x^2",
  derivedNominalPoint: { value: 1, unit: "V" },
  tmdeTolerances: [
    {
      name: "Source",
      variableType: "Length",
      quantity: 1,
      measurementPoint: { value: 1, unit: "V" },
      floor: {
        high: 1,
        low: -1,
        unit: "V",
        symmetric: true,
        distribution: RECT,
      },
    },
  ],
  results: {
    calculatedNominalValue: 1,
    calculatedBudgetComponents: [
      {
        id: "derived_x_0",
        name: "Input: Length (x)",
        sensitivityCoefficient: 2,
        derivativeString: "2 * x",
        contribution: 2 / Math.sqrt(3),
        sourcePointLabel: "1 V",
        nonlinearityWarning:
          "Input 'x' (Length): the second-order Taylor term is ~29% of its first-order contribution at this operating point.",
        secondDerivativeString: "2",
        secondDerivativeValue: 2,
        secondOrderContribution: 1 / 3,
        secondOrderShift: 1 / 3,
        ...overrides.component,
      },
    ],
  },
});

test("renders the per-input 2nd-order term and the Taylor-series summary", () => {
  render(
    <DerivedBreakdownModal
      isOpen
      onClose={() => {}}
      breakdownData={makeBreakdownData()}
    />,
  );

  // Per-input second-order block.
  expect(screen.getByText(/2nd-Order Taylor Term/)).toBeInTheDocument();
  // Aggregate summary section with corrected u and mean shift.
  expect(
    screen.getByText("2nd-Order Taylor Series (Nonlinearity Correction)"),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/shift the expected result away from/),
  ).toBeInTheDocument();
  // The Layer-1 warning still shows.
  expect(screen.getByText(/second-order Taylor term is ~29%/)).toBeInTheDocument();
});

test("omits the 2nd-order sections for a linear equation", () => {
  const data = makeBreakdownData({
    component: {
      derivativeString: "1",
      sensitivityCoefficient: 1,
      nonlinearityWarning: null,
      secondDerivativeString: null,
      secondDerivativeValue: null,
      secondOrderContribution: 0,
      secondOrderShift: 0,
    },
  });
  data.equationString = "y = x";

  render(<DerivedBreakdownModal isOpen onClose={() => {}} breakdownData={data} />);

  expect(screen.queryByText(/2nd-Order Taylor Term/)).not.toBeInTheDocument();
  expect(
    screen.queryByText("2nd-Order Taylor Series (Nonlinearity Correction)"),
  ).not.toBeInTheDocument();
});
