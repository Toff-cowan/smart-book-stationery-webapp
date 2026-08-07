/** Shared grade tags for catalog filters and admin inventory. */

export const STANDARD_GRADES = [
  "K1",
  "K2",
  "K3",
  ...Array.from({ length: 11 }, (_, i) => `Grade ${i + 1}`),
] as const;

export type StandardGrade = (typeof STANDARD_GRADES)[number];
