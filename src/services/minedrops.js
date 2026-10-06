const { pool, query } = require('../db');
const { upsertUserTx, debitBalanceTx } = require('./wallet');

function toDrop(row) {
  return {
    id: row.id,
    hostId: row.host_id,
    amount: Number(row.amount_sats),
    tiles: row.tiles,
    treasureIndex: row.treasure_index,
    channelId: row.channel_id,
    messageId: row.message_id,
    triedUsers: row.tried_users,
    guessedIndices: row.guessed_indices,
    expiresAt: new Date(row.expires_at),
  };
}

// Debits the host and stores the drop in one transaction, so sats never leave a balance without a drop on record.
async function createMinedrop({ id, host, amount, tiles, treasureIndex, channelId, expiresAt }) {
  const clientDb = await pool.connect();

  try {
    await clientDb.query('begin');
    await debitBalanceTx(clientDb, host.id, host.username, amount, 'minedrop');
    await clientDb.query(
      'insert into minedrops (id, host_id, amount_sats, tiles, treasure_index, channel_id, expires_at) values ($1, $2, $3, $4, $5, $6, $7)',
      [id, host.id, amount, tiles, treasureIndex, channelId, expiresAt]
    );
    await clientDb.query('commit');
  } catch (error) {
    await clientDb.query('rollback');
    throw error;
  } finally {
    clientDb.release();
  }
}

async function setMinedropMessage(id, messageId) {
  await query('update minedrops set message_id = $1 where id = $2', [messageId, id]);
}

async function getMinedrop(id) {
  const result = await query('select * from minedrops where id = $1', [id]);
  return result.rows[0] ? toDrop(result.rows[0]) : null;
}

async function listMinedrops() {
  const result = await query('select * from minedrops');
  return result.rows.map(toDrop);
}

// Records a wrong guess. Returns the updated drop, or null if the drop is gone or the user already tried.
async function recordGuess(id, userId, index) {
  const result = await query(
    'update minedrops set tried_users = array_append(tried_users, $2), guessed_indices = array_append(guessed_indices, $3) ' +
      'where id = $1 and treasure_index <> $3 and not ($2 = any(tried_users)) returning *',
    [id, userId, index]
  );
  return result.rows[0] ? toDrop(result.rows[0]) : null;
}

// Deleting the row is what settles a drop: whichever transaction deletes it pays out, and nobody else can.
async function settle(deleteSql, deleteParams, payee, reason) {
  const clientDb = await pool.connect();

  try {
    await clientDb.query('begin');
    const deleted = await clientDb.query(deleteSql, deleteParams);

    if (deleted.rowCount === 0) {
      await clientDb.query('rollback');
      return null;
    }

    const drop = toDrop(deleted.rows[0]);
    const payeeId = payee ? payee.id : drop.hostId;
    if (payee) await upsertUserTx(clientDb, payee.id, payee.username);

    await clientDb.query('update users set balance_sats = balance_sats + $1 where discord_id = $2', [
      drop.amount,
      payeeId,
    ]);
    await clientDb.query(
      'insert into balance_ledger (discord_id, delta_sats, reason) values ($1, $2, $3)',
      [payeeId, drop.amount, reason]
    );
    await clientDb.query('commit');
    return drop;
  } catch (error) {
    await clientDb.query('rollback');
    throw error;
  } finally {
    clientDb.release();
  }
}

// Pays the drop to the user if the square is the treasure. Returns the drop, or null if it was not theirs to win.
async function claimMinedrop(id, user, index) {
  return settle(
    'delete from minedrops where id = $1 and treasure_index = $2 and not ($3 = any(tried_users)) returning *',
    [id, index, user.id],
    user,
    'minedrop_claim:reversal'
  );
}

// Refunds the host. Returns the drop, or null if it was already settled.
async function refundMinedrop(id) {
  return settle('delete from minedrops where id = $1 returning *', [id], null, 'minedrop:reversal');
}

module.exports = {
  createMinedrop,
  setMinedropMessage,
  getMinedrop,
  listMinedrops,
  recordGuess,
  claimMinedrop,
  refundMinedrop,
};
