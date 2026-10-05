// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it } from "vitest";
import { RearSignature } from "../src/components/home/RearSignature";
afterEach(cleanup);
it("offers intentional listening in a separate band after the rear stage", () => {
  const { container } = render(
    <MemoryRouter>
      <RearSignature disabled />
    </MemoryRouter>,
  );
  expect(screen.getByRole("button", { name: "Hear the R35" })).toBeTruthy();
  const section = container.querySelector(".home-signature-runway")!;
  const audio = container.querySelector(".home-signature-sound")!;
  expect(section.contains(audio)).toBe(false);
  expect(
    section.compareDocumentPosition(audio) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(audio.getAttribute("data-audio-phase")).toBe("idle");
});
