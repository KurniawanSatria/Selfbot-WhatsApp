module.exports = {
  name: "sticker",
  aliases: ["s", "stiker", "stc"],
  description: "Convert images or videos into stickers",
  category: "media",
  cooldown: 5000,

  async run(sock, m, args, reply) {
    try {
      const quoted = m.quoted || m;
      const mime = (quoted.msg || quoted).mimetype || "";
      const qmsg = quoted.msg || quoted;

      const media = await sock.downloadMediaMessage(qmsg);

      if (/video/.test(mime)) {
        await sock.sendVideoAsSticker(m.chat, media, m);
      } else {
        await sock.sendImageAsSticker(m.chat, media, m);
      }
    } catch (err) {
      console.error("sticker error:", err.message);

      if (
        err.message.includes("duration") ||
        err.message.includes("too long")
      ) {
        return reply("╰─ Video exceeds the 9-second limit.");
      }

      return reply(`╰─ Failed to create sticker: ${err.message}`);
    }
  },
};
