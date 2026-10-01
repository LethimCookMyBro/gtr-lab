import { Suspense, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEnvironment } from "@react-three/drei/core/useEnvironment";
import { EnvironmentBoundary } from "./EnvironmentBoundary";
import { StudioLighting } from "./StudioLighting";
import { environmentAsset } from "./sceneHelpers";
import type { StudioEnvironment } from "./types";

type Props = {
  environment: StudioEnvironment;
  reducedMotion: boolean;
  onFallback?: (message: string) => void;
  onReady: () => void;
};

export function RecoverableEnvironment({
  environment,
  reducedMotion,
  onFallback,
  onReady,
}: Props) {
  const width = useThree((state) => state.size.width);
  const fallback = (
    <StudioLighting environment="studio" reducedMotion={reducedMotion} />
  );
  function failed(_detail: string) {
    // Remove rejected cache entries before the user retries the normal environment control.
    for (const lowResolution of [false, true]) {
      const files = environmentAsset(environment, lowResolution);
      if (files) useEnvironment.clear({ files });
    }
    const name =
      environment === "forest"
        ? "Forest"
        : environment === "coast"
          ? "Coast"
          : "Selected";
    onFallback?.(
      `${name} lighting couldn’t load. Switched to Studio; the vehicle is still interactive. Select the environment again to retry.`,
    );
  }
  return (
    <EnvironmentBoundary
      key={`${environment}-${width < 768}`}
      onFailure={failed}
      fallback={
        <>
          {fallback}
          <EnvironmentRendered onReady={onReady} />
        </>
      }
    >
      <Suspense fallback={fallback}>
        <StudioLighting
          environment={environment}
          reducedMotion={reducedMotion}
        />
        <EnvironmentRendered onReady={onReady} />
      </Suspense>
    </EnvironmentBoundary>
  );
}

function EnvironmentRendered({ onReady }: { onReady: () => void }) {
  const frames = useRef(0);
  const reported = useRef(false);
  const invalidate = useThree((state) => state.invalidate);
  useFrame(() => {
    if (reported.current) return;
    if (++frames.current >= 2) {
      reported.current = true;
      onReady();
    } else invalidate();
  });
  return null;
}
