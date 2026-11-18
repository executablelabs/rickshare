import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { ApprovalProduct, HeroProduct } from "./ProductPreview";

test("both sample tickets show the same fixed Goa time instead of browser-local time", () => {
  render(
    <>
      <HeroProduct />
      <ApprovalProduct />
    </>,
  );

  for (const name of ["Example trip", "Interactive example of approving your share"]) {
    const preview = screen.getByRole("figure", { name });
    expect(within(preview).getByText("Dec 12, 10:00 AM (Goa time)")).toBeInTheDocument();
  }
});
