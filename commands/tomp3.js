const { downloadMediaMessage, getContentType } = require("baileys");
const { sendAudio, getBuffer } = require("../lib/helper");

module.exports = {
    name: "topmp3",
    aliases: ["toaud"],
    description: "Convert video to audio (MP3)",
    category: "media",
    cooldown:    5000,

    async run(sock, m, args, reply) {
        try {
            const ctx = m.message?.extendedTextMessage?.contextInfo;

            let targetMsg;
            let targetType;

            if (ctx?.quotedMessage) {

                targetMsg = {
                    key: {
                        remoteJid: m.key.remoteJid,
                        fromMe: false,
                        id: ctx.stanzaId,
                        participant: ctx.participant,
                    },
                    message: ctx.quotedMessage,
                };
                targetType = getContentType(ctx.quotedMessage);
            } else {
                targetMsg = m;
                targetType = getContentType(m.message);
            }

            const isAudio = targetType === "videoMessage";

            if (!isAudio) return reply("❌ Reply audio!");

            const media = await downloadMediaMessage(targetMsg, "buffer", {}, { logger: global.logger, reuploadRequest: sock.updateMediaMessage });
            await sendAudio(sock, m.key.remoteJid, media, false, { quoted: m })
        } catch (err) {
            console.error("sticker error:", err.message);
            reply("❌ Gagal Convert " + err.message);
        }
    },
};