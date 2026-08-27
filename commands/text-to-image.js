const axios = require("axios");

module.exports = {
  name: "t2img",
  aliases: ["img", "imagine", "draw"],
  description: "Generate an image from a prompt",
  category: "ai",
  cooldown: 10000,

  async run(sock, m, args, reply, jid) {
    const prompt = args.join(" ").trim();

    if (!prompt) {
      return reply(
        "Usage: .t2img <prompt>\n\nExample:\n.image A cute cat wearing a hat",
      );
    }
    try {
      await reply("🎨 Generating image...");
      const response = await axios.post(
        "https://9router.saturia.codes/v1/images/generations?response_format=binary",
        {
          model: "ag/gemini-3.1-flash-image",
          prompt,
          n: 1,
          size: "auto",
          quality: "auto",
          background: "auto",
          image_detail: "high",
          output_format: "png",
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer sk-60a87276696bb2cc-ijbzmh-a1b7d5c8`,
          },
          responseType: "arraybuffer",
          timeout: 120000,
        },
      );

      await sock.sendMessage(
        jid || m.key.remoteJid,
        {
          image: Buffer.from(response.data),
          caption: `🎨 ${prompt}`,
        },
        {
          quoted: m,
        },
      );
    } catch (error) {
      let message = "Image generation failed.";

      if (error.response?.data) {
        try {
          const data = Buffer.isBuffer(error.response.data)
            ? JSON.parse(error.response.data.toString())
            : error.response.data;

          message = data?.error?.message || data?.message || message;
        } catch {}
      }

      console.error("Image generation error:", error);
      await reply(`❌ ${message}`);
    }
  },
};
