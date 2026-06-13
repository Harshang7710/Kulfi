export function money(value: unknown): string {
  return Number(value || 0).toFixed(2);
}
