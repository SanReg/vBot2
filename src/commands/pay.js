const { SlashCommandBuilder } = require('discord.js');
const bolt11 = require('bolt11');
const { COINOS_PIN } = require('../config');
const { coinosRequest } = require('../services/coinos');
const {
  ensureUser,
  reserveWithdrawBalance,
  refundWithdrawBalance,
} = require('../services/wallet');
const { truncateText, formatSats } = require('../utils/format');
const { buildEmbed, safeDeferReply, safeEditReply, sendDm } = require('../utils/interactions');
const { EMOJI } = require('../emoji');

const data = new SlashCommandBuilder()
  .setName('pay')
  .setDescription('Pay a Lightning invoice from your balance')
  .setDMPermission(true)
  .addStringOption((option) =>
    option
      .setName('payreq')
      .setDescription('Lightning invoice (BOLT11)')
      .setRequired(true)
  );

async function execute(interaction) {
  const payreq = interaction.options.getString('payreq', true);
  let amountSats;
  let reserved = false;

  if (!(await safeDeferReply(interaction, { ephemeral: true }))) return;

  try {
    await ensureUser(interaction.user.id, interaction.user.username);

    let decoded;
    try {
      decoded = bolt11.decode(payreq);
    } catch (error) {
      const embed = buildEmbed({
        title: 'Payment Failed ⚠️',
        description: 'Invalid Lightning invoice.',
        color: 0xe74c3c,
      });
      await safeEditReply(interaction, { embeds: [embed] });
      return;
    }

    amountSats = null;
    if (decoded.satoshis) {
      amountSats = Number(decoded.satoshis);
    } else if (decoded.millisatoshis) {
      const msats = Number(decoded.millisatoshis);
      amountSats = Math.ceil(msats / 1000);
    }

    if (!amountSats || Number.isNaN(amountSats) || amountSats <= 0) {
      const embed = buildEmbed({
        title: 'Payment Failed ⚠️',
        description: 'Invoice must include an amount.',
        color: 0xe74c3c,
      });
      await safeEditReply(interaction, { embeds: [embed] });
      return;
    }

    try {
      await reserveWithdrawBalance(interaction.user.id, interaction.user.username, amountSats, 'pay');
      reserved = true;
    } catch (error) {
      const message =
        error && error.message === 'Insufficient balance.'
          ? `Insufficient balance. Needed ${formatSats(amountSats)}.`
          : truncateText(error.message || 'Unable to reserve balance.', 200);
      const embed = buildEmbed({
        title: 'Payment Failed ⚠️',
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

    console.log('Pay response:', data);

    const fields = [];
    if (data && data.amount) fields.push({ name: 'Amount', value: formatSats(data.amount), inline: true });
    if (data && data.hash) fields.push({ name: 'Hash', value: truncateText(data.hash, 64), inline: true });

    const embed = buildEmbed({
      title: 'Payment Sent ✅',
      description: 'Payment broadcast to Lightning network.',
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
      await refundWithdrawBalance(interaction.user.id, amountSats, 'pay');
    }
    const embed = buildEmbed({
      title: 'Payment Failed ⚠️',
      description: truncateText(error.message, 200),
      color: 0xe74c3c,
    });
    await safeEditReply(interaction, { embeds: [embed] });
  }
}

module.exports = { data, execute };
