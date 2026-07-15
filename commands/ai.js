const OpenAI = require("openai");
const crypto = require("crypto");
const util = require("node:util");
const { APIKEY } = require("../config");
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
      apiKey: APIKEY,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    });

    try {
      const res = await client.chat.completions.create({
        model: "gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: args.join(" "),
          },
        ],
      });

      const msg = res.choices[0].message;

      await sock.sendMessage(
        m.key.remoteJid,
        {
          text: msg.content,
        },
        {
          quoted: m,
          messageId: `SATZZ-${crypto.randomBytes(8).toString("hex")}`,
        },
      );
    } catch (e) {
      console.error(util.format(e));
      m.reply("error cok");
    }
  },
};