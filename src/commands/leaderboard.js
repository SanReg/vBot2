const { SlashCommandBuilder } = require('discord.js');
const { query } = require('../db');
const { truncateText, formatSats } = require('../utils/format');
const { buildEmbed, safeDeferReply, safeEditReply } = require('../utils/interactions');
const { EMOJI } = require('../emoji');

const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('Show top rain senders')
  .setDMPermission(true)
  .addStringOption((option) =>
    option
      .setName('type')
      .setDescription('Leaderboard type')
      .addChoices(
        { name: 'makers', value: 'makers' },
        { name: 'catchers', value: 'catchers' }
      )
  );

async function execute(interaction) {
  if (!(await safeDeferReply(interaction, { ephemeral: false }))) return;

  try {
    const leaderboardType = interaction.options.getString('type') || 'makers';
    const isCatchers = leaderboardType === 'catchers';

    const result = await query(
      isCatchers
        ? "select u.discord_id, u.discord_username, sum(b.delta_sats) as total_sats, count(*) as rains " +
            "from balance_ledger b join users u on u.discord_id = b.discord_id " +
            "where b.reason like 'rain:from:%' and b.delta_sats > 0 " +
            "group by u.discord_id, u.discord_username " +
            "order by total_sats desc limit 10"
        : "select u.discord_id, u.discord_username, sum(-b.delta_sats) as total_sats, count(*) as rains " +
            "from balance_ledger b join users u on u.discord_id = b.discord_id " +
            "where b.reason like 'rain:out:%' and b.delta_sats < 0 " +
            "group by u.discord_id, u.discord_username " +
            "order by total_sats desc limit 10"
    );

    const rankResult = await query(
      isCatchers
        ? "select discord_id, total_sats, rains, rank from (" +
            "select u.discord_id, sum(b.delta_sats) as total_sats, count(*) as rains, " +
            "dense_rank() over (order by sum(b.delta_sats) desc) as rank " +
            "from balance_ledger b join users u on u.discord_id = b.discord_id " +
            "where b.reason like 'rain:from:%' and b.delta_sats > 0 " +
            "group by u.discord_id" +
            ") ranked where discord_id = $1"
        : "select discord_id, total_sats, rains, rank from (" +
            "select u.discord_id, sum(-b.delta_sats) as total_sats, count(*) as rains, " +
            "dense_rank() over (order by sum(-b.delta_sats) desc) as rank " +
            "from balance_ledger b join users u on u.discord_id = b.discord_id " +
            "where b.reason like 'rain:out:%' and b.delta_sats < 0 " +
            "group by u.discord_id" +
            ") ranked where discord_id = $1",
      [interaction.user.id]
    );

    if (result.rows.length === 0) {
      const titlePrefix = isCatchers ? 'Catchers' : 'Makers';
      const embed = buildEmbed({
        title: `${EMOJI.rain} ${titlePrefix} Leaderboard`,
        description: 'No rain activity yet.',
        color: 0x95a5a6,
      });
      await safeEditReply(interaction, { embeds: [embed] });
      return;
    }

    const lines = result.rows.map((row, index) => {
      const rank = index + 1;
      const rankBadge = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : EMOJI.slice;
      const mention = `<@${row.discord_id}>`;
      const total = Number(row.total_sats || 0);
      const rainCount = Number(row.rains || 0);
      return `${rankBadge} **${rank}.** ${mention} — ${formatSats(total)} · ${rainCount} rains`;
    });

    const userRow = rankResult.rows[0];
    const isInTop = result.rows.some((row) => row.discord_id === interaction.user.id);
    if (userRow && !isInTop) {
      const userTotal = Number(userRow.total_sats || 0);
      const userRains = Number(userRow.rains || 0);
      lines.push('------------------------------');
      lines.push('Your position:');
      lines.push(
        `${EMOJI.bump} **${userRow.rank}.** <@${interaction.user.id}> — ${formatSats(userTotal)} · ${userRains} rains`
      );
    }

    const titlePrefix = isCatchers ? 'Catchers' : 'Makers';
    const embed = buildEmbed({
      title: `${EMOJI.rain} ${titlePrefix} Leaderboard`,
      description: truncateText(lines.join('\n'), 3900),
      color: 0x3498db,
    });

    await safeEditReply(interaction, { embeds: [embed] });
  } catch (error) {
    const embed = buildEmbed({
      title: 'Leaderboard Failed ⚠️',
      description: truncateText(error.message, 200),
      color: 0xe74c3c,
    });
    await safeEditReply(interaction, { embeds: [embed] });
  }
}

module.exports = { data, execute };
