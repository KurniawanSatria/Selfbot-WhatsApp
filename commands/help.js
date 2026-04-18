const { PREFIX, THUMBNAIL, FOOTER } = require("../config")
const path = require("path")
const fs = require("fs")
const { getBuffer } = require("../lib/helper")

global.audioUsed = global.audioUsed || new Set()

function getRandom001_100() {
  return String(Math.floor(Math.random() * 100) + 1).padStart(3, "0")
}

function buildUrl(num) {
  return `https://raw.githubusercontent.com/KurniawanSatria/audio/main/Oleddddd/audio_${num}.mp3`
}

async function getRandomAudio() {
  const num = getRandom001_100()
  const url = buildUrl(num)
  return { num, url }
}

// CATEGORY
const categories = {
  utility: { name: "Utility", emoji: "⚙️" },
  ai: { name: "AI & Tools", emoji: "🤖" },
  media: { name: "Media", emoji: "🎬" },
  owner: { name: "Owner", emoji: "🔒" }
}

module.exports = {
  name: "help",
  aliases: ["menu", "cmd", "?", "command"],
  description: "Show all commands",
  cooldown: 5000,

  async run(sock, m, args, reply) {
    try {
      const jid = m.key.remoteJid
      await sock.sendPresenceUpdate("composing", jid)

      // ─────────────────────────────
      // RANDOM AUDIO FROM GITHUB RAW
      // ─────────────────────────────
      const { num, url } = await getRandomAudio()

      // ─────────────────────────────
      // LOAD COMMANDS
      // ─────────────────────────────
      const cmdDir = path.join(__dirname)

      const allCommands = fs
        .readdirSync(cmdDir)
        .filter(f => f.endsWith(".js") && !f.startsWith("_"))
        .map(f => {
          const mod = require(path.join(cmdDir, f))
          return {
            name: mod.name,
            aliases: mod.aliases || [],
            category: mod.category || "utility"
          }
        })

      const grouped = {}
      for (const cmd of allCommands) {
        if (!grouped[cmd.category]) grouped[cmd.category] = []
        grouped[cmd.category].push(cmd)
      }

      // ─────────────────────────────
      // BUILD MESSAGE
      // ─────────────────────────────
      let helpMessage = `
*・✦ S A T U R I A ✦・*

┌────────────────────
│ 🌟 Total: ${allCommands.length}
│ ⚡ Prefix: ${PREFIX}
│ 🎧 Audio: ${num}.mp3
└────────────────────
`

      for (const [cat, cmds] of Object.entries(grouped)) {
        const info = categories[cat] || { name: cat, emoji: "📦" }

        helpMessage += `\n${info.emoji} *${info.name}*\n`

        cmds.forEach((c, i) => {
          const last = i === cmds.length - 1
          const symbol = last ? "└" : "├"

          const alias =
            c.aliases.length > 0
              ? ` (${c.aliases.slice(0, 2).join(", ")})`
              : ""

          helpMessage += `${symbol} ${PREFIX}${c.name}${alias}\n`
        })
      }

      // ─────────────────────────────
      // SEND MENU
      // ─────────────────────────────
      await sock.sendMessage(jid, {
        image: THUMBNAIL,
        caption: helpMessage,
        footer: FOOTER,
        interactiveButtons: [
          {
            name: "cosmic_commands",
            buttonParamsJson: JSON.stringify({
              mode: "published",
              flow_message_version: "3",
              flow_token: "1:1307913409923914:293680f87029f5a13d1ec5e35e718af3f",
              flow_id: "1307913409923914",
              flow_cta: "🚀 Explore More",
              flow_action: "navigate",
              flow_action_payload: {
                screen: "COSMIC_COMMANDS",
                params: {
                  timestamp: Date.now(),
                  user_id: m.sender.split("@")[0],
                  cosmic_level: Math.random().toString(36).substr(2, 5)
                }
              },
              flow_metadata: {
                flow_json_version: "201",
                data_api_protocol: "v2",
                flow_name: "Cosmic Command Explorer",
                data_api_version: "v2",
                categories: ["Cosmic", "Commands", "Help"]
              }
            })
          }
        ]
      }, { quoted: m })

      // ─────────────────────────────
      // SEND AUDIO
      // ─────────────────────────────
        await sock.sendAudio(m.chat, url, {
          ptt: true,
          quoted: m
        })

    } catch (err) {
      console.error("help error:", err)
      reply("❌ error menu")
    }
  }
}