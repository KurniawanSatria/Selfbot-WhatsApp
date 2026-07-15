const { PREFIX, THUMBNAIL, FOOTER } = require("../config");
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
const { getBuffer } = require("../lib/helper");
const { Button } = require("../lib/helper");

global.audioUsed = global.audioUsed || new Set();

function getRandom001_100() {
  return String(Math.floor(Math.random() * 100) + 1).padStart(3, "0");
}

function buildUrl(num) {
  return `https://raw.githubusercontent.com/KurniawanSatria/audio/main/Oleddddd/audio_${num}.mp3`;
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
  owner: { name: "Owner", emoji: "🔒" },
};

module.exports = {
  name: "help",
  aliases: ["menu", "cmd", "?", "command"],
  description: "Show all commands",
  cooldown: 5000,

  async run(sock, m, args, reply) {
    try {
      const jid = m.key.remoteJid;
      await sock.sendPresenceUpdate("composing", jid);
      const { num, url } = await getRandomAudio();
      const cmdDir = path.join(__dirname);
      const allCommands = fs
        .readdirSync(cmdDir)
        .filter((f) => f.endsWith(".js") && !f.startsWith("_"))
        .map((f) => {
          const mod = require(path.join(cmdDir, f));
          return {
            name: mod.name,
            aliases: mod.aliases || [],
            category: mod.category || "utility",
          };
        });

      const grouped = {};
      for (const cmd of allCommands) {
        if (!grouped[cmd.category]) grouped[cmd.category] = [];
        grouped[cmd.category].push(cmd);
      }
      let helpMessage = `
*・✦ S A T U R I A ✦・*

┌────────────────────
│ 🌟 Total: ${allCommands.length}
│ ⚡ Prefix: ${PREFIX}
│ 🎧 Audio: ${num}.mp3
└────────────────────
`;

      for (const [cat, cmds] of Object.entries(grouped)) {
        const info = categories[cat] || { name: cat, emoji: "📦" };

        helpMessage += `\n${info.emoji} *${info.name}*\n`;

        cmds.forEach((c, i) => {
          const last = i === cmds.length - 1;
          const symbol = last ? "└" : "├";

          const alias =
            c.aliases.length > 0
              ? ` (${c.aliases.slice(0, 2).join(", ")})`
              : "";

          helpMessage += `${symbol} ${PREFIX}${c.name}${alias}\n`;
        });
      }

      const thumbPath = path.join(process.cwd(), "assets", "thumb.png");
      let thumbBuffer = await sharp(fs.readFileSync(thumbPath))
        .resize(150, 150, { fit: "cover" })
        .jpeg({ quality: 80 })
        .toBuffer();

      await new Button(sock)
        .setDocument(thumbBuffer, {
          fileName: "Saturia Self Bot.",
          mimetype: "image/jpeg",
          jpegThumbnail: thumbBuffer,
        })
        .setBody("")
        .setFooter(helpMessage)
        .addButton()
        .addReply("\0", "!menu")
        .addCall("\0", "911")
        .addUrl("\0", "https://saturia.codes", true)
        .addCopy("\0", "Saturiaaa.")
        .send(m.chat, { quoted: m });
      await sock.sendAudio(m.chat, url, {
        ptt: true,
        quoted: m,
      });
    } catch (err) {
      console.error("help error:", err);
      reply("❌ error menu");
    }
  },
};
