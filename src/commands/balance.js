const { SlashCommandBuilder } = require('discord.js');
const { query } = require('../db');
const { ensureUser } = require('../services/wallet');
const { truncateText, formatNumber } = require('../utils/format');
const { buildEmbed, safeDeferReply, safeEditReply } = require('../utils/interactions');
const { EMOJI } = require('../emoji');

const data = new SlashCommandBuilder()
  .setName('balance')
  .setDescription('Show your current balance')
  .setDMPermission(true);

async function execute(interaction) {
  if (!(await safeDeferReply(interaction, { ephemeral: true }))) return;

  try {
    await ensureUser(interaction.user.id, interaction.user.username);
    const balanceResult = await query(
      'select balance_sats, lightning_address from users where discord_id = $1',
      [interaction.user.id]
    );
    console.log('Balance query result:', balanceResult.rows);
    const balanceRow = balanceResult.rows[0];
    const balance = balanceRow ? balanceRow.balance_sats : 0;
    const linkedAddress = balanceRow ? balanceRow.lightning_address : null;

    const descriptionLines = [
      `Balance:\n${formatNumber(balance)} ${EMOJI.sats}`,
    ];
    if (linkedAddress) {
      descriptionLines.push(`\n${EMOJI.pepecute} Linked Address:\n*${linkedAddress}*`);
    }

    const embed = buildEmbed({
      title: `${EMOJI.wallet}  |  Wallet`,
      description: descriptionLines.join('\n'),
      color: 0x3498db,
    });
    embed.setFooter({ text: '*Use /history to see recent transactions*' });
    await safeEditReply(interaction, { embeds: [embed] });
  } catch (error) {
    const embed = buildEmbed({
      title: 'Balance Failed ⚠️',
      description: truncateText(error.message, 200),
      color: 0xe74c3c,
    });
    await safeEditReply(interaction, { embeds: [embed] });
  }
}

module.exports = { data, execute };
