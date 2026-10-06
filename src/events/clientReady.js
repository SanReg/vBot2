const { registerCommands } = require('../commands');
const { resumeMinedrops } = require('../commands/minedrop');
const { resumePendingInvoices } = require('../services/depositWatcher');
const { setBotStatus } = require('../utils/status');

async function execute(client) {
  console.log(`Logged in as ${client.user.tag}`);
  setBotStatus(client);
  try {
    await registerCommands();
  } catch (error) {
    console.error('Failed to register commands:', error);
  }
  try {
    await resumePendingInvoices(client);
  } catch (error) {
    console.error('Failed to resume pending deposits:', error);
  }
  try {
    await resumeMinedrops(client);
  } catch (error) {
    console.error('Failed to resume minedrops:', error);
  }
}

module.exports = { name: 'clientReady', once: true, execute };
