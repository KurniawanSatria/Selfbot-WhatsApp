const {
  MessageStore,
  createMessageStoreHandler,
  createAntiDeleteHandler,
} = require("@innovatorssoft/baileys");
const util = require("node:util");

const store = new MessageStore({ maxMessagesPerChat: 100, ttl: 24 * 60 * 60 * 1000 });

module.exports = {
  register(sock) {
    sock.ev.on("messages.upsert", createMessageStoreHandler(store));

    const antiDeleteHandler = createAntiDeleteHandler(store);

    sock.ev.on("messages.update", async (updates) => {
      const deletedMessages = antiDeleteHandler(updates);

      for (const info of deletedMessages) {
        try {
          if (info.key.remoteJid.endsWith("@newsletter")) continue
          await sock.copyNForward(info.key.remoteJid, {
            forward: info.originalMessage,
            contextInfo: { forwardingScore: 999, isForwarded: true },
          });
          global.log?.info(`Anti-delete: forwarded message in ${info.key.remoteJid}`);
        } catch (err) {
          global.log?.error(`Anti-delete error: ${util.format(err)}`);
        }
      }
    });
  },
};