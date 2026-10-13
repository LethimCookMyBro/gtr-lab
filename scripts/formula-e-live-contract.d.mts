export const FORMULA_E_LIVE_ORIGIN: string;
export const FORMULA_E_LIVE_REQUEST: string;
export interface FormulaELiveRequest {
  version: 1;
  allow: true;
  origin: string;
  expectedDeployedCommit: string;
  railwayDeploymentId: string;
  sourceTree: string;
  sourceFiles: 103;
  buildSha256: string;
}
export interface FormulaEBuild {
  sha256: string;
  files: Array<{ path: string; bytes: number; sha256: string }>;
}
export function validateFormulaELiveCI(
  env?: Record<string, string | undefined>,
): void;
export function validateFormulaELiveRequest(
  value: unknown,
): Readonly<FormulaELiveRequest>;
export function loadFormulaELiveRequest(
  env?: Record<string, string | undefined>,
): Promise<Readonly<FormulaELiveRequest>>;
export function readFormulaEAssets(
  directory?: string,
): Promise<Map<string, { bytes: number; sha256: string }>>;
export function formulaEBuildIdentity(
  assets: Map<string, { bytes: number; sha256: string }>,
): FormulaEBuild;
export function assertFormulaELiveBuild(
  request: FormulaELiveRequest,
  assets: Map<string, { bytes: number; sha256: string }>,
): FormulaEBuild;
export function verifyFormulaELiveCheckout(
  env?: Record<string, string | undefined>,
): Promise<{
  request: Readonly<FormulaELiveRequest>;
  harnessCommit: string;
  source: import("./formula-e-layout-contract.mjs").ProductionIdentity;
}>;
