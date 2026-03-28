module.exports = {
  name: "sticker",
  aliases: ["s", "stiker", "stc"],
  description: "Buat stiker dari foto/video (reply media)",
  cooldown: 5000,

  async run(sock, m, args, reply) {
    try {
      // ambil target: quoted dulu, kalau tidak ada cek pesan itu sendiri
      const quoted = m.quoted || m;
      const mime = (quoted.msg || quoted).mimetype || "";
      const qmsg = quoted.msg || quoted;
      const media = await sock.downloadMediaMessage(qmsg);

      if (/video/.test(mime)) {
        await sock.sendVideoAsSticker(m.chat, media, m);
      } else {
        await sock.sendImageAsSticker(m.chat, media, m);
      }

    } catch (err) {
      console.error("sticker error:", err.message);
      if (err.message.includes("duration") || err.message.includes("too long")) {
        reply("❌ Video terlalu panjang! Maksimal 9 detik.");
      } else {
        reply("❌ Gagal buat stiker: " + err.message);
      }
    }
  },
};