// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it } from "vitest";
import { RearSignature } from "../src/components/home/RearSignature";
afterEach(() => {
  cleanup();
  localStorage.clear();
});
it("keeps the compact Sound and Credits controls inside the rear stage without a separate band", () => {
  const { container } = render(
    <MemoryRouter>
      <RearSignature disabled />
    </MemoryRouter>,
  );
  expect(screen.getByRole("button", { name: "Sound on" })).toBeTruthy();
  const section = container.querySelector(".home-signature-runway")!;
  const audio = container.querySelector(".r35-section-sound")!;
  expect(section.contains(audio)).toBe(true);
  expect(container.querySelector(".home-signature-sound")).toBeNull();
  expect(container.querySelector(".r35-sound-preview")).toBeNull();
  expect(
    screen
      .getByRole("link", { name: "Credits for the R35 recording" })
      .getAttribute("href"),
  ).toBe("/audio/ATTRIBUTION.txt");
  expect(audio.getAttribute("data-audio-phase")).toBe("idle");
});
it("does not treat short-height visual reduced motion as an OS sound preference", () => {
  render(
    <MemoryRouter>
      <RearSignature disabled reducedMotion audioReducedMotion={false} />
    </MemoryRouter>,
  );
  expect(screen.getByRole("button", { name: "Sound on" })).toBeTruthy();
});
it("requires a Sound opt-in for the real OS reduced-motion preference", () => {
  render(
    <MemoryRouter>
      <RearSignature disabled audioReducedMotion />
    </MemoryRouter>,
  );
  expect(screen.getByRole("button", { name: "Sound off" })).toBeTruthy();
});
