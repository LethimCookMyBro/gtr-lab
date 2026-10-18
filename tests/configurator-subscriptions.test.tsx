// @vitest-environment jsdom
import { Profiler } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useConfigurator } from "../src/stores/configurator";
import { CabinPreviewControls } from "../src/components/configurator/CabinPreviewControls";
const initial = useConfigurator.getState();
afterEach(() => {
  cleanup();
  useConfigurator.setState(initial, true);
});
function WholeStoreBaseline() {
  useConfigurator();
  return null;
}
it("avoids unrelated paint commits while retaining cabin updates in the same profiling environment", () => {
  const broad = vi.fn(),
    narrow = vi.fn();
  render(
    <>
      <Profiler id="baseline" onRender={broad}>
        <WholeStoreBaseline />
      </Profiler>
      <Profiler id="controls" onRender={narrow}>
        <CabinPreviewControls onExit={() => {}} reducedMotion={true} />
      </Profiler>
    </>,
  );
  broad.mockClear();
  narrow.mockClear();
  for (const selectedPaint of ["test-one", "test-two", "test-three"])
    act(() => useConfigurator.setState({ selectedPaint }));
  expect(broad).toHaveBeenCalledTimes(3);
  expect(narrow).not.toHaveBeenCalled();
  act(() => useConfigurator.setState({ cabin: { phase: "closed" } }));
  expect(narrow).toHaveBeenCalledTimes(1);
});
