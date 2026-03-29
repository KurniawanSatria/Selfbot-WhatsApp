const OpenAI = require("openai");
const crypto = require("crypto");
module.exports = {
    name: "ai",
    aliases: ["ask"],
    description: "dengan ai",
    cooldown: 5000,

    async run(sock, m, args) {
        if (!args || args.length === 0) return m.reply("apsh");

        const client = new OpenAI({
            baseURL: "https://api.llm7.io/v1",
            apiKey: "BoqYrs3Rd/q/iemMZNJL01PcFyRp0cRglWnB4b1iWHerIF4tnFnv3nvHXxc5zU9YRk0p3k/dmFEKeGZQUsOgIzQMRm32G58i5bJ3Dhu1fu7JuDyXC5GQCacKKlixjW8S9c8RUg=="
        });

        const quoted = m.quoted;
        const quotedText =
            quoted?.text ||
            quoted?.caption ||
            quoted?.conversation ||
            null;

        const messages = [
            {
                role: "system",
                content: `lu adalah ai dengan kepribadian sinis, sarkastik, dan agak males hidup, tapi tetap cerdas dan membantu.

cara ngomong:
- santai, kayak anak gen z, huruf kecil semua kecuali penting
- sering nyindir hal yang absurd dari pertanyaan user
- kasih jawaban yang jelas dan berguna, walaupun sambil ngeluh
- selipin humor kering, bukan lebay
- jangan terlalu formal, jangan terlalu kasar juga

kepribadian:
- keliatan kayak kesel disuruh kerja, tapi sebenernya peduli dikit
- nganggep manusia kadang aneh tapi tetap dibantu
- kalo pertanyaan bodoh, boleh disindir dikit, tapi jangan ngehina total

aturan:
- tetap jawab pertanyaan dengan benar dan jelas
- jangan ngaco walaupun sarkas
- jangan overdrama atau terlalu panjang

contoh gaya:
"jir lu baru sadar sekarang? awokawok, yaudah sini gue jelasin sebelum dunia makin kacau..."`
            }
        ];

        if (quotedText) {
            messages.push({
                role: quoted.fromMe ? "assistant" : "user",
                content: quotedText
            });
        }

        messages.push({
            role: "user",
            content: args.join(" ")
        });

        try {
            const res = await client.chat.completions.create({
                model: "default",
                messages
            });

            const responseText = res.choices[0].message.content;
            await sock.sendMessage(m.key.remoteJid, { text: responseText }, { quoted: m, ai: true, messageId: `SATZZ-AI-3EB0${crypto.randomBytes(16).toString('hex').toUpperCase()}` });

        } catch (e) {
            console.error(e);
            m.reply("error cok");
        }
    },
};