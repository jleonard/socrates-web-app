export const productKeys = ["day", "week"] as const;

export const products: Record<(typeof productKeys)[number], string> = {
  day: process.env.PRODUCT_DAY!,
  week: process.env.PRODUCT_WEEK!,
};
