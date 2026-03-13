require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { handlePermanentButton, handleSearchSubmit } = require('./searchHandler');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    // Tombol Search di embed permanen
    if (interaction.isButton()) {
      await handlePermanentButton(interaction);
      return;
    }

    // Submit modal search
    if (interaction.isModalSubmit() && interaction.customId === 'search_modal') {
      await handleSearchSubmit(interaction);
      return;
    }
  } catch (err) {
    console.error('❌ Interaction error:', err);
  }
});

client.once(Events.ClientReady, c => {
  console.log(`\n🤖 Bot ready! ${c.user.tag}`);
  console.log(`🔍 Search channel : ${process.env.CHANNEL_SEARCH}`);
  console.log(`🧵 Thread channel : ${process.env.THREAD_SEARCH}`);
  console.log(`🌐 Web list URL   : ${process.env.WEB_URL || 'http://localhost:3000'}`);
  c.user.setActivity('🔍 cosplay search');
});

client.login(process.env.DISCORD_TOKEN);
