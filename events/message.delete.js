const util = require("node:util");

module.exports = {
  register(sock) {
    if (!sock._antiDeleteCache) sock._antiDeleteCache = new Map();

    function cacheMessage(msg) {
      const jid = msg.key?.remoteJid;
      if (!jid) return;
      if (!sock._antiDeleteCache.has(jid)) {
        sock._antiDeleteCache.set(jid, new Map());
      }
      const chatCache = sock._antiDeleteCache.get(jid);
      chatCache.set(msg.key.id, msg);
      if (chatCache.size > 200) {
        const firstKey = chatCache.keys().next().value;
        chatCache.delete(firstKey);
      }
    }

    async function handleRevoke(protocolMsg) {
      try {
        const protocolKey = protocolMsg.message?.protocolMessage?.key;
        if (!protocolKey?.id || !protocolKey?.remoteJid) return;

        const originalJid = protocolKey.remoteJid;
        const originalId = protocolKey.id;

        if (originalJid.endsWith("@newsletter") || originalJid.endsWith("@broadcast")) return;

        const originalMsg = sock._antiDeleteCache.get(originalJid)?.get(originalId);

        if (!originalMsg?.message) {
          global.log?.warn(`Anti-delete: cache miss (${originalId})`);
          return;
        }

        if (originalMsg.key.fromMe) return;

        global.log?.info(`Anti-delete: pesan dihapus di ${originalJid}`);

        await sock.sendMessage(originalJid, { forward: originalMsg });
      } catch (err) {
        global.log?.error(`Anti-delete error: ${util.format(err)}`);
      }
    }

    sock.ev.on("messages.upsert", ({ messages }) => {
      for (const msg of messages) {
        if (!msg.message || !msg.key?.id) continue;

        const protocol = msg.message.protocolMessage;
        if (protocol && (protocol.type === 0 || protocol.type === "REVOKE") && protocol.key?.id) {
          handleRevoke(msg);
          continue;
        }

        cacheMessage(msg);
      }
    });

    sock.ev.on("messages.update", async (updates) => {
      for (const update of updates) {
        try {
          if (update.update?.message !== null) continue;

          const key = update.key;
          if (!key?.remoteJid || !key?.id) continue;
          if (key.remoteJid.endsWith("@newsletter") || key.remoteJid.endsWith("@broadcast")) continue;

          const originalMsg = sock._antiDeleteCache.get(key.remoteJid)?.get(key.id);
          if (!originalMsg?.message) continue;
          if (originalMsg.key.fromMe) continue;

          global.log?.info(`Anti-delete: pesan dihapus di ${key.remoteJid}`);
          await sock.sendMessage(key.remoteJid, { forward: originalMsg });
        } catch (err) {
          global.log?.error(`Anti-delete error: ${util.format(err)}`);
        }
      }
    });
  },
};