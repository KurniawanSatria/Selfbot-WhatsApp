module.exports = {
  name: "removebg",
  aliases: ["rmbg", "nobg"],
  category: "Tools",
  description: "Remove the background from an image",

  async run(sock, m, args, reply) {
    try {
      const quoted = m.quoted || m;
      const mime = (quoted.msg || quoted).mimetype || "";
      const qmsg = quoted.msg || quoted;

      if (!/image/.test(mime)) {
        return m.react("⌁");
      }

      const buffer = await sock.downloadMediaMessage(qmsg);

      const form = new FormData();

      form.append(
        "image",
        new Blob([buffer], { type: "image/png" }),
        "image.png",
      );

      const response = await fetch("https://api.removebg.bd/api/remove-bg", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.REMOVEBG_API_KEY}`,
        },
        body: form,
      });

      if (!response.ok) {
        const error = await response.text();

        console.error("RemoveBG API:", error);

        return m.react("!");
      }

      const result = Buffer.from(await response.arrayBuffer());

      await sock.sendMessage(
        m.chat,
        {
          image: result,
        },
        {
          quoted: m,
        },
      );

      return m.react("✓");
    } catch (err) {
      console.error("RemoveBG error:", err);
      return m.react("!");
    }
  },
};
