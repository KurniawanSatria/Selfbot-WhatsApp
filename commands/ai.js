const OpenAI = require("openai");
const crypto = require("crypto");
const util = require('node:util');

module.exports = {
    name: "ai",
    aliases: ["ask"],
    description: "AI-powered chat and assistance",
    category: "ai",
    cooldown: 5000,

    async run(sock, m, args) {
        if (!args || args.length === 0) return m.reply("apsh");
        await sock.sendPresenceUpdate("composing", m.key.remoteJid);
        const client = new OpenAI({
            baseURL: "https://openrouter.ai/api/v1",
            apiKey: "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"

        });

        const messages = [
            {
                role: "user",
                content: args.join(" ")
            }
        ];

        try {
            const res = await client.chat.completions.create({
                model: "arcee-ai/trinity-large-preview:free@preset/saturia-ai",
                messages,
            });

            const msg = res.choices[0].message;

            await sock.sendMessage(
                m.key.remoteJid,
                { text: msg.content },
                {
                    quoted: m,
                    messageId: `SATZZ-${crypto.randomBytes(8).toString("hex")}`
                }
            );

        } catch (e) {
            console.error(util.format(e));
            m.reply("error cok");
        }
    },
};