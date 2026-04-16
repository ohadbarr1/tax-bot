/**
 * validateTZ.ts — Israeli Teudat Zehut (ID number) validation.
 *
 * Israeli ID is 9 digits with a Luhn-variant check digit.
 * Algorithm: multiply each digit by 1 (even index) or 2 (odd index),
 * subtract 9 if product > 9, sum all, valid if sum % 10 === 0.
 *
 * Source: israeli-gov-form-automator skill.
 */

export function isValidTZ(tz: string): boolean {
  const id = tz.padStart(9, "0");
  if (id.length !== 9 || !/^\d{9}$/.test(id)) return false;

  let total = 0;
  for (let i = 0; i < 9; i++) {
    let val = parseInt(id[i], 10) * (1 + (i % 2));
    if (val > 9) val -= 9;
    total += val;
  }
  return total % 10 === 0;
}
