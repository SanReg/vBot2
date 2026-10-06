const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const crypto = require('crypto');
const {
  createMinedrop,
  setMinedropMessage,
  getMinedrop,
  listMinedrops,
  recordGuess,
  claimMinedrop,
  refundMinedrop,
} = require('../services/minedrops');
const { formatSats } = require('../utils/format');
const { safeDeferReply, safeEditReply, sendDm } = require('../utils/interactions');
const { EMOJI, EMOJI_ID } = require('../emoji');

// Square boards only; 25 is the most buttons a Discord message can hold.
const TILE_CHOICES = [
  { name: '2x2 (Easy)', value: 4 },
  { name: '3x3 (Normal)', value: 9 },
  { name: '4x4 (Skem)', value: 16 },
  { name: '5x5 (Super Skem)', value: 25 },
];
const DEFAULT_TILES = 9;
const DEFAULT_DURATION_MS = 5 * 60 * 1000;
const MIN_DURATION_MS = 60 * 1000;
const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
const EXPIRY_RETRY_MS = 30 * 1000;

const data = new SlashCommandBuilder()
  .setName('minedrop')
  .setDescription('Drop an amount to be mined by finding the right square')
  .setDMPermission(false)
  .addIntegerOption((option) =>
    option
      .setName('amount')
      .setDescription('Amount in satoshis')
      .setRequired(true)
      .setMinValue(1)
  )
  .addIntegerOption((option) =>
    option
      .setName('tiles')
      .setDescription('Board size (default 3x3)')
      .addChoices(...TILE_CHOICES)
  )
  .addStringOption((option) =>
    option
      .setName('duration')
      .setDescription('How long the drop stays open, e.g. 5m, 2h, 24h (default 5m, max 24h)')
  );

// Open drops live in the minedrops table; this only tracks the local expiry timers.
const expiryTimers = new Map();

function buildMinedropRows(drop, isEnded) {
  const guessed = new Set(drop.guessedIndices);
  const size = Math.sqrt(drop.tiles);
  const rows = [];
  let buttonIndex = 0;
  for (let i = 0; i < size; i++) {
    const row = new ActionRowBuilder();
    for (let j = 0; j < size; j++) {
      const btn = new ButtonBuilder().setCustomId(`minedrop:click:${drop.id}:${buttonIndex}`);

      if (isEnded) {
        btn.setDisabled(true);
        if (buttonIndex === drop.treasureIndex) {
          btn.setStyle(ButtonStyle.Success).setEmoji(EMOJI_ID.crown);
        } else if (guessed.has(buttonIndex)) {
          btn.setStyle(ButtonStyle.Danger).setEmoji(EMOJI_ID.mineMiss);
        } else {
          btn.setStyle(ButtonStyle.Secondary).setLabel('​');
        }
      } else if (guessed.has(buttonIndex)) {
        btn.setDisabled(true).setStyle(ButtonStyle.Danger).setEmoji(EMOJI_ID.mineMiss);
      } else {
        btn.setStyle(ButtonStyle.Secondary).setLabel('​');
      }
      row.addComponents(btn);
      buttonIndex++;
    }
    rows.push(row);
  }
  return rows;
}

// Parses "5m" / "2h" style input. Returns milliseconds, or null if it is not a duration between 1 minute and 24 hours.
function parseDuration(input) {
  if (!input) return DEFAULT_DURATION_MS;

  const match = /^(\d+)\s*(m|h)$/i.exec(input.trim());
  if (!match) return null;

  const unitMs = match[2].toLowerCase() === 'h' ? 60 * 60 * 1000 : 60 * 1000;
  const durationMs = Number(match[1]) * unitMs;
  if (durationMs < MIN_DURATION_MS || durationMs > MAX_DURATION_MS) return null;
  return durationMs;
}

function clearExpiry(dropId) {
  clearTimeout(expiryTimers.get(dropId));
  expiryTimers.delete(dropId);
}

function scheduleExpiry(client, dropId, expiresAt) {
  clearExpiry(dropId);
  const delay = Math.max(0, expiresAt.getTime() - Date.now());
  expiryTimers.set(
    dropId,
    setTimeout(async () => {
      expiryTimers.delete(dropId);
      try {
        await expireMinedrop(client, dropId);
      } catch (error) {
        // The drop is still in the table, so try again rather than leave the host's sats stranded.
        console.error('Failed to expire minedrop, will retry:', error.message);
        scheduleExpiry(client, dropId, new Date(Date.now() + EXPIRY_RETRY_MS));
      }
    }, delay)
  );
}

