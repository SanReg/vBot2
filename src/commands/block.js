const { SlashCommandBuilder } = require('discord.js');
const { MAX_BLOCKS, addBlock, removeBlock, listBlocks } = require('../services/blocks');
const { truncateText } = require('../utils/format');
const { buildEmbed, safeDeferReply, safeEditReply } = require('../utils/interactions');

const data = new SlashCommandBuilder()
  .setName('block')
  .setDescription('Exclude users from your rains, drops and minedrops')
  .setDMPermission(true)
  .addSubcommand((subcommand) =>
    subcommand
      .setName('add')
      .setDescription('Block a user from your rains, drops and minedrops')
      .addUserOption((option) =>
        option
          .setName('user')
          .setDescription('User to block')
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('remove')
      .setDescription('Unblock a user')
      .addUserOption((option) =>
        option
          .setName('user')
          .setDescription('User to unblock')
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('list')
      .setDescription('Show your blocklist')
  );

async function add(interaction) {
  const target = interaction.options.getUser('user', true);

  if (target.bot) {
    return { title: 'Block Failed ⚠️', description: 'Bots never receive rain or play minedrops.', color: 0xe74c3c };
  }
  if (target.id === interaction.user.id) {
    return { title: 'Block Failed ⚠️', description: 'You cannot block yourself.', color: 0xe74c3c };
  }

  const outcome = await addBlock(
    { id: interaction.user.id, username: interaction.user.username },
    { id: target.id, username: target.username }
  );

  if (outcome === 'full') {
    return {
      title: 'Block Failed ⚠️',
      description: `Your blocklist is full (${MAX_BLOCKS} users). Remove someone first.`,
      color: 0xe74c3c,
    };
  }
  if (outcome === 'exists') {
    return { title: 'Already Blocked', description: `${target.toString()} is already on your blocklist.`, color: 0x95a5a6 };
  }
  return {
    title: 'User Blocked ✅',
    description: `${target.toString()} will be skipped by your rains and drops and cannot play your minedrops.`,
    color: 0x2ecc71,
  };
}

async function remove(interaction) {
  const target = interaction.options.getUser('user', true);
  const removed = await removeBlock(interaction.user.id, target.id);

  if (!removed) {
    return { title: 'Not Blocked', description: `${target.toString()} is not on your blocklist.`, color: 0x95a5a6 };
  }
  return { title: 'User Unblocked ✅', description: `${target.toString()} was removed from your blocklist.`, color: 0x2ecc71 };
}

async function list(interaction) {
  const blocks = await listBlocks(interaction.user.id);

  if (blocks.length === 0) {
    return { title: 'Blocklist', description: 'Your blocklist is empty.', color: 0x95a5a6 };
  }

  const lines = blocks.map((block) => `• <@${block.id}> (${block.username})`);
  return {
    title: `Blocklist (${blocks.length}/${MAX_BLOCKS})`,
    description: truncateText(lines.join('\n'), 3900),
    color: 0x3498db,
  };
}

const subcommands = { add, remove, list };

async function execute(interaction) {
  if (!(await safeDeferReply(interaction, { ephemeral: true }))) return;

  try {
    const result = await subcommands[interaction.options.getSubcommand()](interaction);
    await safeEditReply(interaction, { embeds: [buildEmbed(result)] });
  } catch (error) {
    const embed = buildEmbed({
      title: 'Block Failed ⚠️',
      description: truncateText(error.message, 200),
      color: 0xe74c3c,
    });
    await safeEditReply(interaction, { embeds: [embed] });
  }
}

module.exports = { data, execute };
