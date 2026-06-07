export const getNextInstrumentSelection = (
  currentSelection,
  instrumentId,
  isMultiSelect = false,
) => {
  const selected = Array.isArray(currentSelection) ? currentSelection : [];

  if (selected.includes(instrumentId)) {
    return selected.filter((id) => id !== instrumentId);
  }

  return isMultiSelect ? [...selected, instrumentId] : [instrumentId];
};
