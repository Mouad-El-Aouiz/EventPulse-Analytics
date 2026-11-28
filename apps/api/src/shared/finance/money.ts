export const MONEY_PATTERN = /^\d{1,10}(?:\.\d{1,2})?$/;

export function normalizeMoney(value: string): string {
  const [whole = '0', fraction = ''] = value.split('.');
  return `${whole}.${`${fraction}00`.slice(0, 2)}`;
}

export function moneyToCents(value: string | { toFixed(scale: number): string }): bigint {
  const text = typeof value === 'string' ? normalizeMoney(value) : value.toFixed(2);
  const [whole = '0', fraction = '00'] = text.split('.');

  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2));
}

export function formatMoney(value: string | { toFixed(scale: number): string }): string {
  return typeof value === 'string' ? normalizeMoney(value) : value.toFixed(2);
}
