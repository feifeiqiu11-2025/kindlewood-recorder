/** Convert decibels to a linear gain multiplier. 0 dB → 1.0. */
export const dbToGain = (db: number) => Math.pow(10, db / 20);
