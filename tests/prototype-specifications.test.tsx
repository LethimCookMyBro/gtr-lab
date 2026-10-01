// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ModelDetails } from "../src/components/configurator/ModelDetails";
import { getModel } from "../src/data/models";

afterEach(cleanup);

it("qualifies both prototype output figures next to their values", () => {
  render(<ModelDetails model={getModel("gtr50")!} />);
  const power = screen.getByText("Estimated power");
  const torque = screen.getByText("Estimated torque");
  expect(power.parentElement?.textContent).toContain("720PS");
  expect(torque.parentElement?.textContent).toContain("780Nm");
  expect(screen.getByText("2018 prototype specification")).toBeTruthy();
  expect(screen.getByText("One-off anniversary prototype")).toBeTruthy();
  expect(screen.queryByText("Limited-production coachbuilding")).toBeNull();
});

it("does not relabel verified road-car outputs as estimates", () => {
  render(<ModelDetails model={getModel("premium")!} />);
  expect(screen.getByText("Published power")).toBeTruthy();
  expect(screen.getByText("Published torque")).toBeTruthy();
  expect(screen.queryByText("Estimated power")).toBeNull();
});
