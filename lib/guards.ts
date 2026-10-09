/**
 * The product never filters or scores by caste, religion or community. Free text (Q10) is a
 * dealbreaker note only. This guard flags such terms so the intake can decline them and the
 * scoring code can ignore them.
 */
const PROTECTED_TERMS = [
  "caste",
  "religion",
  "religious",
  "community only",
  "hindu",
  "muslim",
  "christian",
  "sikh",
  "jain",
  "buddhist",
  "brahmin",
  "lingayat",
  "vokkaliga",
  "dalit",
];

export function mentionsProtectedAttribute(text: string): boolean {
  const t = text.toLowerCase();
  return PROTECTED_TERMS.some((term) => new RegExp(`\\b${term}\\b`).test(t));
}
