const { pool, query } = require('../db');
const { coinosRequest } = require('./coinos');

async function ensureUser(discordId, discordUsername) {
  await query(
    'insert into users (discord_id, discord_username) values ($1, $2) on conflict (discord_id) do update set discord_username = excluded.discord_username',
    [discordId, discordUsername]
  );
}

async function recordInvoice(discordId, amountSats, hash, invoiceText) {
  await query(
    'insert into lightning_invoices (discord_id, amount_sats, hash, invoice_text) values ($1, $2, $3, $4) on conflict (hash) do nothing',
    [discordId, amountSats, hash, invoiceText]
  );
}

// Credits a deposit invoice once Coinos reports it paid. Safe to call repeatedly:
// the paid_at guard means an invoice is only ever credited once.
async function creditInvoiceIfPaid({ hash, amountSats }) {
  const invoiceData = await coinosRequest(`/invoice/${hash}`, 'GET');

  const received = Number(invoiceData && invoiceData.received ? invoiceData.received : 0);
  if (received < amountSats) return { status: 'pending' };

  const client = await pool.connect();
  try {
    await client.query('begin');
    const updateResult = await client.query(
      'update lightning_invoices set paid_at = now(), received_sats = $1 where hash = $2 and paid_at is null returning amount_sats, hash, discord_id',
      [received, hash]
    );

    if (updateResult.rowCount === 0) {
      await client.query('rollback');
      return { status: 'already_credited' };
    }

    // Credit whoever the invoice row belongs to, not whoever asked.
    const creditedInvoice = updateResult.rows[0];
    await client.query(
      'update users set balance_sats = balance_sats + $1 where discord_id = $2',
      [creditedInvoice.amount_sats, creditedInvoice.discord_id]
    );
    await client.query(
      'insert into balance_ledger (discord_id, delta_sats, reason) values ($1, $2, $3)',
      [creditedInvoice.discord_id, creditedInvoice.amount_sats, `deposit:${creditedInvoice.hash}`]
    );
    await client.query('commit');
    return { status: 'credited', amount: creditedInvoice.amount_sats };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function upsertUserTx(clientDb, discordId, discordUsername) {
  await clientDb.query(
    'insert into users (discord_id, discord_username) values ($1, $2) on conflict (discord_id) do update set discord_username = excluded.discord_username',
    [discordId, discordUsername]
  );
}

async function applyTransfer({ sender, recipients, amountPer, reason }) {
  if (recipients.length === 0) {
    throw new Error('No recipients available.');
  }

  // Sort a copy by ID to acquire row locks in consistent order (prevents deadlocks)
  const sorted = [...recipients].sort((a, b) => a.id.localeCompare(b.id));

  const total = amountPer * sorted.length;
  const clientDb = await pool.connect();

  try {
    await clientDb.query('begin');

    // Batch upsert: sender + all recipients in one query
    const allUsers = [{ id: sender.id, username: sender.username }, ...sorted];
    const upsertValues = allUsers.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ');
    const upsertParams = allUsers.flatMap((u) => [u.id, u.username]);
    await clientDb.query(
      `insert into users (discord_id, discord_username) values ${upsertValues} on conflict (discord_id) do update set discord_username = excluded.discord_username`,
      upsertParams
    );

    // Lock and check sender balance
    const balanceResult = await clientDb.query(
      'select balance_sats from users where discord_id = $1 for update',
      [sender.id]
    );
    const balance = balanceResult.rows[0] ? balanceResult.rows[0].balance_sats : 0;

    if (balance < total) {
      throw new Error('Insufficient balance.');
    }

    // Debit sender
    await clientDb.query('update users set balance_sats = balance_sats - $1 where discord_id = $2', [
      total,
      sender.id,
    ]);
    await clientDb.query(
      'insert into balance_ledger (discord_id, delta_sats, reason) values ($1, $2, $3)',
      [sender.id, -total, `${reason}:out:${sorted.length}`]
    );

    // Batch credit all recipients in one UPDATE
    const recipientIds = sorted.map((r) => r.id);
    await clientDb.query(
      'update users set balance_sats = balance_sats + $1 where discord_id = any($2)',
      [amountPer, recipientIds]
    );

    // Batch insert all recipient ledger entries in one query
    const ledgerValues = sorted.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(', ');
    const ledgerParams = sorted.flatMap((r) => [r.id, amountPer, `${reason}:from:${sender.id}`]);
    await clientDb.query(
      `insert into balance_ledger (discord_id, delta_sats, reason) values ${ledgerValues}`,
      ledgerParams
    );

    await clientDb.query('commit');
    return total;
  } catch (error) {
    await clientDb.query('rollback');
    throw error;
  } finally {
    clientDb.release();
  }
}

// Debits a balance inside the caller's transaction; throws if it cannot cover the amount.
async function debitBalanceTx(clientDb, discordId, discordUsername, amountSats, reason) {
  await upsertUserTx(clientDb, discordId, discordUsername);

  const balanceResult = await clientDb.query(
    'select balance_sats from users where discord_id = $1 for update',
    [discordId]
  );
  const balance = balanceResult.rows[0] ? balanceResult.rows[0].balance_sats : 0;

  if (balance < amountSats) {
    throw new Error('Insufficient balance.');
  }

  await clientDb.query('update users set balance_sats = balance_sats - $1 where discord_id = $2', [
    amountSats,
    discordId,
  ]);
  await clientDb.query(
    'insert into balance_ledger (discord_id, delta_sats, reason) values ($1, $2, $3)',
    [discordId, -amountSats, reason]
  );
}

async function reserveWithdrawBalance(discordId, discordUsername, amountSats, reason = 'withdraw') {
  const clientDb = await pool.connect();

  try {
    await clientDb.query('begin');
    await debitBalanceTx(clientDb, discordId, discordUsername, amountSats, reason);
    await clientDb.query('commit');
  } catch (error) {
    await clientDb.query('rollback');
    throw error;
  } finally {
    clientDb.release();
  }
}

async function refundWithdrawBalance(discordId, amountSats, reason = 'withdraw') {
  try {
    await query('update users set balance_sats = balance_sats + $1 where discord_id = $2', [
      amountSats,
      discordId,
    ]);
    await query('insert into balance_ledger (discord_id, delta_sats, reason) values ($1, $2, $3)', [
      discordId,
      amountSats,
      `${reason}:reversal`,
    ]);
  } catch (error) {
    console.error('Failed to refund withdrawal:', error.message);
  }
}

module.exports = {
  ensureUser,
  recordInvoice,
  creditInvoiceIfPaid,
  applyTransfer,
  reserveWithdrawBalance,
  refundWithdrawBalance,
  upsertUserTx,
  debitBalanceTx,
};
