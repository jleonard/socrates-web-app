import { ProductInfo } from "~/types";
export const productKeys = ["day", "week"] as const;

export const products: Record<(typeof productKeys)[number], ProductInfo> = {
  day: { code: process.env.PRODUCT_DAY!, hours: 24 },
  week: { code: process.env.PRODUCT_WEEK!, hours: 168 },
};
