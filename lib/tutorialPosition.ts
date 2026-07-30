export type TutorialVerticalSide = 'top' | 'bottom'

export function chooseTutorialVerticalSide(
  anchorTop: number,
  anchorBottom: number,
  viewportHeight: number,
): TutorialVerticalSide {
  const anchorCenter = anchorTop + Math.max(0, anchorBottom - anchorTop) / 2
  return anchorCenter < viewportHeight / 2 ? 'bottom' : 'top'
}
