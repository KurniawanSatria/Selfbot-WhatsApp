const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { getBuffer, Button, fetchJson } = require("../lib/helper");

const PREFIX = process.env.PREFIX || ".";
const THUMBNAIL = fs.readFileSync(process.env.ASSETS_DIR ? `${process.env.ASSETS_DIR}/thumb.png` : "./assets/thumb.png");
const FOOTER = "© Saturia.";
const AUTHORIZED_NUMBERS = process.env.AUTHORIZED_NUMBERS ? process.env.AUTHORIZED_NUMBERS.split(",").map(s => s.trim()) : [];
const GH_TOKEN = process.env.GH_TOKEN;

global.audioQueue = global.audioQueue || [];
global.audioIndex = global.audioIndex || 0;

function isOwner(m) {
  const senderNumber = (m.sender || "").split("@")[0];
  return AUTHORIZED_NUMBERS.includes(senderNumber) || m.fromMe;
}

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

async function getNextAudio() {
  if (
    !global.audioQueue.length ||
    global.audioIndex >= global.audioQueue.length
  ) {
    const { data: res } = await axios.get(
      "https://api.github.com/repos/KurniawanSatria/audio/contents/new%20Phonk?ref=main",
      {
        headers: {
          Authorization: `Bearer ${GH_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
    const files = res.filter((x) => x.type === "file");
    if (!files.length) throw new Error("Audio not found.");
    global.audioQueue = shuffle(files);
    global.audioIndex = 0;
  }
  return global.audioQueue[global.audioIndex++];
}

module.exports = {
  name: "help",
  aliases: ["menu", "cmd", "?", "command"],
  description: "Show all commands",
  cooldown: 5000,
  async run(sock, m, args, reply) {
    try {
      const jid = m.key.remoteJid;
      await sock.sendPresenceUpdate("composing", jid);
      const random = await getNextAudio();
      const allCommands = fs
        .readdirSync(__dirname)
        .filter((f) => f.endsWith(".js") && !f.startsWith("_"))
        .map((f) => {
          const mod = require(path.join(__dirname, f));
          return {
            name: mod.name,
            aliases: mod.aliases || [],
            owner: !!mod.owner,
          };
        });
      const visible = allCommands.filter((c) => (c.owner ? isOwner(m) : true));
      const readMore = String.fromCharCode(8206).repeat(4001);
      let helpMessage = `${readMore}\n`;
      visible.forEach((c, i) => {
        helpMessage += `${i === visible.length - 1 ? "└" : "├"} ${PREFIX}${c.name}\n`;
      });
      const thumb = await getBuffer(
        "https://www.flamingtext.com/net-fu/proxy_form.cgi?imageoutput=true&script=since-1999-svg&text=Menu&backgroundRadio=0",
      );
      await new Button(sock)
        .setImage(thumb)
        .setTitle(
          `\`Saturia SelfBot\`
> Commands: ${visible.length}
> Prefix: ${PREFIX}
> Audio: ${random.name}.mp3`,
        )
        .setBody(helpMessage)
        .setFooter("© Saturiaaa.")
        .addUrl("Developer", "https://satzz.online")
        .send(m.chat, { quoted: m });
      await sock.sendAudio(m.chat, random.download_url, {
        ptt: true,
        quoted: m,
      });
    } catch (err) {
      console.error("help error:", err);
      await reply("╰─ Menu failed to load.");
    }
  },
};
