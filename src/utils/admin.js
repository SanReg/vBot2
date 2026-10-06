const { EmbedBuilder, MessageFlags } = require('discord.js');
const { truncateText } = require('./format');
const { buildEmbed, safeEditReply } = require('./interactions');

const ADMIN_DISCORD_IDS = ['870144657865191455', '534818361914425374', '499232799744720896'];

function isAuthorized(interaction) {
  return interaction && interaction.user && ADMIN_DISCORD_IDS.includes(interaction.user.id);
}

function denyEmbed() {
  return new EmbedBuilder()
    .setTitle('Admin Access Denied')
    .setDescription('You are not authorized to use this command.')
    .setColor(0xe74c3c);
}

function isInteractionGoneError(error) {
  const code = error && error.code ? Number(error.code) : 0;
  return code === 10062 || code === 40060 || code === 10015;
}

// Runs an admin command handler and reports any failure back to the caller.
async function runAdminCommand(interaction, { label, title }, handler) {
  try {
    await handler(interaction);
  } catch (error) {
    console.error(`${label} command failed:`, error.message);
    const embed = buildEmbed({
      title,
      description: truncateText(error.message, 200),
      color: 0xe74c3c,
    });

    try {
      if (interaction.deferred || interaction.replied) {
        await safeEditReply(interaction, { embeds: [embed], components: [] });
      } else {
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }
    } catch (responseError) {
      console.error(`Failed to send ${label.toLowerCase()} error response:`, responseError.message);
    }
  }
}

module.exports = {
  ADMIN_DISCORD_IDS,
  isAuthorized,
  denyEmbed,
  isInteractionGoneError,
  runAdminCommand,
};
