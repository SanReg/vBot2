// Balances hold sats with up to two decimal places. Arithmetic goes through whole
// hundredths so it stays exact (plain JS decimals would give 0.1 + 0.2 = 0.30000000000000004).
const MIN_AMOUNT = 0.01;
const MAX_AMOUNT = 1e12;
const INVALID_AMOUNT_MESSAGE = 'Amount must be at least 0.01 and have at most 2 decimal places.';

function toHundredths(amount) {
  return Math.round(Number(amount) * 100);
}

// Returns the amount if it is within range and has at most two decimals, otherwise null.
function parseAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) return null;

  const hundredths = amount * 100;
  if (Math.abs(hundredths - Math.round(hundredths)) > 1e-6) return null;
  return Math.round(hundredths) / 100;
}

function multiplyAmount(amount, count) {
  return (toHundredths(amount) * count) / 100;
}

module.exports = { MIN_AMOUNT, INVALID_AMOUNT_MESSAGE, parseAmount, multiplyAmount };
