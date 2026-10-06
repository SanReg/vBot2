const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { truncateText } = require('../utils/format');
const { setCustomStatus } = require('../utils/status');
const { isAuthorized, denyEmbed, isInteractionGoneError, runAdminCommand } = require('../utils/admin');

const data = new SlashCommandBuilder()
  .setName('changestatus')
  .setDescription('Change bot activity type and text (admin only)')
  .setDMPermission(true)
  .addStringOption((option) =>
    option
      .setName('type')
      .setDescription('Activity type')
      .addChoices(
        { name: 'Playing', value: 'Playing' },
        { name: 'Streaming', value: 'Streaming' },
        { name: 'Listening', value: 'Listening' },
        { name: 'Watching', value: 'Watching' },
        { name: 'Competing', value: 'Competing' }
      )
      .setRequired(true)
  )
  .addStringOption((option) =>
    option.setName('name').setDescription('Activity text').setRequired(true)
  );

async function handleChangeStatusCommand(interaction) {
  if (!isAuthorized(interaction)) {
    try {
      await interaction.reply({ embeds: [denyEmbed()], flags: MessageFlags.Ephemeral });
    } catch (error) {
      if (!isInteractionGoneError(error)) {
        throw error;
      }
    }
    return;
  }

  const typeName = interaction.options.getString('type', true);
  const name = interaction.options.getString('name', true);

  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  } catch (error) {
    if (isInteractionGoneError(error)) return;
    throw error;
  }

  try {
    setCustomStatus(interaction.client, typeName, name);
    const embed = new EmbedBuilder()
      .setTitle('Status Updated')
      .setDescription(`Activity set to **${typeName}**: ${name}`)
      .setColor(0x2ecc71);
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Failed to change status:', error.message);
    const embed = new EmbedBuilder()
      .setTitle('Change Status Failed')
      .setDescription(truncateText(error.message, 200))
      .setColor(0xe74c3c);
    try {
      await interaction.editReply({ embeds: [embed] });
    } catch (responseError) {
      if (!isInteractionGoneError(responseError)) throw responseError;
    }
  }
}

async function execute(interaction) {
  await runAdminCommand(interaction, { label: 'Change status', title: 'Change Status Failed ⚠️' }, handleChangeStatusCommand);
}

module.exports = { data, execute };
