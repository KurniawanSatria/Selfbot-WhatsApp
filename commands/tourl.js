module.exports = {
  name: "tourl",
  aliases: ["url", "upload"],
  description: "Upload images or videos to Litterbox",
  category: "media",
  cooldown: 5000,

  async run(sock, m, args, reply) {
    try {
      const quoted = m.quoted || m;
      const qmsg = quoted.msg || quoted;
      const mime = qmsg.mimetype || "";

      if (!mime) {
        return reply("╰─ Reply gambar atau video terlebih dahulu.");
      }

      if (!/^(image|video)\//.test(mime)) {
        return reply("╰─ Media yang didukung hanya gambar atau video.");
      }

      const media = await sock.downloadMediaMessage(qmsg);

      if (!media) {
        return reply("╰─ Gagal mengunduh media.");
      }

      const ext = mime.split("/")[1] || "bin";

      const form = new FormData();

      form.append("reqtype", "fileupload");
      form.append("time", "72h");
      form.append(
        "fileToUpload",
        new Blob([media], { type: mime }),
        `upload.${ext}`,
      );

      const res = await fetch(
        "https://litterbox.catbox.moe/resources/internals/api.php",
        {
          method: "POST",
          body: form,
        },
      );

      const result = await res.text();

      if (!res.ok || !result.startsWith("https://")) {
        throw new Error(result || `HTTP ${res.status}`);
      }

      return reply(result);
    } catch (err) {
      console.error("tourl error:", err);
      return reply(`╰─ Failed to upload media: ${err.message}`);
    }
  },
};
