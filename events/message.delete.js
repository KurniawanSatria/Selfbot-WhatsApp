const {createAntiDeleteHandler} = require("@innovatorssoft/baileys");
const util = require("node:util");

module.exports = {
  register(sock) {
    const antiDeleteHandler = createAntiDeleteHandler(sock.store);
    sock.ev.on("messages.update", async (updates) => {
      const deletedMessages = antiDeleteHandler(updates);

      for (const info of deletedMessages) {
        try {
          if (info.key.remoteJid.endsWith("@newsletter")) continue
          await sock.copyNForward(info.key.remoteJid, info.originalMessage, true);
          global.log?.info(`Anti-delete: forwarded message in ${info.key.remoteJid}`);
        } catch (err) {
          global.log?.error(`Anti-delete error: ${util.format(err)}`);
        }
      }
    });
  },
};