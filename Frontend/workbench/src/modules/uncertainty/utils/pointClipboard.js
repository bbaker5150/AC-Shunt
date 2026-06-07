export const preparePointForPaste = (
  point,
  { mode, targetUutId, targetAreaId, targetTolerance },
) => {
  const preparedPoint = {
    ...point,
    measurementAreaId: targetAreaId,
    associatedUutIds: [targetUutId],
    uutTolerance: targetTolerance,
  };

  if (mode === "copy") {
    delete preparedPoint.id;
  }

  return preparedPoint;
};

export const getRemainingCutPoints = (clipboardPoints, movedPoints) => {
  const movedIds = new Set((movedPoints || []).map((point) => point.id));
  return (clipboardPoints || []).filter((point) => !movedIds.has(point.id));
};
