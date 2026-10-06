const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { query } = require('../db');
const { formatSats, formatNumber, formatReason } = require('../utils/format');
const { isAuthorized, denyEmbed, isInteractionGoneError, runAdminCommand } = require('../utils/admin');
const { EMOJI } = require('../emoji');

const data = new SlashCommandBuilder()
  .setName('userstats')
  .setDescription('View detailed stats for a user (admin only)')
  .setDMPermission(true)
  .addUserOption((option) =>
    option
      .setName('user')
      .setDescription('User to view stats for')
      .setRequired(true)
  );

async function handleUserStatsCommand(interaction) {
  if (!isAuthorized(interaction)) {
    try {
      await interaction.reply({ embeds: [denyEmbed()], flags: MessageFlags.Ephemeral });
    } catch (error) {
      if (!isInteractionGoneError(error)) {
        throw error;
      }
    }
    return;
  }

  const targetUser = interaction.options.getUser('user', true);
  const targetId = targetUser.id;

  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  } catch (error) {
    if (isInteractionGoneError(error)) {
      return;
    }
    throw error;
  }

  try {
    const userResult = await query(
      'select discord_username, balance_sats, lightning_address from users where discord_id = $1',
      [targetId]
    );

    if (userResult.rows.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('User Not Found')
        .setDescription(`No data found for <@${targetId}>.`)
        .setColor(0x95a5a6);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const user = userResult.rows[0];
    const username = user.discord_username || 'unknown-user';
    const balance = Number(user.balance_sats || 0);
    const linkedAddress = user.lightning_address || 'None';

    const totalsResult = await query(
      "select " +
        "coalesce((select sum(delta_sats) from balance_ledger where discord_id = $1 and reason like 'deposit:%' and delta_sats > 0), 0) as total_deposits_sats, " +
        "coalesce((select sum(-delta_sats) from balance_ledger where discord_id = $1 and (reason = 'withdraw' or reason = 'pay') and delta_sats < 0), 0) - " +
        "coalesce((select sum(delta_sats) from balance_ledger where discord_id = $1 and (reason = 'withdraw:reversal' or reason = 'pay:reversal') and delta_sats > 0), 0) as total_withdrawals_sats, " +
        "coalesce((select sum(-delta_sats) from balance_ledger where discord_id = $1 and reason like 'tip:out:%' and delta_sats < 0), 0) as total_tipped_sats, " +
        "coalesce((select sum(-delta_sats) from balance_ledger where discord_id = $1 and reason like 'rain:out:%' and delta_sats < 0), 0) as total_rained_sats",
      [targetId]
    );

    const totals = totalsResult.rows[0] || {};
    const totalDeposits = Number(totals.total_deposits_sats || 0);
    const totalWithdrawals = Math.max(0, Number(totals.total_withdrawals_sats || 0));
    const totalTipped = Number(totals.total_tipped_sats || 0);
    const totalRained = Number(totals.total_rained_sats || 0);

    const historyResult = await query(
      'select delta_sats, reason, created_at from balance_ledger where discord_id = $1 order by created_at desc limit 5',
      [targetId]
    );

    const embed = new EmbedBuilder()
      .setTitle(`User Stats - ${username}`)
      .setDescription(`<@${targetId}>`)
      .setColor(0x3498db)
      .addFields(
        { name: 'Current Balance', value: formatSats(formatNumber(balance)), inline: true },
        { name: 'Total Deposits', value: formatSats(formatNumber(totalDeposits)), inline: true },
        { name: 'Total Withdrawals', value: formatSats(formatNumber(totalWithdrawals)), inline: true },
        { name: 'Total Tipped', value: formatSats(formatNumber(totalTipped)), inline: true },
        { name: 'Total Rained', value: formatSats(formatNumber(totalRained)), inline: true },
        { name: 'Linked Address', value: linkedAddress, inline: false }
      );

    if (historyResult.rows.length > 0) {
      const lines = historyResult.rows.map((entry) => {
        const delta = Number(entry.delta_sats);
        const signed = delta > 0 ? `+${delta}` : `${delta}`;
        const when = Math.floor(new Date(entry.created_at).getTime() / 1000);
        const direction = delta >= 0 ? EMOJI.in : EMOJI.out;
        return `• ${direction} ${signed} ${EMOJI.sats} — ${formatReason(entry.reason)} <t:${when}:R>`;
      });
      embed.addFields({
        name: 'Last 5 Transactions',
        value: lines.join('\n').slice(0, 1024),
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Failed to fetch user stats:', error.message);
    const embed = new EmbedBuilder()
      .setTitle('Error')
      .setDescription('Failed to fetch user stats.')
      .setColor(0xe74c3c);
    try {
      await interaction.editReply({ embeds: [embed] });
    } catch (responseError) {
      if (!isInteractionGoneError(responseError)) {
        throw responseError;
      }
    }
  }
}

async function execute(interaction) {
  await runAdminCommand(interaction, { label: 'User stats', title: 'User Stats Failed ⚠️' }, handleUserStatsCommand);
}

module.exports = { data, execute };
