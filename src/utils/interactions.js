const { EmbedBuilder, MessageFlags } = require('discord.js');

async function safeDeferReply(interaction, options) {
  try {
    const deferOptions = options ? { ...options } : {};
    if (Object.prototype.hasOwnProperty.call(deferOptions, 'ephemeral')) {
      deferOptions.flags = deferOptions.ephemeral ? MessageFlags.Ephemeral : undefined;
      delete deferOptions.ephemeral;
    }

    await interaction.deferReply(deferOptions);
    return true;
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    console.error('deferReply failed:', message);
    return false;
  }
}

async function safeEditReply(interaction, payload) {
  try {
    if (interaction && typeof interaction.editReply === 'function') {
      await interaction.editReply(payload);
      return true;
    }

    if (interaction && typeof interaction.reply === 'function') {
      await interaction.reply(payload);
      return true;
    }

    console.error('editReply failed: no reply method available');
    return false;
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    console.error('editReply failed:', message);
    return false;
  }
}

function buildEmbed({ title, description, color, fields }) {
  const embed = new EmbedBuilder().setTitle(title).setColor(color);
  if (description) embed.setDescription(description);
  if (fields && fields.length > 0) embed.addFields(fields);
  return embed;
}

async function sendDm(user, content) {
  try {
    await user.send(content);
  } catch (error) {
    console.error('DM failed:', error.message);
  }
}

module.exports = {
  safeDeferReply,
  safeEditReply,
  buildEmbed,
  sendDm,
};
