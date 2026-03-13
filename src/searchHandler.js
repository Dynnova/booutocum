const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ComponentType,
  ChannelType,
} = require('discord.js');
const { searchCosplay, getStats } = require('./database');
const { getCachedThread, saveThreadCache, makeQueryKey } = require('./threadCache');

const TIMEOUT = 180_000;
const THREAD_CHANNEL_ID = process.env.THREAD_SEARCH;

// ─── Embeds & Buttons ─────────────────────────────────────────────────────────

function buildPreviewEmbed(item, idx, total) {
  const lines = [
    item.character ? `**Karakter:** ${item.character}` : null,
    item.parody    ? `**Series:** ${item.parody}`    : null,
    item.photo_count > 0 ? `**Foto:** ${item.photo_count}P` : null,
  ].filter(Boolean).join('\n');

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`🎭 ${item.coser || 'Unknown'}`)
    .setDescription(lines || '\u200b')
    .setImage(item.cover_url)
    .setURL(item.page_url)
    .setFooter({ text: `Hasil ${idx + 1} dari ${total}` });
}

function buildNavButtons(idx, total, cosplayId, hasCache) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('prev')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(idx === 0),
    new ButtonBuilder()
      .setCustomId('pageinfo')
      .setLabel(`${idx + 1} / ${total}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId('next')
      .setEmoji('▶️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(idx >= total - 1),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`view_${cosplayId}`)
      .setLabel(hasCache ? '🔗 Lihat Thread' : '👁️ Lihat')
      .setStyle(hasCache ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('close')
      .setLabel('✖')
      .setStyle(ButtonStyle.Secondary),
  );

  return [row1, row2];
}

// ─── Send images to thread ────────────────────────────────────────────────────

async function sendImagesToThread(thread, item, requester) {
  const headerEmbed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`🎭 ${item.coser || 'Unknown'}`)
    .setDescription([
      item.character ? `**Karakter:** ${item.character}` : null,
      item.parody    ? `**Series:** ${item.parody}`    : null,
      item.photo_count > 0 ? `**Total Foto:** ${item.photo_count}P` : null,
      `**Link:** [Buka di galleryepic](${item.page_url})`,
    ].filter(Boolean).join('\n'))
    .setThumbnail(item.cover_url)
    .setFooter({ text: `Diminta oleh ${requester.tag}` })
    .setTimestamp();

  await thread.send({ embeds: [headerEmbed] });

  try {
    const axios = require('axios');
    const cheerio = require('cheerio');

    const res = await axios.get(item.page_url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000,
    });

    const $ = cheerio.load(res.data);
    const imgUrls = [];
    const seen = new Set();

    $('img[src*="static.galleryepic.xyz/image"]').each((_, el) => {
      const src = $(el).attr('src');
      if (src && !seen.has(src) && !src.includes('/avatar/')) {
        seen.add(src); imgUrls.push(src);
      }
    });

    // Fallback UUID
    if (imgUrls.length < 5) {
      const matches = [...res.data.matchAll(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g)];
      for (const m of matches) {
        const url = `https://static.galleryepic.xyz/image/${m[0]}`;
        if (!seen.has(url)) { seen.add(url); imgUrls.push(url); }
      }
    }

    if (!imgUrls.length) { await thread.send('⚠️ Tidak ada gambar.'); return; }

    for (let i = 0; i < imgUrls.length; i++) {
      await thread.send({
        embeds: [new EmbedBuilder().setImage(imgUrls[i]).setFooter({ text: `${i + 1} / ${imgUrls.length}` })]
      });
      if (i < imgUrls.length - 1) await new Promise(r => setTimeout(r, 400));
    }

    await thread.send(`✅ **${imgUrls.length}** gambar dikirim.`);
  } catch (err) {
    await thread.send(`❌ Gagal load gambar: ${err.message}`);
  }
}

// ─── Handle search modal submit ───────────────────────────────────────────────

