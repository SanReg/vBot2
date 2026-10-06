const { query } = require('../db');
const { INVOICE_EXPIRY_SECONDS, DEPOSIT_POLL_INTERVAL_MS } = require('../config');
const { creditInvoiceIfPaid } = require('./wallet');
const { sendDm } = require('../utils/interactions');
const { formatSats } = require('../utils/format');
const { EMOJI } = require('../emoji');

// One extra interval so a payment landing right at expiry still gets a check.
const WATCH_WINDOW_MS = INVOICE_EXPIRY_SECONDS * 1000 + DEPOSIT_POLL_INTERVAL_MS;
// On startup, unpaid invoices this recent get one check in case they were paid while the bot was down.
const RESUME_LOOKBACK_HOURS = 24;

const watching = new Set();

// Returns true once the invoice needs no further checks.
async function checkInvoice(client, invoice) {
  const result = await creditInvoiceIfPaid(invoice);
  if (result.status === 'pending') return false;

  if (result.status === 'credited') {
    try {
      const user = await client.users.fetch(invoice.discordId);
      await sendDm(user, `${EMOJI.purpleflame} Deposit received: ${formatSats(result.amount)}`);
    } catch (error) {
      console.error('Deposit DM failed:', error.message);
    }
  }

  return true;
}

// Polls Coinos for one invoice until it is paid or its window has passed.
function watchInvoice(client, invoice, deadline = Date.now() + WATCH_WINDOW_MS) {
  if (watching.has(invoice.hash)) return;
  watching.add(invoice.hash);

  const tick = async () => {
    const isLastCheck = Date.now() >= deadline;
    let settled = false;
    try {
      settled = await checkInvoice(client, invoice);
    } catch (error) {
      console.error('Failed to check invoice status:', error.message);
    }

    if (settled || isLastCheck) {
      watching.delete(invoice.hash);
      return;
    }
    setTimeout(tick, DEPOSIT_POLL_INTERVAL_MS);
  };

  setTimeout(tick, DEPOSIT_POLL_INTERVAL_MS);
}

// Picks deposits back up after a restart, since the watchers only live in memory.
async function resumePendingInvoices(client) {
  const pending = await query(
    'select discord_id, hash, amount_sats, created_at from lightning_invoices where paid_at is null and created_at > now() - make_interval(hours => $1)',
    [RESUME_LOOKBACK_HOURS]
  );

  for (const row of pending.rows) {
    const invoice = { hash: row.hash, amountSats: Number(row.amount_sats), discordId: row.discord_id };
    const deadline = new Date(row.created_at).getTime() + WATCH_WINDOW_MS;

    if (Date.now() < deadline) {
      watchInvoice(client, invoice, deadline);
      continue;
    }

    try {
      await checkInvoice(client, invoice);
    } catch (error) {
      console.error('Failed to check invoice status:', error.message);
    }
  }
}

module.exports = { watchInvoice, resumePendingInvoices };
