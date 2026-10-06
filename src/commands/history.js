const { SlashCommandBuilder } = require('discord.js');
const { query } = require('../db');
const { ensureUser } = require('../services/wallet');
const { truncateText, formatReason } = require('../utils/format');
const { buildEmbed, safeDeferReply, safeEditReply } = require('../utils/interactions');
const { EMOJI } = require('../emoji');

const data = new SlashCommandBuilder()
  .setName('history')
  .setDescription('Show your recent balance activity')
  .setDMPermission(true);

async function execute(interaction) {
  if (!(await safeDeferReply(interaction, { ephemeral: true }))) return;

  try {
    await ensureUser(interaction.user.id, interaction.user.username);

    const history = await query(
      'select delta_sats, reason, created_at from balance_ledger where discord_id = $1 order by created_at desc limit 10',
      [interaction.user.id]
    );

    console.log('History rows:', history.rows);

    if (history.rows.length === 0) {
      const embed = buildEmbed({
        title: 'History 🧾',
        description: 'No balance activity yet.',
        color: 0x95a5a6,
      });
      await safeEditReply(interaction, { embeds: [embed] });
      return;
    }

    const lines = history.rows.map((entry) => {
      const delta = Number(entry.delta_sats);
      const signed = delta > 0 ? `+${delta}` : `${delta}`;
      const when = Math.floor(new Date(entry.created_at).getTime() / 1000);
      const direction = delta >= 0 ? EMOJI.in : EMOJI.out;
      return `• ${direction} ${signed} ${EMOJI.sats} — ${formatReason(entry.reason)} <t:${when}:R>`;
    });

    const embed = buildEmbed({
      title: 'History 🧾',
      description: truncateText(lines.join('\n'), 3900),
      color: 0xf2c14e,
    });

    await safeEditReply(interaction, { embeds: [embed] });
  } catch (error) {
    const embed = buildEmbed({
      title: 'History Failed ⚠️',
      description: truncateText(error.message, 200),
      color: 0xe74c3c,
    });
    await safeEditReply(interaction, { embeds: [embed] });
  }
}

module.exports = { data, execute };
