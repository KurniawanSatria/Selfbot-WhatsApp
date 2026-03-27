const fs = require("fs");
const { getContentType, downloadMediaMessage } = require("@innovatorssoft/baileys");
const { getRandom, convertToOgg } = require("../lib/helper");

module.exports = {
  name: "rvo",
  aliases: ["reavo", "viewonce", "vo"],
  description: "Buka pesan view once (image/video/audio)",
  cooldown:    5000,

  async run(sock, m, args, reply) {
    if (!m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
      return reply("❌ Reply pesan view once dulu!");
    }

    const quoted = m.message.extendedTextMessage.contextInfo;
    const quotedMsg = quoted.quotedMessage;
    const quotedType = getContentType(quotedMsg);

    const voTypes = ["imageMessage", "videoMessage", "audioMessage"];
    if (!voTypes.includes(quotedType)) {
      return reply("❌ Bukan pesan view once (image/video/audio)!");
    }

    const cloned = JSON.parse(JSON.stringify(quotedMsg));
    if (cloned[quotedType]?.viewOnce) cloned[quotedType].viewOnce = false;

    const fakeMsg = {
      key: {
        remoteJid: m.key.remoteJid,
        fromMe: false,
        id: quoted.stanzaId,
        participant: quoted.participant,
      },
      message: cloned,
    };

    try {
      const buffer = await downloadMediaMessage(fakeMsg, "buffer", {}, { logger: global.logger, reuploadRequest: sock.updateMediaMessage, });
      await sock.sendMessage(m.key.remoteJid, { forward: fakeMsg, contextInfo: { forwardingScore: 999, isForwarded: true } }, { quoted: m })
    } catch (e) {
      reply("❌ Gagal membuka view once: " + e.message);
    }
  },
};