const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const { query } = require('../db');
const { coinosRequest } = require('../services/coinos');
const { formatSats, formatNumber } = require('../utils/format');
const { isAuthorized, denyEmbed, isInteractionGoneError, runAdminCommand } = require('../utils/admin');

const ADMIN_WITHDRAWALS_BUTTON_ID = 'admin_recent_withdrawals';

const data = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('Show admin wallet stats and recent withdrawals')
  .setDMPermission(true);

async function handleAdminCommand(interaction) {
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

  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  } catch (error) {
    if (isInteractionGoneError(error)) {
      return;
    }
    throw error;
  }

  const totalsResult = await query(
    "select " +
      "coalesce((select sum(balance_sats) from users), 0) as total_balance_sats, " +
      "coalesce((select sum(delta_sats) from balance_ledger where reason like 'deposit:%' and delta_sats > 0), 0) as total_deposits_sats, " +
      "coalesce((select sum(-delta_sats) from balance_ledger where (reason = 'withdraw' or reason = 'pay') and delta_sats < 0), 0) - " +
      "coalesce((select sum(delta_sats) from balance_ledger where (reason = 'withdraw:reversal' or reason = 'pay:reversal') and delta_sats > 0), 0) as total_withdrawals_sats"
  );

  const totals = totalsResult.rows[0] || {};
  const totalBalance = Number(totals.total_balance_sats || 0);
  const totalDeposits = Number(totals.total_deposits_sats || 0);
  const totalWithdrawals = Math.max(0, Number(totals.total_withdrawals_sats || 0));

  let coinosBalance = 0;
  try {
    const accountData = await coinosRequest('/me', 'GET');
    coinosBalance = Number(accountData && accountData.balance ? accountData.balance : 0);
  } catch (error) {
    console.error('Failed to fetch Coinos balance:', error.message);
  }

  const embed = new EmbedBuilder()
    .setTitle('Admin Dashboard')
    .setColor(0x1abc9c)
    .addFields(
      { name: 'Total User Balance', value: formatSats(formatNumber(totalBalance)), inline: false },
      { name: 'Coinos Wallet Balance', value: formatSats(formatNumber(coinosBalance)), inline: false },
      { name: 'Total Deposits', value: formatSats(formatNumber(totalDeposits)), inline: true },
      { name: 'Total Withdrawals', value: formatSats(formatNumber(totalWithdrawals)), inline: true }
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(ADMIN_WITHDRAWALS_BUTTON_ID)
      .setLabel('Recent 20 Withdrawals')
      .setStyle(ButtonStyle.Secondary)
  );

  try {
    await interaction.editReply({ embeds: [embed], components: [row] });
  } catch (error) {
    if (!isInteractionGoneError(error)) {
      throw error;
    }
  }
}

async function handleAdminWithdrawalsButton(interaction) {
  if (interaction.customId !== ADMIN_WITHDRAWALS_BUTTON_ID) {
    return false;
  }

  if (!isAuthorized(interaction)) {
    try {
      await interaction.reply({ embeds: [denyEmbed()], flags: MessageFlags.Ephemeral });
    } catch (error) {
      if (!isInteractionGoneError(error)) {
        throw error;
      }
    }
    return true;
  }

  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  } catch (error) {
    if (isInteractionGoneError(error)) {
      return true;
    }
    throw error;
  }

  const withdrawals = await query(
    "select u.discord_username, b.discord_id, -b.delta_sats as amount_sats, b.created_at, b.reason, " +
      "CASE WHEN EXISTS ( " +
        "select 1 from balance_ledger b2 " +
        "where b2.discord_id = b.discord_id " +
        "and (b2.reason = 'withdraw:reversal' or b2.reason = 'pay:reversal') " +
        "and b2.delta_sats = -b.delta_sats " +
        "and b2.created_at > b.created_at " +
        "limit 1 " +
      ") THEN true ELSE false END as was_reversed " +
      "from balance_ledger b " +
      "left join users u on u.discord_id = b.discord_id " +
      "where (b.reason = 'withdraw' or b.reason = 'pay') and b.delta_sats < 0 " +
      "order by b.created_at desc limit 20"
  );

  if (withdrawals.rows.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle('Recent Withdrawals')
      .setDescription('No withdrawals found.')
      .setColor(0x95a5a6);
    try {
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      if (!isInteractionGoneError(error)) {
        throw error;
      }
    }
    return true;
  }

  const lines = withdrawals.rows.map((row) => {
    const username = row.discord_username || 'unknown-user';
    const mention = `<@${row.discord_id}>`;
    const amount = Number(row.amount_sats || 0);
    const timestamp = Math.floor(new Date(row.created_at).getTime() / 1000);
    const type = row.reason === 'pay' ? 'Payment' : 'Withdrawal';
    const status = row.was_reversed ? ' (Failed)' : '';
    return `• ${username} ${mention} - ${formatSats(formatNumber(amount))} (${type}${status}) <t:${timestamp}:R>`;
  });

  const embed = new EmbedBuilder()
    .setTitle('Recent 20 Withdrawals')
    .setDescription(lines.join('\n').slice(0, 3900))
    .setColor(0xf39c12);

  try {
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    if (!isInteractionGoneError(error)) {
      throw error;
    }
  }
  return true;
}

async function execute(interaction) {
  await runAdminCommand(interaction, { label: 'Admin', title: 'Admin Failed ⚠️' }, handleAdminCommand);
}

module.exports = {
  data,
  execute,
  handleAdminWithdrawalsButton,
};
