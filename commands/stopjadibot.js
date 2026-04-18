const { stopjadibot } = require('../lib/jadibot')
const { description } = require('./help')

module.exports = {
  name: 'stopjadibot',
  description: 'Stop an active jadibot session',
  aliases: ['stopclone', 'stopremote'],
  cooldown: 5000,
  async run(sock, m, args, reply) {
    const jid = m.sender

    return stopjadibot(reply, jid)
  }
}