/**
 * Computes a rate only when both operands are real and the denominator can
 * support a meaningful comparison. Callers must keep the null result as an
 * unavailable value; it must never be rendered as an artificial zero.
 */
export function safeRatio(numerator: number | null, denominator: number | null): number | null {
  return numerator !== null && denominator !== null && denominator > 0 ? numerator / denominator : null;
}
