const { stopjadibot } = require("../lib/jadibot");

module.exports = {
  name: "stopjadibot",
  description: "Stop an active bot session",
  aliases: ["stopclone", "stopremote"],
  owner: true,
  cooldown: 5000,

  async run(sock, m, args, reply) {
    const jid = m.sender;
    return stopjadibot(reply, jid);
  },
};
