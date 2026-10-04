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
