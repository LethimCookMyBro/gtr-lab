import { useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useThree } from "@react-three/fiber";
import { Group } from "three";
import { configureStageLayers } from "./stageLayers";

/** Isolates floor, panorama and shadow receiver meshes from contact-shadow depth passes. */
export function StageGeometry({ children }: { children: ReactNode }) {
  const group = useRef<Group>(null);
  const camera = useThree((state) => state.camera);
  useLayoutEffect(() => {
    if (group.current) configureStageLayers(group.current, camera);
  });
  return <group ref={group}>{children}</group>;
}
