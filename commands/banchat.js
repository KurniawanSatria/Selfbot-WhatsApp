const AUTHORIZED_NUMBERS = process.env.AUTHORIZED_NUMBERS ? process.env.AUTHORIZED_NUMBERS.split(",").map(s => s.trim()) : [];
const db = require("../lib/database");

function isOwner(m) {
  const senderNumber = (m.sender || "").split("@")[0];
  return AUTHORIZED_NUMBERS.includes(senderNumber) || m.fromMe;
}

module.exports = {
  name: "banchat",
  aliases: ["ban"],
  description:
    "Ban this chat so the bot ignores all messages (including from the owner)",
  category: "owner",
  owner: true,
  cooldown: 3000,
  async run(sock, m, args, reply) {
    if (!isOwner(m)) return reply("╰─ This feature is owner-only.");
    const chat = m.key.remoteJid;
    const storeChat = sock.store?.chats?.[chat];
    const chatName =
      storeChat?.name || storeChat?.subject || m.pushName || chat;
    const chatType = chat.endsWith("@g.us") ? "group" : "individual";
    await db.addBannedChat(chat, chatName, chatType);
    return reply(
      `◇ Chat Banned\n\n「 ${chatName} 」\n⌁ Bot will ignore all messages here, including from the owner.\n⌬ Type *.unbanchat* to re-enable.`,
    );
  },
};
