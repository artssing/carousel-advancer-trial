export const HKD = new Intl.NumberFormat('en-HK', {
  style: 'currency',
  currency: 'HKD',
  maximumFractionDigits: 0,
});

export function formatHKD(amount: number): string {
  return HKD.format(amount);
}
