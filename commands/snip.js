module.exports = {
  name: "snip",
  aliases: ["sn"],
  category: "Owner",
  description: "Reply quoted message & compile to AI rich inline code message.",
  async run(sock, m, args, reply, chat) {
    if (!m.isGroup && !m.isPrivate) return;
    if (!m.quoted) return reply("Reply ke pesan dulu! 🤬");
    const raw = m.quoted?.fakeObj?.message || m.msg?.contextInfo?.quotedMessage || m.quoted?.message || null;
    if (!raw) return reply("Gagal baca pesan quoted. Reply langsung & coba lagi.");
    const mtype = Object.keys(raw)[0] || "extendedTextMessage";
    const core = raw[mtype] || raw;
    const ctx = m.msg?.contextInfo || m.quoted?.contextInfo || {};
    const capture = { message: { [mtype]: core }, ...(Object.keys(ctx).length ? { contextInfo: ctx } : {}) };
    const payload = JSON.stringify(capture, null, 2);
    await new AIRich(sock).addText('Done', { hyperlink: false, citation: false, latex: false }).addCode("javascript", payload).send(m.chat, { quoted: m, ephemeralExpiration: 60 }).catch(() => {});
    await sock.sendMessage(m.chat, { react: { text: "✅", key: m.key } }).catch(() => {});
  },
};
