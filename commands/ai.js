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
      baseURL: "https://api.groq.com/openai/v1",
    });

    try {
      const res = await client.chat.completions.create({
        model: "openai/gpt-oss-120b",
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant. you're a whatsapp bot that can answer questions and provide information. your name is Saturiaaa., avoid long answer, make it simple",
          },
          {
            role: "user",
            content: args.join(" "),
          },
        ],
      });

      const msg = res.choices[0].message;

      await sock.relayMessage(
        m.key.remoteJid,
        {
          interactiveResponseMessage: {
            body: { text: msg.content, format: 1 },
            nativeFlowResponseMessage: {
              name: "galaxy_message",
              paramsJson: JSON.stringify({
                wa_flow_response_params: { title: msg.content },
                version: 3,
              }),
            },
          },
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
