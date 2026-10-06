const { SlashCommandBuilder } = require('discord.js');
const { ensureUser, applyTransfer } = require('../services/wallet');
const { truncateText, formatSats } = require('../utils/format');
const { buildEmbed, safeDeferReply, safeEditReply, sendDm } = require('../utils/interactions');
const { EMOJI } = require('../emoji');

const data = new SlashCommandBuilder()
  .setName('tip')
  .setDescription('Send sats to a user from your balance')
  .setDMPermission(true)
  .addUserOption((option) =>
    option
      .setName('user')
      .setDescription('User to tip')
      .setRequired(true)
  )
  .addIntegerOption((option) =>
    option
      .setName('amount')
      .setDescription('Amount in satoshis')
      .setRequired(true)
      .setMinValue(1)
  );

async function execute(interaction) {
  const recipientUser = interaction.options.getUser('user', true);
  const amount = interaction.options.getInteger('amount', true);

  if (!(await safeDeferReply(interaction, { ephemeral: false }))) return;

  if (recipientUser.bot) {
    const embed = buildEmbed({
      title: 'Tip Failed ⚠️',
      description: 'You cannot tip bots.',
      color: 0xe74c3c,
    });
    await safeEditReply(interaction, { embeds: [embed] });
    return;
  }

  if (recipientUser.id === interaction.user.id) {
    const embed = buildEmbed({
      title: 'Tip Failed ⚠️',
      description: 'You cannot tip yourself.',
      color: 0xe74c3c,
    });
    await safeEditReply(interaction, { embeds: [embed] });
    return;
  }

  try {
    await ensureUser(interaction.user.id, interaction.user.username);

    const total = await applyTransfer({
      sender: { id: interaction.user.id, username: interaction.user.username },
      recipients: [{ id: recipientUser.id, username: recipientUser.username }],
      amountPer: amount,
      reason: 'tip',
    });

    console.log('Tip transfer total:', total);

    await safeEditReply(
      interaction,
      `${EMOJI.peperain} ${interaction.user.toString()} tipped ${recipientUser.toString()} ${formatSats(total)}`
    );

    await sendDm(
      recipientUser,
      `${EMOJI.peperain} ${interaction.user.toString()} tipped you ${formatSats(total)}`
    );
  } catch (error) {
    const embed = buildEmbed({
      title: 'Tip Failed ⚠️',
      description: truncateText(error.message, 200),
      color: 0xe74c3c,
    });
    await safeEditReply(interaction, { embeds: [embed] });
  }
}

module.exports = { data, execute };
