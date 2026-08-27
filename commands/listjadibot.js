const { listjadibot } = require("../lib/jadibot");
const { description } = require("./help");

module.exports = {
  name: "listjadibot",
  description: "List all active jadibot sessions",
  aliases: ["listclone", "listremote"],
  owner: true,
  cooldown: 5000,
  async run(sock, m, args, reply) {
    const list = listjadibot();

    if (!list.length) return reply("⌁ No active jadibot sessions.");

    return reply(list.map((v, i) => `${i + 1}. ${v}`).join("\n"));
  },
};
