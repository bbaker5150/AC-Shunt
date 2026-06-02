import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import UncertaintyApp from "./UncertaintyApp";

describe("UncertaintyApp", () => {
  test("renders the module placeholder", () => {
    render(
      <MemoryRouter>
        <UncertaintyApp />
      </MemoryRouter>
    );
    expect(screen.getByText(/Uncertainty Budget/i)).toBeInTheDocument();
    expect(screen.getByText(/Coming soon/i)).toBeInTheDocument();
  });
});
