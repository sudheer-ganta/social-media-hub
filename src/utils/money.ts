/** Integer paise -> "₹1,999". Whole rupees only; no plan or pack is priced in paise. */
export function formatRupees(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

/** The monthly equivalent of a yearly price, in paise. */
export function perMonthPaise(yearlyPaise: number): number {
  return Math.round(yearlyPaise / 12);
}
