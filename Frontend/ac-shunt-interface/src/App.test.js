import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the main application header', () => {
  render(<App />);
  const headingElement = screen.getByText(/Calibration Platform/i);
  expect(headingElement).toBeInTheDocument();
});