// Shared catalog for the equation editor's f(x) symbol menu (UncertaintyPanel
// and AddTestPointModal render the same data).
//
// Every entry is verified against the real engines by equationSymbols.test.js:
//   - `example` must parse, validate, and evaluate numerically;
//   - `mcOnly: false` entries must be symbolically differentiable (work in the
//     first-order GUM budget);
//   - `mcOnly: true` entries are evaluable but NOT differentiable — they only
//     work with Monte Carlo propagation, and their tooltip says so. The
//     editor's live validation shows the same message after insertion.
//
// History note: this replaces per-file lists that offered `ln()` (not a mathjs
// function — inserting it produced an invalid equation) and labeled `log()`
// as base-10 (mathjs `log(x)` is the NATURAL log; base 10 is `log10`).

const MC_NOTE = " — not symbolically differentiable: Monte Carlo propagation only";

export const symbolCategories = {
  Operators: [
    { symbol: "+", title: "Add" },
    { symbol: "-", title: "Subtract" },
    { symbol: "*", title: "Multiply" },
    { symbol: "/", title: "Divide" },
    { symbol: "^", title: "Power (x^y)" },
    { symbol: "()", title: "Parentheses" },
  ],
  "Powers & Roots": [
    { symbol: "sqrt()", title: "Square root", example: "sqrt(x)" },
    { symbol: "cbrt()", title: "Cube root", example: "cbrt(x)" },
    {
      symbol: "nthRoot()",
      title: "n-th root: nthRoot(value, n)",
      example: "nthRoot(x, 3)",
    },
    { symbol: "abs()", title: "Absolute value", example: "abs(x)" },
  ],
  "Exponential & Logarithm": [
    { symbol: "exp()", title: "Exponential e^x", example: "exp(x)" },
    { symbol: "log()", title: "Natural log (ln)", example: "log(x)" },
    { symbol: "log10()", title: "Log base 10", example: "log10(x)" },
    {
      symbol: "log2()",
      title: `Log base 2${MC_NOTE}`,
      example: "log2(x)",
      mcOnly: true,
    },
  ],
  Trigonometry: [
    { symbol: "sin()", title: "Sine", example: "sin(x)" },
    { symbol: "cos()", title: "Cosine", example: "cos(x)" },
    { symbol: "tan()", title: "Tangent", example: "tan(x)" },
    { symbol: "asin()", title: "Arcsine", example: "asin(x)" },
    { symbol: "acos()", title: "Arccosine", example: "acos(x)" },
    { symbol: "atan()", title: "Arctangent", example: "atan(x)" },
    {
      symbol: "atan2()",
      title: `Two-argument arctangent: atan2(y, x)${MC_NOTE}`,
      example: "atan2(x, y)",
      mcOnly: true,
    },
    { symbol: "sec()", title: "Secant", example: "sec(x)" },
    { symbol: "csc()", title: "Cosecant", example: "csc(x)" },
    { symbol: "cot()", title: "Cotangent", example: "cot(x)" },
  ],
  Hyperbolic: [
    { symbol: "sinh()", title: "Hyperbolic sine", example: "sinh(x)" },
    { symbol: "cosh()", title: "Hyperbolic cosine", example: "cosh(x)" },
    { symbol: "tanh()", title: "Hyperbolic tangent", example: "tanh(x)" },
    { symbol: "asinh()", title: "Inverse hyperbolic sine", example: "asinh(x)" },
    {
      symbol: "acosh()",
      title: "Inverse hyperbolic cosine (x ≥ 1)",
      example: "acosh(x)",
    },
    {
      symbol: "atanh()",
      title: "Inverse hyperbolic tangent (|x| < 1)",
      example: "atanh(x)",
    },
  ],
  "Discrete / Selection (Monte Carlo only)": [
    {
      symbol: "min()",
      title: `Minimum of arguments${MC_NOTE}`,
      example: "min(x, y)",
      mcOnly: true,
    },
    {
      symbol: "max()",
      title: `Maximum of arguments${MC_NOTE}`,
      example: "max(x, y)",
      mcOnly: true,
    },
    {
      symbol: "hypot()",
      title: `Euclidean norm sqrt(x² + y²)${MC_NOTE}`,
      example: "hypot(x, y)",
      mcOnly: true,
    },
    {
      symbol: "mod()",
      title: `Modulo (remainder)${MC_NOTE}`,
      example: "mod(x, y)",
      mcOnly: true,
    },
    {
      symbol: "round()",
      title: `Round to nearest integer${MC_NOTE}`,
      example: "round(x)",
      mcOnly: true,
    },
    {
      symbol: "floor()",
      title: `Round down${MC_NOTE}`,
      example: "floor(x)",
      mcOnly: true,
    },
    {
      symbol: "ceil()",
      title: `Round up${MC_NOTE}`,
      example: "ceil(x)",
      mcOnly: true,
    },
    {
      symbol: "sign()",
      title: `Sign (−1, 0, +1)${MC_NOTE}`,
      example: "sign(x)",
      mcOnly: true,
    },
  ],
  Constants: [
    { symbol: "pi", title: "Pi (3.14159…)", example: "2 * pi" },
    { symbol: "e", title: "Euler's number (2.71828…)", example: "e^x" },
  ],
};
