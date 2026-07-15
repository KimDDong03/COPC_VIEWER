/**
 * Adaptive work limits protect interaction while the camera is moving. A
 * settled view deliberately omits them so its terminal LOD is determined only
 * by the configured quality ceiling and user hard cap.
 */
export function selectCameraStreamAdaptiveBudgetState<T extends object>(
  state: T,
  cameraMoveInProgress: boolean,
): T | undefined {
  return cameraMoveInProgress ? state : undefined;
}
