const {
  SlashCommandBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const QRCode = require('qrcode');
const crypto = require('crypto');
const { INVOICE_EXPIRY_SECONDS } = require('../config');
const { coinosRequest } = require('../services/coinos');
const { watchInvoice } = require('../services/depositWatcher');
const { ensureUser, recordInvoice } = require('../services/wallet');
const { truncateText, formatSats } = require('../utils/format');
const { buildEmbed, safeDeferReply, safeEditReply } = require('../utils/interactions');

const invoiceCache = new Map();

const data = new SlashCommandBuilder()
  .setName('deposit')
  .setDescription('Create a Lightning invoice to deposit funds')
  .setDMPermission(true)
  .addIntegerOption((option) =>
    option
      .setName('amount')
      .setDescription('Amount in satoshis')
      .setRequired(true)
      .setMinValue(1)
  );

async function execute(interaction) {
  const amount = interaction.options.getInteger('amount', true);

  if (!(await safeDeferReply(interaction, { ephemeral: true }))) return;

  try {
    const data = await coinosRequest('/invoice', 'POST', {
      invoice: {
        amount,
        type: 'lightning',
        expiry: INVOICE_EXPIRY_SECONDS,
      },
    });

    console.log('Deposit response:', data);

    const invoiceText = data && data.text ? data.text : 'Invoice created.';

    if (data && data.hash) {
      await ensureUser(interaction.user.id, interaction.user.username);
      await recordInvoice(interaction.user.id, amount, data.hash, data.text || null);
      watchInvoice(interaction.client, {
        hash: data.hash,
        amountSats: amount,
        discordId: interaction.user.id,
      });
    }

    let row;
    if (invoiceText) {
      const token = crypto.randomUUID();
      invoiceCache.set(token, { invoiceText, userId: interaction.user.id });
      setTimeout(() => invoiceCache.delete(token), 10 * 60 * 1000);

      row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`copy_invoice:${token}`)
          .setLabel('Copy Invoice')
          .setStyle(ButtonStyle.Primary)
      );
    }

    const invoiceField = {
      name: 'Invoice ⚡',
      value: `

\`${truncateText(invoiceText, 1000)}\``.trim(),
      inline: false,
    };

    const fields = [
      { name: 'Amount', value: formatSats(amount), inline: true },
      { name: 'Expires', value: `<t:${Math.floor(Date.now() / 1000) + INVOICE_EXPIRY_SECONDS}:R>`, inline: true },
      invoiceField,
    ];

    const embed = buildEmbed({
      title: 'Deposit Created ✅',
      description: 'Pay the invoice to credit your balance. You will get a DM once it is confirmed.',
      color: 0x2ecc71,
      fields,
    });

    if (invoiceText) {
      const qrBuffer = await QRCode.toBuffer(invoiceText, { width: 512, margin: 1 });
      const attachment = new AttachmentBuilder(qrBuffer, { name: 'invoice.png' });
      embed.setImage('attachment://invoice.png');
      await safeEditReply(interaction, { embeds: [embed], files: [attachment], components: row ? [row] : [] });
    } else {
      await safeEditReply(interaction, { embeds: [embed], components: row ? [row] : [] });
    }
  } catch (error) {
    const embed = buildEmbed({
      title: 'Deposit Failed ⚠️',
      description: truncateText(error.message, 200),
      color: 0xe74c3c,
    });
    await safeEditReply(interaction, { embeds: [embed] });
  }
}

async function handleCopyInvoiceButton(interaction) {
  const token = interaction.customId.replace('copy_invoice:', '');
  const cached = invoiceCache.get(token);
  if (!cached || cached.userId !== interaction.user.id) {
    await interaction.reply({
      content: 'Invoice expired. Please create a new deposit.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply({ content: cached.invoiceText, flags: MessageFlags.Ephemeral });
}

module.exports = {
  data,
  execute,
  handleCopyInvoiceButton,
};
