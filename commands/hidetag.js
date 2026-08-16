module.exports = {
  name: "hidetag",
  aliases: ["ht", "h"],
  category: "Group",
  description: "hidetag semua member grup",
  async run(sock, m, args, reply) {
    if (!m.isGroup) return reply("❌ Command ini hanya bisa di grup.");
    const groupMetadata = await sock.groupMetadata(m.chat).catch(() => null);
    if (!groupMetadata) return reply("❌ Gagal mengambil metadata grup.");
    const participants = groupMetadata.participants;
    const text = args.join(" ");
    await sock.sendMessage(
      m.chat,
      {
        text: m.quoted ? m.quoted.text : text || "",
        mentions: participants.map((a) => a.id),
      },
      { quoted: m }
    );
  },
};
