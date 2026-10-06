const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBlockedIds } = require('../services/blocks');
const { ensureUser, applyTransfer } = require('../services/wallet');
const { truncateText, formatSats } = require('../utils/format');
const { MIN_AMOUNT, INVALID_AMOUNT_MESSAGE, parseAmount } = require('../utils/amount');
const { buildEmbed, safeDeferReply, safeEditReply, sendDm } = require('../utils/interactions');
const { EMOJI } = require('../emoji');

const MAX_RECIPIENTS = 50;

const data = new SlashCommandBuilder()
  .setName('drop')
  .setDescription('Send sats to everyone who reacted to a message')
  .setDMPermission(false)
  .addNumberOption((option) =>
    option
      .setName('amount')
      .setDescription('Amount per user in satoshis (up to 2 decimals)')
      .setRequired(true)
      .setMinValue(MIN_AMOUNT)
  )
  .addStringOption((option) =>
    option
      .setName('messageid')
      .setDescription('ID or link of the message people reacted to')
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName('reaction')
      .setDescription('Only count this emoji (default: any reaction)')
  );

// Accepts a bare message ID or a message link. Returns { channelId, messageId } or null.
function parseMessageRef(input) {
  const text = input.trim();

  const link = /channels\/\d+\/(\d{15,21})\/(\d{15,21})\/?$/.exec(text);
  if (link) return { channelId: link[1], messageId: link[2] };

  if (/^\d{15,21}$/.test(text)) return { channelId: null, messageId: text };
  return null;
}

// Unicode emojis can arrive with or without the variation selector, so compare without it.
function normalizeEmoji(value) {
  return value.replace(/️/g, '');
}

// Matches a reaction against what the user typed: a unicode emoji, <:name:id>, :name:, a bare name or an ID.
function matchesReaction(reaction, input) {
  const wanted = input.trim();
  const custom = /^<a?:(\w+):(\d+)>$/.exec(wanted);

  if (reaction.emoji.id) {
    if (custom) return reaction.emoji.id === custom[2];
    return reaction.emoji.id === wanted || reaction.emoji.name === wanted.replace(/^:|:$/g, '');
  }
  return !custom && normalizeEmoji(reaction.emoji.name || '') === normalizeEmoji(wanted);
}

async function getReactors(reactions, { excludeId, blockedIds, limit }) {
  const recipients = [];
  const seen = new Set();

  for (const reaction of reactions) {
    let after;
    while (recipients.length < limit) {
      const batch = await reaction.users.fetch({ limit: 100, after });
      if (batch.size === 0) break;
      after = batch.last().id;

      for (const user of batch.values()) {
        if (user.bot) continue;
        if (user.id === excludeId) continue;
        if (blockedIds.has(user.id)) continue;
        if (seen.has(user.id)) continue;

        seen.add(user.id);
        recipients.push({ id: user.id, username: user.username });

        if (recipients.length >= limit) break;
      }

      if (batch.size < 100) break;
    }

    if (recipients.length >= limit) break;
  }

  return recipients;
}

function fail(interaction, description) {
  const embed = buildEmbed({ title: 'Drop Failed ⚠️', description, color: 0xe74c3c });
  return safeEditReply(interaction, { embeds: [embed] });
}

async function execute(interaction) {
  const amount = parseAmount(interaction.options.getNumber('amount', true));
  const messageRef = parseMessageRef(interaction.options.getString('messageid', true));
  const reactionInput = interaction.options.getString('reaction');

  if (!(await safeDeferReply(interaction, { ephemeral: false }))) return;

  if (amount === null) {
    await fail(interaction, INVALID_AMOUNT_MESSAGE);
    return;
  }

  if (!messageRef) {
    await fail(interaction, 'Invalid message. Use a message ID or a message link.');
    return;
  }

  if (!interaction.inGuild() || !interaction.channel || !interaction.channel.isTextBased()) {
    await fail(interaction, 'Drop can only be used in a server text channel.');
    return;
  }

  try {
    let message;
    try {
      const channel =
        messageRef.channelId && messageRef.channelId !== interaction.channelId
          ? await interaction.client.channels.fetch(messageRef.channelId)
          : interaction.channel;
      if (!channel || !channel.isTextBased() || channel.guildId !== interaction.guildId) {
        throw new Error('Message is not in this server.');
      }
      // force: reactions on a cached message are not kept up to date.
      message = await channel.messages.fetch({ message: messageRef.messageId, force: true });
    } catch (error) {
      await fail(interaction, 'Message not found. Run this in the same channel as the message, or use a message link.');
      return;
    }

    const allReactions = [...message.reactions.cache.values()];
    const reactions = reactionInput
      ? allReactions.filter((reaction) => matchesReaction(reaction, reactionInput))
      : allReactions;

    if (reactions.length === 0) {
      await fail(
        interaction,
        reactionInput ? `Nobody reacted with ${reactionInput} on that message.` : 'That message has no reactions.'
      );
      return;
    }

    const blockedIds = await getBlockedIds(interaction.user.id);
    const recipients = await getReactors(reactions, {
      excludeId: interaction.user.id,
      blockedIds,
      limit: MAX_RECIPIENTS,
    });

    console.log('Drop recipients:', recipients);

    if (recipients.length === 0) {
      await fail(interaction, 'No eligible users reacted to that message.');
      return;
    }

    await ensureUser(interaction.user.id, interaction.user.username);

    const total = await applyTransfer({
      sender: { id: interaction.user.id, username: interaction.user.username },
      recipients,
      amountPer: amount,
      reason: 'drop',
    });

    console.log('Drop transfer total:', total);

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
    const footerParts = [];
    if (recipients.length === MAX_RECIPIENTS) footerParts.push(`Limited to the first ${MAX_RECIPIENTS} users.`);
    if (otherRecipientNames.length) footerParts.push(`Other users dropped are: ${otherRecipientNames.join(', ')}`);

    const embed = new EmbedBuilder()
      .setColor(0x8e44ad)
      .setDescription(
        [
          `${EMOJI.bump} **Drop**`,
          `${interaction.user.toString()} dropped sats on everyone who reacted${reactionInput ? ` with ${reactionInput}` : ''} to [this message](${message.url})!`,
          '',
          `${EMOJI.peperain} **Drop Summary**`,
          `${EMOJI.purpleflame} Total Amount: ${formatSats(total)}`,
          `${EMOJI.purpleflame} Per User: ${formatSats(amount)}`,
          `${EMOJI.purpleflame} Recipients: ${recipients.length} users`,
          '',
          `${EMOJI.bump} **Lucky Recipients**`,
          listLines.join('\n'),
        ].join('\n')
      );

    if (footerParts.length) {
      embed.setFooter({ text: truncateText(footerParts.join(' '), 300) });
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
            `${EMOJI.bump} ${interaction.user.toString()} dropped you ${formatSats(amount)}`
          );
        })
      );
    }
  } catch (error) {
    await fail(interaction, truncateText(error.message, 200));
  }
}

module.exports = { data, execute, parseMessageRef, matchesReaction };
