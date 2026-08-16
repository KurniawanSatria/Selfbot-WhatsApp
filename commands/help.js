const { PREFIX, THUMBNAIL, FOOTER, AUTHORIZED_NUMBERS } = require("../config");
const path = require("path");
const fs = require("fs");
const { generateWAMessageFromContent } = require("baileys");
const sharp = require("sharp");
const { getBuffer, Button, fetchJson } = require("../lib/helper");

global.audioUsed = global.audioUsed || new Set();

function getRandom001_100() {
return String(Math.floor(Math.random() * 87) + 1).padStart(3, "0");
}

function buildUrl(num) {
return `https://raw.githubusercontent.com/KurniawanSatria/audio/main/audios/audio_${num}.mp3`;
}

async function getRandomAudio() {
const num = getRandom001_100();
const url = buildUrl(num);
return { num, url };
}

const categories = {
utility: { name: "Utility", emoji: "⚙️" },
ai: { name: "AI & Tools", emoji: "🤖" },
media: { name: "Media", emoji: "🎬" },
tools: { name: "Tools", emoji: "🧰" },
owner: { name: "Owner", emoji: "🔒" },
};

function isOwner(m) {
const senderNumber = (m.sender || "").split("@")[0];
return (AUTHORIZED_NUMBERS.includes(senderNumber) || m.fromMe || (m.pushName && false));
}

module.exports = {
name: "help",
aliases: ["menu", "cmd", "?", "command"],
description: "Show all commands (per category, hidden owner cmds for non-owner)",
cooldown: 5000,

async run(sock, m, args, reply) {
try {
const jid = m.key.remoteJid;
await sock.sendPresenceUpdate("composing", jid);
const res = await fetchJson('https://api.github.com/repos/KurniawanSatria/audio/contents/new%20Phonk?ref=main')
const files = res.filter(x => x.type === 'file')
const random = files[Math.floor(Math.random() * files.length)]
const cmdDir = path.join(__dirname);
const allCommands = fs.readdirSync(cmdDir).filter((f) => f.endsWith(".js") && !f.startsWith("_")).map((f) => {
const mod = require(path.join(cmdDir, f));
return { name: mod.name, aliases: mod.aliases || [], category: mod.category || "utility", description: mod.description || "", owner: !!mod.owner};
});

const owner = isOwner(m);
const visible = allCommands.filter((c) => (c.owner ? owner : true));
const requestedCat = (args[0] || "").toLowerCase();
const filterCat = categories[requestedCat] ? requestedCat : null;
const grouped = {};
for (const cmd of visible) {
if (filterCat && cmd.category !== filterCat) continue;
if (!grouped[cmd.category]) grouped[cmd.category] = [];
grouped[cmd.category].push(cmd);
}
const more = String.fromCharCode(8206)
const readMore = more.repeat(4001)
const shownCount = Object.values(grouped).reduce((a, c) => a + c.length, 0);
let helpMessage = `${readMore}`;
for (const [cat, cmds] of Object.entries(grouped)) {
const info = categories[cat] || { name: cat, emoji: "📦" };
helpMessage += `\n${info.emoji} *${info.name}* (${cmds.length})\n`;
cmds.forEach((c, i) => {
const last = i === cmds.length - 1;
const symbol = last ? "└" : "├";
const alias = c.aliases.length > 0 ? ` ${c.aliases.slice(0, 2).map((a) => `(${PREFIX}${a})`).join(" ")}` : "";
const desc = c.description ? ` — ${c.description}` : "";
helpMessage += `${symbol} ${PREFIX}${c.name}\n`;
});
}
await new Button(sock).setImage("https://i.pinimg.com/736x/1c/89/3a/1c893a6e6bb86a18e9aa9bd7eec4a890.jpg").setTitle(`> \`Saturia SelfBot\`
> Commands: ${shownCount}${filterCat ? ` (${categories[filterCat].name})` : ""}
> Prefix: ${PREFIX}
> Audio: ${random.name}.mp3`).setBody(helpMessage).setFooter('© Saturiaaa.').addUrl('Developer','https://satzz.online').send(m.chat)
await sock.sendAudio(m.chat, random.download_url, {ptt: true, quoted: m,});
} catch (err) {
console.error("help error:", err);
reply("❌ Menu error");
}
},
};
