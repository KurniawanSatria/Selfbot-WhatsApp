const axios = require('axios');

module.exports = {
  name: "sad",
  aliases: ["galau", "bucin"],
  category: "Quotes",
  description: "Random Quotes Bucin",
  cooldown: 5000,

  async execute(conn, m) {
      await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } });

      const { data } = await axios.get('https://api.cloudhostid.biz.id/random/bucin');

      if (!data.status) return m.reply('❌ Gagal ambil quote.');

      await m.reply(`_${data.result}_`);

      await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
  }
};