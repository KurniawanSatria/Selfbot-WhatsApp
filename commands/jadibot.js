const { jadibot, stopjadibot, listjadibot } = require('../lib/jadibot')

module.exports = {
  name: 'jadibot',
  description: 'Connect your WhatsApp account to another device using Baileys',
  aliases: ['clone', 'remote'],
  cooldown: 10000,
  async run(sock, m, args, reply) {
    if (sock.user.id !== "6282170988479:52@s.whatsapp.net") return reply('ini clone, gabisa make fitur ini.')
    const jid = m.sender
    return jadibot(reply, sock, jid)
  }
}