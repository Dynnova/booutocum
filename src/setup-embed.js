require('dotenv').config();
const { REST, Routes, Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const SEARCH_CHANNEL_ID = process.env.CHANNEL_SEARCH;

async function sendPermanentEmbed() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  await client.login(process.env.DISCORD_TOKEN);
  await new Promise(r => client.once('ready', r));

  const channel = await client.channels.fetch(SEARCH_CHANNEL_ID);

  // Hapus pesan bot lama di channel
  const msgs = await channel.messages.fetch({ limit: 20 });
  for (const msg of msgs.values()) {
    if (msg.author.id === client.user.id) await msg.delete().catch(() => {});
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🎭 Cosplay Search')
    .setDescription(
      '**Cari cosplay dari galleryepic.xyz**\n\n' +
      '🔍 **Search** — Cari berdasarkan nama coser, karakter, atau series\n' +
      '📋 **List** — Lihat semua daftar cosplay\n\n' +
      '*Klik tombol di bawah untuk mulai*'
    )
    .setFooter({ text: 'galleryepic.xyz' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('open_search')
      .setLabel('🔍 Search')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setLabel('📋 List')
      .setStyle(ButtonStyle.Secondary)
      .setURL(`${process.env.WEB_URL || 'http://localhost:3000'}`),
  );

  const msg = await channel.send({ embeds: [embed], components: [row] });
  console.log(`✅ Embed permanen dikirim! Message ID: ${msg.id}`);
  console.log(`   Simpan ID ini di .env sebagai EMBED_MESSAGE_ID=${msg.id}`);

  await client.destroy();
}

sendPermanentEmbed().catch(console.error);
