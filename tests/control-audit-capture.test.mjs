import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import * as audit from "../scripts/diagnose-configurator-controls.mjs";

const screenshotTimeout = () =>
  Object.assign(
    new Error(
      "page.screenshot: Timeout 45000ms exceeded.\nCall log:\n  - taking page screenshot\n  - waiting for fonts to load...\n  - fonts loaded\n",
    ),
    { name: "TimeoutError" },
  );

describe("bounded control audit screenshot recovery", () => {
  it("returns the first capture unchanged without recording a retry", async () => {
    const pixels = Buffer.from("actual canvas pixels");
    const capture = vi.fn().mockResolvedValue(pixels);
    const onRetry = vi.fn();
    expect(await audit.captureWithTimeoutRetry(capture, onRetry)).toBe(pixels);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("records exactly one screenshot timeout before retrying the same capture", async () => {
    const firstError = screenshotTimeout();
    const pixels = Buffer.from("actual retry pixels");
    const events = [];
    const capture = vi
      .fn()
      .mockImplementationOnce(async () => {
        events.push("first capture");
        throw firstError;
      })
      .mockImplementationOnce(async () => {
        events.push("same-state capture");
        return pixels;
      });
    const onRetry = vi.fn(async (error) => {
      expect(error).toBe(firstError);
      events.push("persist retry");
    });
    expect(await audit.captureWithTimeoutRetry(capture, onRetry)).toBe(pixels);
    expect(events).toEqual([
      "first capture",
      "persist retry",
      "same-state capture",
    ]);
    expect(capture).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("fails after a second screenshot timeout without a third attempt", async () => {
    const firstError = screenshotTimeout();
    const finalError = screenshotTimeout();
    const capture = vi
      .fn()
      .mockRejectedValueOnce(firstError)
      .mockRejectedValueOnce(finalError);
    const onRetry = vi.fn();
    await expect(audit.captureWithTimeoutRetry(capture, onRetry)).rejects.toBe(
      finalError,
    );
    expect(capture).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it.each([
    new Error("page.screenshot: browser has been closed"),
    new Error("page.screenshot: Timeout 45000ms exceeded."),
    Object.assign(new Error("locator.click: Timeout 45000ms exceeded."), {
      name: "TimeoutError",
    }),
    Object.assign(
      new Error("page.waitForFunction: Timeout 15000ms exceeded."),
      { name: "TimeoutError" },
    ),
  ])(
    "does not retry a non-screenshot timeout or another error: %s",
    async (error) => {
      const capture = vi.fn().mockRejectedValue(error);
      const onRetry = vi.fn();
      await expect(
        audit.captureWithTimeoutRetry(capture, onRetry),
      ).rejects.toBe(error);
      expect(capture).toHaveBeenCalledTimes(1);
      expect(onRetry).not.toHaveBeenCalled();
    },
  );

  it("does not hide a failed retry-report write", async () => {
    const capture = vi.fn().mockRejectedValue(screenshotTimeout());
    const reportError = new Error("report write failed");
    await expect(
      audit.captureWithTimeoutRetry(capture, async () => {
        throw reportError;
      }),
    ).rejects.toBe(reportError);
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("keeps real rotation and stopping ahead of the after-image and pixel assertion", async () => {
    const source = await readFile(
      new URL("../scripts/diagnose-configurator-controls.mjs", import.meta.url),
      "utf8",
    );
    const flow = source.slice(
      source.indexOf("await check('Rotate on, visible movement, and stop'"),
      source.indexOf("await check('Sound is an opt-in interface cue'"),
    );
    expect(flow).toMatch(
      /shot\('rotate-before'\)[\s\S]*reducedMotion: 'no-preference'[\s\S]*button\.click\(\)[\s\S]*'aria-pressed'\), 'true'[\s\S]*requestAnimationFrame[\s\S]*button\.click\(\{ timeout: 60000 \}\)[\s\S]*'aria-pressed'\), 'false'[\s\S]*shot\('rotate-after'\)[\s\S]*assert\.notEqual\(after, before\)/,
    );
  });
});

const cabinPreviewLabel = 'Cabin preview · work in progress';
const cabinDisclosure = 'An original authored cabin, still in progress. Choosing the preview downloads a separate 18.8 MB model. Not a verified factory interior.';

function cabinDrawerFixture({ disabled = false, disclosure = cabinDisclosure, eagerDownload = false, lateDownload = false, screenshotError } = {}) {
  const cabinRequests = [];
  const state = { open: false };
  const preview = {
    isDisabled: async () => disabled,
    getAttribute: async name => name === 'aria-describedby' ? 'cabin-preview-note' : null,
    click: vi.fn(() => { throw new Error('The availability audit must never select the cabin'); }),
  };
  const page = {
    getByRole: role => {
      expect(role).toBe('dialog');
      return {
        getByRole: (role, options) => {
          if (role !== 'button' || options.name !== cabinPreviewLabel || options.exact !== true) {
            throw new Error('No obsolete Interior button exists in the Premium camera drawer');
          }
          return preview;
        },
        locator: selector => {
          expect(selector).toBe('#cabin-preview-note');
          return { innerText: async () => disclosure };
        },
      };
    },
    screenshot: vi.fn(async () => {
      if (screenshotError) throw screenshotError;
      if (lateDownload) cabinRequests.push('/models/r35-cabin-realism-0b72bab4.glb');
    }),
  };
  const open = vi.fn(async label => {
    expect(label).toBe('Camera'); state.open = true;
    if (eagerDownload) cabinRequests.push('/models/r35-cabin-realism-0b72bab4.glb');
  });
  const close = vi.fn(async () => { state.open = false; });
  return { page, open, close, cabinRequests, screenshotPath: 'cabin-preview-available.png', state, preview };
}

describe('production control audit cabin availability', () => {
  it('accepts the enabled WIP opt-in, checks disclosure and closes without entering', async () => {
    const fixture = cabinDrawerFixture();
    await expect(audit.auditCabinPreviewAvailability(fixture)).resolves.toMatchObject({
      available: true, optIn: true, explanation: cabinDisclosure, cabinRequests: [],
    });
    expect(fixture.preview.click).not.toHaveBeenCalled();
    expect(fixture.page.screenshot).toHaveBeenCalledWith({ path: fixture.screenshotPath });
    expect(fixture.close).toHaveBeenCalledOnce();
    expect(fixture.state.open).toBe(false);
  });

  it.each([
    ['disabled opt-in', { disabled: true }],
    ['missing factory limitation', { disclosure: 'Original authored cabin, still in progress. Separate 18.8 MB model.' }],
    ['eager cabin request when Camera opens', { eagerDownload: true }],
    ['cabin request while the availability screenshot is captured', { lateDownload: true }],
  ])('rejects %s and still closes the drawer', async (_label, options) => {
    const fixture = cabinDrawerFixture(options);
    await expect(audit.auditCabinPreviewAvailability(fixture)).rejects.toThrow();
    expect(fixture.close).toHaveBeenCalledOnce();
    expect(fixture.state.open).toBe(false);
    expect(fixture.preview.click).not.toHaveBeenCalled();
  });

  it('closes the drawer when screenshot capture fails', async () => {
    const screenshotError = new Error('screenshot readback failed');
    const fixture = cabinDrawerFixture({ screenshotError });
    await expect(audit.auditCabinPreviewAvailability(fixture)).rejects.toBe(screenshotError);
    expect(fixture.close).toHaveBeenCalledOnce();
    expect(fixture.state.open).toBe(false);
  });
});
