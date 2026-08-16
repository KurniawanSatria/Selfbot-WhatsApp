const fs = require("fs");
const path = require("path");
const { downloadMediaMessage, getContentType } = require("baileys");

const BOT_ROOT = path.join(__dirname, "..");
const SAVE_DIR = path.join(BOT_ROOT, "data", "files");

function ensureDir() {
  fs.mkdirSync(SAVE_DIR, { recursive: true });
}

function extForType(type) {
  switch (type) {
    case "imageMessage": return "jpg";
    case "videoMessage": return "mp4";
    case "audioMessage": return "mp3";
    case "stickerMessage": return "webp";
    case "documentMessage": return "bin";
    default: return "bin";
  }
}

module.exports = {
  name: "savefile",
  aliases: ["sf", "save"],
  cooldown: 5000,
  owner: true,
  description: "Save media (reply) to data/files/ on the server.",

  async run(sock, m, args, reply, chat) {
    ensureDir();
    const ctx = m.message?.extendedTextMessage?.contextInfo;
    let targetMsg, targetType, fileNameHint;
    if (ctx?.quotedMessage) {
      targetMsg = {
        key: { remoteJid: m.key.remoteJid, fromMe: false, id: ctx.stanzaId, participant: ctx.participant },
        message: ctx.quotedMessage,
      };
      targetType = getContentType(ctx.quotedMessage);
      fileNameHint = ctx.quotedMessage?.documentMessage?.fileName;
    } else {
      targetMsg = m;
      targetType = getContentType(m.message);
      fileNameHint = m.message?.documentMessage?.fileName;
    }

    const isMedia = ["imageMessage", "videoMessage", "audioMessage", "stickerMessage", "documentMessage"].includes(targetType);
    if (!isMedia) return reply("❌ Reply to a media message (image/video/audio/document/sticker)!");

    try {
      const buf = await downloadMediaMessage(targetMsg, "buffer", {}, {
        logger: global.logger,
        reuploadRequest: sock.updateMediaMessage,
      });
      if (!buf) return reply("❌ Failed to download media.");

      const ext = fileNameHint ? path.extname(fileNameHint) || "." + extForType(targetType) : "." + extForType(targetType);
      const base = (args[0] || Date.now().toString()).replace(/[^a-z0-9_-]/gi, "_");
      const finalName = `${base}${ext}`;
      const finalPath = path.join(SAVE_DIR, finalName);
      fs.writeFileSync(finalPath, buf);

      const sizeKB = (buf.length / 1024).toFixed(1);
      await reply(`✅ *File saved*\n\n📄 Name: ${finalName}\n💾 Size: ${sizeKB} KB\n📂 Location: data/files/`);
    } catch (err) {
      console.error("savefile error:", err);
      reply("❌ Failed to save: " + err.message);
    }
  },
};
