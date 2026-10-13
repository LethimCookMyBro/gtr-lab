export interface LayoutRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface ProductionIdentity {
  sha256: string;
  files: Array<{ path: string; sha256: string }>;
}
export const FORMULA_E_SOURCE_TREE: string;
export const FORMULA_E_VIEWPORTS: ReadonlyArray<{
  name: string;
  width: number;
  height: number;
}>;
export function validateFormulaECI(
  env?: Record<string, string | undefined>,
): void;
export function assertFormulaESource(
  identity: unknown,
): asserts identity is ProductionIdentity;
export function assessNeutralLayout(input: {
  viewport: LayoutRectangle | null;
  frame: LayoutRectangle | null;
  labels: Array<LayoutRectangle | null>;
  obstacles?: Array<LayoutRectangle | null>;
}): string[];

export const FORMULA_E_SCENE_OBSTACLES: ReadonlyArray<string>;
export interface FormulaERuntimeEvidence {
  beginDocument(): void;
  sealDocument(): Promise<unknown>;
  finish(): Promise<unknown>;
  snapshot(): Record<string, unknown>;
  dispose(): void;
}
export function createFormulaERuntimeEvidence(
  page: Pick<import("@playwright/test").Page, "on" | "off">,
  options: {
    intendedAssets: Map<string, { bytes: number; sha256: string }>;
    window: {
      startedAt: number;
      deadline: number;
      budget: number;
      clock: "node-performance";
    };
    now?: () => number;
    setTimer?: (callback: () => void, delay: number) => unknown;
    clearTimer?: (id: unknown) => void;
  },
): FormulaERuntimeEvidence;
