const { SlashCommandBuilder } = require('discord.js');
const { query } = require('../db');
const { validateLightningAddress } = require('../services/lnurl');
const { ensureUser } = require('../services/wallet');
const { truncateText } = require('../utils/format');
const { buildEmbed, safeDeferReply, safeEditReply } = require('../utils/interactions');

const data = new SlashCommandBuilder()
  .setName('link')
  .setDescription('Link your Lightning address')
  .setDMPermission(true)
  .addStringOption((option) =>
    option
      .setName('address')
      .setDescription('Lightning address (name@domain)')
      .setRequired(true)
  );

async function execute(interaction) {
  const address = interaction.options.getString('address', true).trim();

  if (!(await safeDeferReply(interaction, { ephemeral: true }))) return;

  if (!address.includes('@')) {
    const embed = buildEmbed({
      title: 'Link Failed ⚠️',
      description: 'Invalid lightning address. Use name@domain.',
      color: 0xe74c3c,
    });
    await safeEditReply(interaction, { embeds: [embed] });
    return;
  }

  try {
    await ensureUser(interaction.user.id, interaction.user.username);
    await validateLightningAddress(address);
    await query('update users set lightning_address = $1 where discord_id = $2', [
      address,
      interaction.user.id,
    ]);

    const embed = buildEmbed({
      title: 'Address Linked ✅',
      description: `Linked ${address} for withdrawals.`,
      color: 0x2ecc71,
    });
    await safeEditReply(interaction, { embeds: [embed] });
  } catch (error) {
    const embed = buildEmbed({
      title: 'Link Failed ⚠️',
      description: truncateText(error.message, 200),
      color: 0xe74c3c,
    });
    await safeEditReply(interaction, { embeds: [embed] });
  }
}

module.exports = { data, execute };
