/**
 * Adds every chiffrable monthly opportunity while ignoring entries that do
 * not have enough data to produce a euro amount yet.
 */
export function sumChiffrableMonthlyGains(values: ReadonlyArray<number | null | undefined>): number {
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}
