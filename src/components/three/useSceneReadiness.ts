import { useCallback, useRef } from "react";

/** Loading is complete only once the actual model and selected lighting have rendered. */
export function useSceneReadiness(
  url: string,
  environment: string,
  onReady: () => void,
) {
  const state = useRef({
    url,
    environment,
    vehicle: false,
    lighting: false,
    reported: false,
  });
  const callback = useRef(onReady);
  callback.current = onReady;
  if (state.current.url !== url)
    state.current = {
      url,
      environment,
      vehicle: false,
      lighting: false,
      reported: false,
    };
  else if (state.current.environment !== environment)
    state.current = {
      ...state.current,
      environment,
      lighting: false,
      reported: false,
    };
  const publish = useCallback(() => {
    const current = state.current;
    if (current.vehicle && current.lighting && !current.reported) {
      current.reported = true;
      callback.current();
    }
  }, []);
  const onVehicleRendered = useCallback(() => {
    if (state.current.url !== url) return;
    state.current.vehicle = true;
    publish();
  }, [url, publish]);
  const onEnvironmentRendered = useCallback(() => {
    if (state.current.url !== url || state.current.environment !== environment)
      return;
    state.current.lighting = true;
    publish();
  }, [url, environment, publish]);
  return { onVehicleRendered, onEnvironmentRendered };
}
