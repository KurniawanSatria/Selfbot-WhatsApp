const fs = require('fs');

module.exports = {
    name: "upsw",
    aliases: ["sw"],
    category: "owner",
    description: "Upload Story Without Compression",
    cooldown: 5000,

    async run(sock, m, args, reply) {
        const list = JSON.parse(fs.readFileSync('./contacts.json', 'utf-8'));
        let content = {};

        if (args[0]) {
            const url = args[0];

            if (url.match(/\.(jpg|jpeg|png|webp)$/i)) {
                content = {
                    image: { url },
                    caption: args.slice(1).join(" ")
                };
            } else if (url.match(/\.(mp4|mov|mkv|webm)$/i)) {
                content = {
                    video: { url },
                    caption: args.slice(1).join(" ")
                };
            } else if (url.match(/\.(mp3|m4a|aac|ogg)$/i)) {
                content = {
                    audio: { url },
                    mimetype: "audio/mp4"
                };
            } else {
                content = {
                    text: args.join(" "),
                    backgroundColor: "#000000",
                    font: 1
                };
            }

        } else if (m.quoted) {
            const q = m.quoted;
            const mime = q.mimetype || "";

            const buffer = await q.download();

            if (/image/.test(mime)) {
                content = {
                    image: buffer,
                    caption: q.text || ""
                };
            } else if (/video/.test(mime)) {
                content = {
                    video: buffer,
                    caption: q.text || ""
                };
            } else if (/audio/.test(mime)) {
                content = {
                    audio: buffer,
                    mimetype: mime,
                    ptt: /opus/.test(mime) // auto jadi voice note kalau cocok
                };
            } else {
                return reply("format ga didukung");
            }

        } else {
            return reply("kasih url atau reply media");
        }

        await sock.sendMessage("status@broadcast", content, {
            statusJidList: list,
            broadcast: true
        });
    }
};