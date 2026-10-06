const { SlashCommandBuilder } = require('discord.js');
const { buildEmbed, safeDeferReply, safeEditReply } = require('../utils/interactions');

const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Show available commands')
  .setDMPermission(true);

async function execute(interaction) {
  if (!(await safeDeferReply(interaction, { ephemeral: true }))) return;

  const embed = buildEmbed({
    title: 'Help 📖',
    description: [
      '**/deposit amount** — Create a Lightning invoice + QR to add balance',
      '**/balance** — Show wallet balance and linked address',
      '**/history** — Show last 10 balance entries',
      '**/link address** — Link a Lightning address (name@domain)',
      '**/withdraw amount** — Withdraw to your linked Lightning address',
      '**/pay payreq** — Pay a Lightning invoice from your balance',
      '**$tip <@user> [<@user>...] <amount>** — Tip multiple users from your balance (public)',
      '**/tip user amount** — Tip a user from your balance (public). Tips, rain and minedrops accept up to 2 decimals, e.g. 0.25',
      '**/rain amount maxcount** — Rain sats on recent users in a channel',
      '**/leaderboard type** — Top makers or catchers',
    ].join('\n'),
    color: 0x9b59b6,
  });

  await safeEditReply(interaction, { embeds: [embed] });
}

module.exports = { data, execute };
