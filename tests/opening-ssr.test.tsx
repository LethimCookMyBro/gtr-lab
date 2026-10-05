// @vitest-environment node
import { expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { OpeningMark } from "../src/components/home/OpeningMark";

it("renders pending modal markup safely without browser globals", () => {
  expect(typeof document).toBe("undefined");
  const markup = renderToString(
    <OpeningMark
      pending
      scene={{ phase: "module" }}
      heroReady={false}
      reducedMotion={false}
      onContinue={() => {}}
      onRetry={() => {}}
    />,
  );
  expect(markup).toContain('aria-modal="true"');
  expect(markup).toContain('data-state="loading"');
  expect(markup).toContain("Continue without 3D");
});
