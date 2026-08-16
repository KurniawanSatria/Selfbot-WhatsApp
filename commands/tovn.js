const { downloadMediaMessage, getContentType } = require("baileys");
const { sendAudio, getBuffer } = require("../lib/helper");

module.exports = {
    name: "toptt",
    aliases: ["tovn"],
    description: "Convert audio to voice note (PTT)",
    category: "media",
    cooldown: 5000,
    async run(sock, m, args, reply) {
        try {
            const ctx = m.message?.extendedTextMessage?.contextInfo;
            let targetMsg;
            let targetType;
            if (ctx?.quotedMessage) {
                targetMsg = { key: { remoteJid: m.key.remoteJid, fromMe: false, id: ctx.stanzaId, participant: ctx.participant }, message: ctx.quotedMessage };
                targetType = getContentType(ctx.quotedMessage);
            } else {
                targetMsg = m;
                targetType = getContentType(m.message);
            }
            const isAudio = targetType === "audioMessage";
            if (!isAudio) return reply("❌ Reply to an audio message!");
            const media = await downloadMediaMessage(targetMsg, "buffer", {}, { logger: global.logger, reuploadRequest: sock.updateMediaMessage });
            await sendAudio(sock, m.key.remoteJid, media, true, { quoted: m })
        } catch (err) {
            console.error("sticker error:", err.message);
            reply("❌ Conversion failed: " + err.message);
        }
    },
};