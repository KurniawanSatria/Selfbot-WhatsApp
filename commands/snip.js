module.exports = {
  name: "snip",
  aliases: ["sn"],
  category: "owner",
  description: "Convert a quoted message into a formatted code block.",

  async run(sock, m, args, reply, chat) {
    if (!m.isGroup && !m.isPrivate) return;

    if (!m.quoted) {
      return reply("⌬ Reply to a message first.");
    }

    const raw =
      m.quoted?.fakeObj?.message ||
      m.msg?.contextInfo?.quotedMessage ||
      m.quoted?.message ||
      null;

    if (!raw) {
      return reply(
        "╰─ Unable to read the quoted message. Reply directly and try again.",
      );
    }

    const mtype = Object.keys(raw)[0] || "extendedTextMessage";
    const core = raw[mtype] || raw;

    const ctx = m.msg?.contextInfo || m.quoted?.contextInfo || {};

    const capture = {
      message: {
        [mtype]: core,
      },
      ...(Object.keys(ctx).length ? { contextInfo: ctx } : {}),
    };

    const payload = JSON.stringify(capture, null, 2);

    await new AIRich(sock)
      .addText("Completed", {
        hyperlink: false,
        citation: false,
        latex: false,
      })
      .addCode("javascript", payload)
      .send(m.chat, {
        quoted: m,
        ephemeralExpiration: 60,
      })
      .catch(() => {});

    await sock
      .sendMessage(m.chat, {
        react: {
          text: "✓",
          key: m.key,
        },
      })
      .catch(() => {});
  },
};
