export function formatCurrency(paise: number, currency = "INR") {
  const minimumFractionDigits = paise % 100 === 0 ? 0 : 2;

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits,
    maximumFractionDigits: minimumFractionDigits,
  }).format(paise / 100);
}
