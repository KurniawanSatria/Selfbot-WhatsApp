const { downloadMediaMessage, getContentType } = require("baileys");
const { sendAudio, getBuffer } = require("../lib/helper");

module.exports = {
    name: "toptt",
    aliases: ["tovn"],
    description: "Konfersi audio ke pesan suara",
    cooldown:    5000,

    async run(sock, m, args, reply) {
        try {
            const ctx = m.message?.extendedTextMessage?.contextInfo;

            // ── ambil target: quoted dulu, kalau tidak ada cek pesan itu sendiri ──
            let targetMsg;
            let targetType;

            if (ctx?.quotedMessage) {
                // pesan di-reply → pakai quoted
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
                // tidak reply → cek kalau pesan itu sendiri adalah media
                targetMsg = m;
                targetType = getContentType(m.message);
            }

            const isAudio = targetType === "audioMessage";

            if (!isAudio) return reply("❌ Reply audio!");

            const media = await downloadMediaMessage(targetMsg, "buffer", {}, { logger: global.logger, reuploadRequest: sock.updateMediaMessage });
            await sendAudio(sock, m.key.remoteJid, media, true, { quoted: m })
        } catch (err) {
            console.error("sticker error:", err.message);
            reply("❌ Gagal Convert " + err.message);
        }
    },
};