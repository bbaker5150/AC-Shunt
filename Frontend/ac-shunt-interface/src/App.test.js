import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the main application header', () => {
  render(<App />);
  const headingElement = screen.getByText(/AC Shunt Calibration/i);
  expect(headingElement).toBeInTheDocument();
});