async function expireMinedrop(client, dropId) {
  const drop = await refundMinedrop(dropId);
  if (!drop) return;

  try {
    const host = await client.users.fetch(drop.hostId);
    await sendDm(
      host,
      `${EMOJI.mineMiss} Your minedrop expired unclaimed. ${formatSats(drop.amount)} was refunded to your balance.`
    );
  } catch (error) {
    console.error('Minedrop refund DM failed:', error.message);
  }

  if (!drop.messageId) return;

  try {
    const channel = await client.channels.fetch(drop.channelId);
    const message = await channel.messages.fetch(drop.messageId);
    const embed = new EmbedBuilder()
      .setTitle(`${EMOJI.mineMiss} Minedrop Expired`)
      .setDescription(`Time's up! ${drop.guessedIndices.length} people tried but no one found the treasure. The **${drop.amount}** ${EMOJI.sats} has been refunded to the host.\n\nHosted by <@${drop.hostId}>`)
      .setColor(0x2f3136);

    await message.edit({ embeds: [embed], components: buildMinedropRows(drop, true) });
  } catch (e) {
    console.error('Failed to update expired minedrop message:', e);
  }
}

// Re-arms the expiry timers after a restart; drops already past their time are refunded straight away.
async function resumeMinedrops(client) {
  for (const drop of await listMinedrops()) {
    scheduleExpiry(client, drop.id, drop.expiresAt);
  }
}

async function execute(interaction) {
  const amount = interaction.options.getInteger('amount', true);
  const tiles = interaction.options.getInteger('tiles') || DEFAULT_TILES;

  const durationMs = parseDuration(interaction.options.getString('duration'));

  if (!(await safeDeferReply(interaction))) return;

  if (durationMs === null) {
    await safeEditReply(interaction, {
      content: 'Invalid duration. Use minutes or hours between 1m and 24h, for example 5m, 2h or 24h.',
    });
    return;
  }

  const drop = {
    id: crypto.randomUUID(),
    hostId: interaction.user.id,
    amount,
    tiles,
    treasureIndex: Math.floor(Math.random() * tiles),
    channelId: interaction.channelId,
    guessedIndices: [],
    expiresAt: new Date(Date.now() + durationMs),
  };

  try {
    await createMinedrop({
      ...drop,
      host: { id: interaction.user.id, username: interaction.user.username },
    });
  } catch (error) {
    const insufficient = error.message === 'Insufficient balance.';
    if (!insufficient) console.error('Failed to create minedrop:', error.message);
    const message = insufficient
      ? `Insufficient balance. Needed **${formatSats(amount)}** ${EMOJI.sats}.`
      : 'Unable to reserve balance.';
    await safeEditReply(interaction, { content: message });
    return;
  }

  scheduleExpiry(interaction.client, drop.id, drop.expiresAt);

  const embed = new EmbedBuilder()
    .setTitle(`${EMOJI.bump} Minedrop Active`)
    .setDescription(`<@${interaction.user.id}> dropped **${amount}** ${EMOJI.sats}!\nClick a square to find the treasure. You only get one try!\nExpires <t:${Math.floor(drop.expiresAt.getTime() / 1000)}:R>`)
    .setColor(0x3498db);

  const sent = await safeEditReply(interaction, { embeds: [embed], components: buildMinedropRows(drop, false) });
  if (!sent) {
    // Nobody can see the board, so give the sats back now instead of in five minutes.
    scheduleExpiry(interaction.client, drop.id, new Date());
    return;
  }

  try {
    const msg = await interaction.fetchReply();
    if (msg && msg.id) await setMinedropMessage(drop.id, msg.id);
  } catch (e) {
    console.error('Failed to fetch minedrop reply', e);
  }
}

async function handleMinedropButton(interaction) {
  const parts = interaction.customId.split(':');
  const dropId = parts[2];
  const index = parseInt(parts[3], 10);

  // Acknowledge first: Discord allows 3 seconds and the checks below hit the database.
  await interaction.deferUpdate();
  const notify = (content) => interaction.followUp({ content, flags: MessageFlags.Ephemeral });

  const drop = await getMinedrop(dropId);
  if (!drop) {
    await notify('This minedrop is no longer active.');
    return;
  }

  if (drop.triedUsers.includes(interaction.user.id)) {
    await notify('You already tried a square!');
    return;
  }

  if (index === drop.treasureIndex) {
    const won = await claimMinedrop(dropId, { id: interaction.user.id, username: interaction.user.username }, index);
    if (!won) {
      await notify('This minedrop is no longer active.');
      return;
    }
    clearExpiry(dropId);

    await sendDm(
      interaction.user,
      `${EMOJI.pepecute} You found the treasure in <@${won.hostId}>'s minedrop and won ${formatSats(won.amount)}`
    );

    const embed = new EmbedBuilder()
      .setTitle(`${EMOJI.pepecute} Minedrop Claimed`)
      .setDescription(`<@${interaction.user.id}> found the treasure of **${won.amount}** ${EMOJI.sats}!\nHosted by <@${won.hostId}>`)
      .setColor(0x2ecc71);

    await interaction.message.edit({ embeds: [embed], components: buildMinedropRows(won, true) });
    return;
  }

  const updated = await recordGuess(dropId, interaction.user.id, index);
  if (!updated) {
    const still = await getMinedrop(dropId);
    await notify(still ? 'You already tried a square!' : 'This minedrop is no longer active.');
    return;
  }

  await interaction.message.edit({ components: buildMinedropRows(updated, false) });
}

module.exports = {
  data,
  execute,
  handleMinedropButton,
  resumeMinedrops,
  parseDuration,
};
