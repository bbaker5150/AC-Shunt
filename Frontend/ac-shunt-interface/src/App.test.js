import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  test('renders the main application header', () => {
    render(<App />);
    const headingElement = screen.getByText(/Calibration Platform/i);
    expect(headingElement).toBeInTheDocument();
  });
});
