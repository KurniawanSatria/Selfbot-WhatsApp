const { listjadibot } = require('../lib/jadibot')
const { description } = require('./help')

module.exports = {
  name: 'listjadibot',
  description: 'List all active jadibot sessions',
  aliases: ['listclone', 'listremote'],
  cooldown: 5000,
  async run(sock, m, args, reply) {
    const list = listjadibot()

    if (!list.length) return reply('ga ada jadibot aktif')

    return reply(
      list.map((v, i) => `${i + 1}. ${v}`).join('\n')
    )
  }
}