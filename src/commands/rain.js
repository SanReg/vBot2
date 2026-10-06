const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { ensureUser, applyTransfer } = require('../services/wallet');
const { truncateText, formatSats } = require('../utils/format');
const { buildEmbed, safeDeferReply, safeEditReply, sendDm } = require('../utils/interactions');
const { EMOJI } = require('../emoji');

const data = new SlashCommandBuilder()
  .setName('rain')
  .setDescription('Send sats to recent users in this channel')
  .setDMPermission(false)
  .addIntegerOption((option) =>
    option
      .setName('amount')
      .setDescription('Amount per user in satoshis')
      .setRequired(true)
      .setMinValue(1)
  )
  .addIntegerOption((option) =>
    option
      .setName('maxcount')
      .setDescription('Maximum number of recipients')
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(50)
  );

async function getRecentRecipients(channel, excludeId, count) {
  const recipients = [];
  const seen = new Set();
  let lastId;
  let fetched = 0;

  while (fetched < 1000 && recipients.length < count) {
    const batch = await channel.messages.fetch({ limit: 100, before: lastId });
    if (batch.size === 0) break;
    fetched += batch.size;
    lastId = batch.last().id;

    for (const message of batch.values()) {
      if (!message.author || message.author.bot) continue;
      if (message.author.id === excludeId) continue;
      if (seen.has(message.author.id)) continue;

      seen.add(message.author.id);
      recipients.push({ id: message.author.id, username: message.author.username });

      if (recipients.length >= count) break;
    }
  }

  return recipients;
}

async function execute(interaction) {
  const amount = interaction.options.getInteger('amount', true);
  const maxcount = interaction.options.getInteger('maxcount', true);

  if (!(await safeDeferReply(interaction, { ephemeral: false }))) return;

  const preparingEmbed = buildEmbed({
    title: `${EMOJI.rain} Preparing Rain`,
    description: `${EMOJI.peperain} Scanning channel for active users...`,
    color: 0x8e44ad,
  });
  await safeEditReply(interaction, { embeds: [preparingEmbed] });

  if (!interaction.inGuild() || !interaction.channel || !interaction.channel.isTextBased()) {
    const embed = buildEmbed({
      title: 'Rain Failed ⚠️',
      description: 'Rain can only be used in a server text channel.',
      color: 0xe74c3c,
    });
    await safeEditReply(interaction, { embeds: [embed] });
    return;
  }

  try {
    const recipients = await getRecentRecipients(interaction.channel, interaction.user.id, maxcount);

    console.log('Rain recipients:', recipients);

    if (recipients.length === 0) {
      const embed = buildEmbed({
        title: 'Rain Failed ⚠️',
        description: 'No recent users found in this channel.',
        color: 0xe74c3c,
      });
      await safeEditReply(interaction, { embeds: [embed] });
      return;
    }

    await ensureUser(interaction.user.id, interaction.user.username);

    const total = await applyTransfer({
      sender: { id: interaction.user.id, username: interaction.user.username },
      recipients,
      amountPer: amount,
      reason: 'rain',
    });

    console.log('Rain transfer total:', total);

    const recipientMentions = recipients.map((recipient) => `<@${recipient.id}>`);
    const listed = recipientMentions.slice(0, 10);
    const remaining = recipientMentions.length - listed.length;
    const listLines = listed.map(
      (mention) => `${EMOJI.slice} ${mention} +${amount} ${EMOJI.sats}`
    );
    if (remaining > 0) {
      listLines.push(`${EMOJI.slice} ... and ${remaining} more users`);
    }

    const otherRecipientNames = recipients.slice(10).map((recipient) => recipient.username);
    const footerText = otherRecipientNames.length
      ? truncateText(`Other users rained are: ${otherRecipientNames.join(', ')}`, 200)
      : null;

    const embed = new EmbedBuilder()
      .setColor(0x8e44ad)
      .setDescription(
        [
          `${EMOJI.rain} **Rain**`,
          `${interaction.user.toString()} is making it rain!`,
          '',
          `${EMOJI.peperain} **Rain Summary**`,
          `${EMOJI.purpleflame} Total Amount: ${formatSats(total)}`,
          `${EMOJI.purpleflame} Per User: ${formatSats(amount)}`,
          `${EMOJI.purpleflame} Recipients: ${recipients.length} users`,
          '',
          `${EMOJI.bump} **Lucky Recipients**`,
          listLines.join('\n'),
        ].join('\n')
      );

    if (footerText) {
      embed.setFooter({ text: footerText });
    }

    await safeEditReply(interaction, { embeds: [embed] });

    // Send DMs in parallel batches of 5 to respect Discord rate limits
    const DM_BATCH_SIZE = 5;
    for (let i = 0; i < recipients.length; i += DM_BATCH_SIZE) {
      const batch = recipients.slice(i, i + DM_BATCH_SIZE);
      await Promise.allSettled(
        batch.map(async (recipient) => {
          const user = await interaction.client.users.fetch(recipient.id);
          await sendDm(
            user,
            `${EMOJI.rain} ${interaction.user.toString()} rained you ${formatSats(amount)}`
          );
        })
      );
    }
  } catch (error) {
    const embed = buildEmbed({
      title: 'Rain Failed ⚠️',
      description: truncateText(error.message, 200),
      color: 0xe74c3c,
    });
    await safeEditReply(interaction, { embeds: [embed] });
  }
}

module.exports = { data, execute };
