const { PREFIX } = require("../config");
const path = require("path");
const fs = require("fs");
const { sendAudio, getBuffer } = require("../lib/helper");

module.exports = {
  name: "help",
  aliases: ["menu", "?"],
  description: "Tampilkan daftar command",
  cooldown:    5000,

  async run(sock, m, args, reply) {
    const jid = m.key.remoteJid; // ← dari m, bukan parameter
    const cmdDir = path.join(__dirname);

    const lines = fs
      .readdirSync(cmdDir)
      .filter((f) => f.endsWith(".js"))
      .map((f) => {
        const mod = require(path.join(cmdDir, f));
        const aliases = mod.aliases?.length ? ` (${mod.aliases.join(", ")})` : "";
        return `- ${PREFIX}${mod.name.padEnd(8)}${aliases} — ${mod.description || ""}`;
      })
      .join("\n");

    await sock.sendMessage(jid, {
      product: {
        productImage: {
          url: 'https://i.pinimg.com/736x/8d/96/81/8d9681919aeb93322479c0b44cc6249e.jpg'
        },
        productId: '836xxx',
        title: 'Saturia.',
        description: lines,
        currencyCode: 'IDR',
        priceAmount1000: 12121212,
        retailerId: 'innovatorssoftn',
        url: 'https://example.com',
        productImageCount: 1
      },
      businessOwnerJid: '6282170988479@s.whatsapp.net',
      caption: lines,
      title: "",
      footer: "Saturia.",
      interactiveButtons: [
        {
          name: 'cta_copy',
          buttonParamsJson: JSON.stringify({
            display_text: '🥀',
            copy_code: 'Saturia.'
          })
        },
      ],
        }, { quoted: m });

    const num = Math.floor(Math.random() * 43) + 1;
    const url = `https://raw.githubusercontent.com/KurniawanSatria/audio/main/galau/audio_0${num}.mp3`;

    await sock.sendAudio(jid, await getBuffer(url),{ptt:true});
  },
};