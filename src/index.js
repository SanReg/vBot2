const { Client, GatewayIntentBits } = require('discord.js');
const { DISCORD_TOKEN } = require('./config');

const events = [require('./events/clientReady'), require('./events/interactionCreate')];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
  ],
});

for (const event of events) {
  if (event.once) {
    client.once(event.name, event.execute);
  } else {
    client.on(event.name, event.execute);
  }
}

client.on('error', (error) => {
  console.error('Discord client error:', error);
});

client.login(DISCORD_TOKEN);
