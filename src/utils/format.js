const { EMOJI } = require('../emoji');

function truncateText(value, maxLength) {
  if (!value) return '';
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function formatSats(amount) {
  // Database amounts arrive as text like "5.00": show 5, and keep fractions such as 5.25.
  const isPlainNumber = typeof amount === 'string' && /^-?\d+(\.\d+)?$/.test(amount);
  return `${isPlainNumber ? Number(amount) : amount} ${EMOJI.sats}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

function formatReason(reason) {
  if (!reason) return 'Activity';

  if (reason.startsWith('deposit:')) {
    return 'Deposit ⚡';
  }

  if (reason.startsWith('tip:out:')) {
    return `Tip sent ${EMOJI.peperain}`;
  }

  if (reason.startsWith('tip:from:')) {
    return `Tip received ${EMOJI.peperain}`;
  }

  if (reason.startsWith('rain:out:')) {
    return `Rain sent ${EMOJI.rain}`;
  }

  if (reason.startsWith('rain:from:')) {
    return `Rain received ${EMOJI.rain}`;
  }

  if (reason.startsWith('drop:out:')) {
    return `Drop sent ${EMOJI.bump}`;
  }

  if (reason.startsWith('drop:from:')) {
    return `Drop received ${EMOJI.bump}`;
  }

  if (reason === 'withdraw') {
    return `Withdrawal ${EMOJI.purpleflame}`;
  }

  if (reason === 'withdraw:reversal') {
    return `Withdrawal reversed ${EMOJI.purpleflame}`;
  }

  if (reason === 'pay') {
    return `Payment sent ${EMOJI.purpleflame}`;
  }

  if (reason === 'pay:reversal') {
    return `Payment reversed ${EMOJI.purpleflame}`;
  }

  return truncateText(reason, 64);
}

module.exports = {
  truncateText,
  formatSats,
  formatNumber,
  formatReason,
};
