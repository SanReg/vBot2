const { pool, query } = require('../db');
const { upsertUserTx } = require('./wallet');

const MAX_BLOCKS = 100;

// A block is one-way: the blocker's rains skip the blocked user, and the blocked user cannot play the blocker's minedrops.
// Returns 'added', 'exists' or 'full'.
async function addBlock(blocker, blocked) {
  const clientDb = await pool.connect();

  try {
    await clientDb.query('begin');
    // Both get a users row so blocklists can always be shown by username.
    await upsertUserTx(clientDb, blocker.id, blocker.username);
    await upsertUserTx(clientDb, blocked.id, blocked.username);

    const countResult = await clientDb.query('select count(*)::int as total from user_blocks where blocker_id = $1', [
      blocker.id,
    ]);
    const existing = await clientDb.query('select 1 from user_blocks where blocker_id = $1 and blocked_id = $2', [
      blocker.id,
      blocked.id,
    ]);

    let outcome = 'added';
    if (existing.rowCount > 0) {
      outcome = 'exists';
    } else if (countResult.rows[0].total >= MAX_BLOCKS) {
      outcome = 'full';
    } else {
      await clientDb.query(
        'insert into user_blocks (blocker_id, blocked_id) values ($1, $2) on conflict do nothing',
        [blocker.id, blocked.id]
      );
    }

    await clientDb.query('commit');
    return outcome;
  } catch (error) {
    await clientDb.query('rollback');
    throw error;
  } finally {
    clientDb.release();
  }
}

// Returns true if a block was removed.
async function removeBlock(blockerId, blockedId) {
  const result = await query('delete from user_blocks where blocker_id = $1 and blocked_id = $2', [
    blockerId,
    blockedId,
  ]);
  return result.rowCount > 0;
}

async function listBlocks(blockerId) {
  const result = await query(
    'select b.blocked_id, u.discord_username, b.created_at from user_blocks b ' +
      'left join users u on u.discord_id = b.blocked_id ' +
      'where b.blocker_id = $1 order by b.created_at, b.blocked_id',
    [blockerId]
  );
  return result.rows.map((row) => ({
    id: row.blocked_id,
    username: row.discord_username || row.blocked_id,
    createdAt: new Date(row.created_at),
  }));
}

async function getBlockedIds(blockerId) {
  const result = await query('select blocked_id from user_blocks where blocker_id = $1', [blockerId]);
  return new Set(result.rows.map((row) => row.blocked_id));
}

async function isBlocked(blockerId, blockedId) {
  const result = await query('select 1 from user_blocks where blocker_id = $1 and blocked_id = $2', [
    blockerId,
    blockedId,
  ]);
  return result.rowCount > 0;
}

module.exports = { MAX_BLOCKS, addBlock, removeBlock, listBlocks, getBlockedIds, isBlocked };