async function handleSearchSubmit(interaction) {
  const query = interaction.fields.getTextInputValue('search_input').trim();
  await interaction.deferReply({ ephemeral: true });

  const { results, total } = searchCosplay(query, 20, 0);

  if (!results.length) {
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xFF4444)
          .setTitle('❌ Tidak ditemukan')
          .setDescription(`Tidak ada hasil untuk **"${query}"**`)
          .setFooter({ text: `DB: ${getStats().total} cosplay` }),
      ],
    });
  }

  let idx = 0;
  const getItem = () => results[idx];
  const getCache = () => getCachedThread(makeQueryKey(getItem().id));

  const msg = await interaction.editReply({
    embeds: [buildPreviewEmbed(getItem(), idx, total)],
    components: buildNavButtons(idx, total, getItem().id, !!getCache()),
  });

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: TIMEOUT,
    filter: i => i.user.id === interaction.user.id,
  });

  collector.on('collect', async btn => {
    if (btn.customId === 'close') {
      collector.stop();
      await btn.update({ components: [] });
      return;
    }

    if (btn.customId === 'prev') idx = Math.max(0, idx - 1);
    else if (btn.customId === 'next') idx = Math.min(total - 1, idx + 1);
    else if (btn.customId.startsWith('view_')) {
      const cosplayId = parseInt(btn.customId.split('_')[1]);
      const item = getItem();
      const key = makeQueryKey(cosplayId);
      const existing = getCachedThread(key);

      if (existing) {
        await btn.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle('🔗 Thread sudah ada!')
              .setDescription(
                `Thread untuk **${item.coser}** sudah dibuat oleh <@${existing.creator_id}>.\n\n` +
                `➡️ <#${existing.thread_id}>`
              )
              .setThumbnail(item.cover_url),
          ],
          components: [],
        });
        collector.stop();
        return;
      }

      await btn.deferUpdate();

      try {
        const threadChannel = await btn.client.channels.fetch(THREAD_CHANNEL_ID);
        const threadName = `${item.coser || 'Unknown'}${item.character ? ` - ${item.character}` : ''}`.slice(0, 100);

        const thread = await threadChannel.threads.create({
          name: threadName,
          autoArchiveDuration: 1440,
          type: ChannelType.PublicThread,
          reason: `Diminta oleh ${interaction.user.tag}`,
        });

        saveThreadCache({
          queryKey: key,
          threadId: thread.id,
          threadName,
          creatorId: interaction.user.id,
          creatorTag: interaction.user.tag,
          cosplayId,
        });

        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle('✅ Thread dibuat!')
              .setDescription(`➡️ <#${thread.id}>\nDibuat oleh ${interaction.user.tag}`)
              .setThumbnail(item.cover_url),
          ],
          components: [],
        });

        await sendImagesToThread(thread, item, interaction.user);
        collector.stop();
      } catch (err) {
        await interaction.editReply({
          embeds: [new EmbedBuilder().setColor(0xFF4444).setTitle('❌ Gagal').setDescription(err.message)],
          components: [],
        });
      }
      return;
    }

    const item = getItem();
    await btn.update({
      embeds: [buildPreviewEmbed(item, idx, total)],
      components: buildNavButtons(idx, total, item.id, !!getCache()),
    });
  });

  collector.on('end', async (_, reason) => {
    if (reason === 'time') {
      try { await interaction.editReply({ components: [] }); } catch {}
    }
  });
}

// ─── Handle button interactions dari embed permanen ───────────────────────────

async function handlePermanentButton(interaction) {
  if (interaction.customId !== 'open_search') return;

  const modal = new ModalBuilder()
    .setCustomId('search_modal')
    .setTitle('🔍 Cari Cosplay');

  const input = new TextInputBuilder()
    .setCustomId('search_input')
    .setLabel('Nama coser, karakter, atau series')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('contoh: Velvet, Byoru, Genshin...')
    .setRequired(true)
    .setMinLength(2)
    .setMaxLength(100);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

module.exports = { handlePermanentButton, handleSearchSubmit };
