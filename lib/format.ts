/** Rupee formatting in Indian units (lakh = 1e5, crore = 1e7). */
export function formatRupees(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} crore`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(1)} lakh`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}
