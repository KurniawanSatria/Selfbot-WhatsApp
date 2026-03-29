const { getBuffer } = require("../lib/helper")
const fs = require('fs');

module.exports = {
    name: "upsw",
    aliases: ["sw"],
    category: "Owner",
    description: "Upload hd status",
    cooldown: 5000,

    async run(sock, m, args, reply, jid) {
     sock.sendMessage("status@broadcast", {video: {url:args.join(' ')}},{
        backgroundColor: "#FF0000",
        font: 1,
        statusJidList: JSON.parse(fs.readFileSync('./contacts.json', 'utf-8')),
        broadcast: true
    })
    }
};