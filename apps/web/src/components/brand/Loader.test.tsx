import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Loader } from "./Loader";

test("announces what is loading", () => {
  render(<Loader label="Loading trip" />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading trip");
});

test("falls back to a generic label", () => {
  render(<Loader />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading");
});
