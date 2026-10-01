import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { HomePage } from "../src/pages/HomePage";
import { ModelsPage } from "../src/pages/ModelsPage";
import { AudioProvider } from "../src/hooks/useAudio";
const render = (component: React.ReactNode) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <AudioProvider>{component}</AudioProvider>
    </MemoryRouter>,
  );
describe("experience routes", () => {
  it("introduces independent identity and model exploration", () => {
    const html = render(<HomePage />);
    expect(html).toContain("Engineered");
    expect(html).toContain("/models");
    expect(html).toContain("independent");
  });
  it("provides six unique model entry routes", () => {
    const html = render(<ModelsPage />);
    for (const id of ["premium", "nismo", "tspec", "gtr50", "gt3", "gt500"])
      expect(html).toContain("/configurator/" + id);
  });
});
