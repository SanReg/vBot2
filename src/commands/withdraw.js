const { SlashCommandBuilder } = require('discord.js');
const { COINOS_PIN } = require('../config');
const { query } = require('../db');
const { coinosRequest } = require('../services/coinos');
const { getLnurlPayInvoice } = require('../services/lnurl');
const {
  ensureUser,
  reserveWithdrawBalance,
  refundWithdrawBalance,
} = require('../services/wallet');
const { truncateText, formatSats } = require('../utils/format');
const { buildEmbed, safeDeferReply, safeEditReply, sendDm } = require('../utils/interactions');
const { EMOJI } = require('../emoji');

const data = new SlashCommandBuilder()
  .setName('withdraw')
  .setDescription('Withdraw sats to your linked Lightning address')
  .setDMPermission(true)
  .addIntegerOption((option) =>
    option
      .setName('amount')
      .setDescription('Amount in satoshis')
      .setRequired(true)
      .setMinValue(1)
  );

async function execute(interaction) {
  const amountSats = interaction.options.getInteger('amount', true);
  let reserved = false;

  if (!(await safeDeferReply(interaction, { ephemeral: true }))) return;

  try {
    await ensureUser(interaction.user.id, interaction.user.username);

    const addressResult = await query('select lightning_address from users where discord_id = $1', [
      interaction.user.id,
    ]);
    const lightningAddress = addressResult.rows[0]
      ? addressResult.rows[0].lightning_address
      : null;

    if (!lightningAddress) {
      const embed = buildEmbed({
        title: 'Withdrawal Failed ⚠️',
        description: 'No linked lightning address. Use /link address first.',
        color: 0xe74c3c,
      });
      await safeEditReply(interaction, { embeds: [embed] });
      return;
    }

    const payreq = await getLnurlPayInvoice(lightningAddress, amountSats);

    try {
      await reserveWithdrawBalance(interaction.user.id, interaction.user.username, amountSats, 'withdraw');
      reserved = true;
    } catch (error) {
      const message =
        error && error.message === 'Insufficient balance.'
          ? `Insufficient balance. Needed ${formatSats(amountSats)}.`
          : truncateText(error.message || 'Unable to reserve balance.', 200);
      const embed = buildEmbed({
        title: 'Withdrawal Failed ⚠️',
        description: message,
        color: 0xe74c3c,
      });
      await safeEditReply(interaction, { embeds: [embed] });
      return;
    }

    const data = await coinosRequest('/payments', 'POST', {
      payreq,
      pin: COINOS_PIN,
    });

    console.log('Withdraw response:', data);

    const fields = [];
    if (data && data.amount) fields.push({ name: 'Amount', value: formatSats(data.amount), inline: true });
    if (data && data.hash) fields.push({ name: 'Hash', value: truncateText(data.hash, 64), inline: true });

    const embed = buildEmbed({
      title: 'Withdrawal Sent ✅',
      description: `Payment sent to ${lightningAddress}.`,
      color: 0x2ecc71,
      fields,
    });

    await safeEditReply(interaction, { embeds: [embed] });

    if (data && data.amount) {
      const amount = Math.abs(Number(data.amount));
      await sendDm(
        interaction.user,
        `${EMOJI.purpleflame} Your withdrawal of ${formatSats(amount)} was successful!`
      );
    }
  } catch (error) {
    if (reserved && typeof amountSats === 'number' && amountSats > 0) {
      await refundWithdrawBalance(interaction.user.id, amountSats, 'withdraw');
    }
    const embed = buildEmbed({
      title: 'Withdrawal Failed ⚠️',
      description: truncateText(error.message, 200),
      color: 0xe74c3c,
    });
    await safeEditReply(interaction, { embeds: [embed] });
  }
}

module.exports = { data, execute };
