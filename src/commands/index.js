const { REST, Routes } = require('discord.js');
const { DISCORD_TOKEN, DISCORD_CLIENT_ID, GUILD_IDS } = require('../config');

// Order here is the order commands are registered with Discord.
const commandModules = [
  require('./deposit'),
  require('./withdraw'),
  require('./balance'),
  require('./tip'),
  require('./rain'),
  require('./drop'),
  require('./history'),
  require('./leaderboard'),
  require('./help'),
  require('./link'),
  require('./pay'),
  require('./minedrop'),
  require('./block'),
  require('./admin'),
  require('./userstats'),
  require('./changestatus'),
];

const commands = new Map(commandModules.map((command) => [command.data.name, command]));

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

async function registerCommands() {
  const body = commandModules.map((command) => command.data.toJSON());

  await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), { body });
  console.log('Registered global slash commands.');

  for (const guildId of GUILD_IDS) {
    await rest.put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID, guildId), { body });
    console.log(`Registered guild slash commands for ${guildId}.`);
  }
}

module.exports = { commands, registerCommands };
