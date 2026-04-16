const { createAntiDeleteHandler } = require("baileys");
const util = require("node:util");

module.exports = {
  register(sock) {
    const antiDeleteHandler = createAntiDeleteHandler(sock.store);
    sock.ev.on("messages.update", async (updates) => {
      const deletedMessages = antiDeleteHandler(updates);

      for (const info of deletedMessages) {
        try {
          if (info.key.fromMe || info.key.remoteJid.endsWith("@newsletter") || info.key.remoteJid.endsWith("@g.us") || info.key.remoteJid.endsWith("@broadcast")) continue //ignore channels or groups message
          await sock.sendMessage(info.key.remoteJid, { forward: info.originalMessage }, { quoted: info.originalMessage });
          await sock.sendImageAsSticker(info.key.remoteJid, "https://i.pinimg.com/736x/b9/ac/df/b9acdf09223d5535c07f45e026d18a1d.jpg");
          global.log?.info(`Anti-delete: forwarded message in ${info.key.remoteJid}`);
        } catch (err) {
          global.log?.error(`Anti-delete error: ${util.format(err)}`);
        }
      }
    });
  },
};