/** Calendar day of month when tenant service charge amounts become visible. */
export const SERVICE_CHARGE_PUBLISH_DAY_OF_MONTH = 25;

/** True on/after the publish day for the given date (UTC calendar). */
export function isServiceChargeAmountVisible(date = new Date()): boolean {
  return date.getUTCDate() >= SERVICE_CHARGE_PUBLISH_DAY_OF_MONTH;
}
