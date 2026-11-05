import { UsdcAmount } from "@kitty/shared";
import { z } from "zod";

export const Catalog = z.array(
  z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    items: z
      .array(
        z.object({
          id: z.string().min(1),
          title: z.string().min(1),
          location: z.string().min(1),
          unitPrice: UsdcAmount,
        }),
      )
      .min(1),
  }),
);
