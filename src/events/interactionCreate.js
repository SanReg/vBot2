const { MessageFlags } = require('discord.js');
const { commands } = require('../commands');
const { handleCopyInvoiceButton } = require('../commands/deposit');
const { handleMinedropButton } = require('../commands/minedrop');
const { handleAdminWithdrawalsButton } = require('../commands/admin');
const { BLOCKLIST_BUTTON_PREFIX, handleUserBlocklistButton } = require('../commands/userstats');
const { safeEditReply } = require('../utils/interactions');

async function handleButton(interaction) {
  const customId = interaction.customId || '';

  if (customId.startsWith('copy_invoice:')) {
    await handleCopyInvoiceButton(interaction);
    return;
  }

  if (customId.startsWith('minedrop:click:')) {
    await handleMinedropButton(interaction);
    return;
  }

  if (customId.startsWith(BLOCKLIST_BUTTON_PREFIX)) {
    await handleUserBlocklistButton(interaction);
    return;
  }

  try {
    await handleAdminWithdrawalsButton(interaction);
  } catch (error) {
    console.error('Admin button failed:', error.message);
    if (interaction.deferred || interaction.replied) {
      await safeEditReply(interaction, {
        content: 'Failed to load recent withdrawals.',
        components: [],
      });
    } else {
      await interaction.reply({
        content: 'Failed to load recent withdrawals.',
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}

// An error escaping this listener would take the whole process down.
async function execute(interaction) {
  try {
    await handleInteraction(interaction);
  } catch (error) {
    console.error('Interaction failed:', error);
    try {
      if (interaction.isRepliable() && !interaction.deferred && !interaction.replied) {
        await interaction.reply({
          content: 'Something went wrong. Please try again.',
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (responseError) {
      console.error('Failed to send error response:', responseError.message);
    }
  }
}

async function handleInteraction(interaction) {
  if (interaction.isButton()) {
    await handleButton(interaction);
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  console.log(`Command: ${interaction.commandName} from ${interaction.user.tag}`);

  const command = commands.get(interaction.commandName);
  if (command) await command.execute(interaction);
}

module.exports = { name: 'interactionCreate', execute };
