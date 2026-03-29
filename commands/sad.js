const axios = require('axios');
const { getBuffer } = require("../lib/helper")
module.exports = {
    name: "sad",
    aliases: ["galau", "bucin"],
    category: "Quotes",
    description: "Random Quotes Bucin",
    cooldown: 5000,

    async run(sock, m, args, reply, jid) {
        await sock.sendMessage(m.chat, { react: { text: '🕒', key: m.key } });

        const { data } = await axios.get('https://api.cloudhostid.biz.id/random/bucin');

        if (!data.status) return m.reply('❌ Gagal ambil quote.');

        await m.reply(`_${data.result}_`);

        await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        const url = `https://raw.githubusercontent.com/KurniawanSatria/audio/main/galau/audio_0${Math.floor(Math.random() * 43) + 1}.mp3`;
        await sock.sendAudio(jid, await getBuffer(url), { ptt: true });
    }
};