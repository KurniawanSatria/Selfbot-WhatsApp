const { PREFIX, THUMBNAIL, FOOTER } = require("../config");
const path = require("path");
const { fetchJson, getBuffer } = require("../lib/helper");
const fs = require("fs");

// Command categories mapping
const categories = {
  utility: {
    name: "Utility",
    emoji: "⚙️",
    commands: ["ping", "help"]
  },
  ai: {
    name: "AI & Tools",
    emoji: "🤖",
    commands: ["ai", "ask"]
  },
  media: {
    name: "Media",
    emoji: "🎬",
    commands: ["sticker", "s", "tovn", "toptt", "rvo", "viewonce", "downloader"]
  },
  owner: {
    name: "Owner",
    emoji: "🔒",
    commands: ["upsw", "sw"]
  }
};

module.exports = {
  name: "help",
  aliases: ["menu", "?", "cmd", "command"],
  description: "Show all available commands with categories",
  cooldown: 5000,

  async run(sock, m, args, reply) {
    try {
      const jid = m.key.remoteJid;
      const cmdDir = path.join(__dirname);

      // Load all commands with their metadata
      const allCommands = fs
        .readdirSync(cmdDir)
        .filter((f) => f.endsWith(".js") && !f.startsWith("_"))
        .map((f) => {
          const mod = require(path.join(cmdDir, f));
          return {
            name: mod.name,
            aliases: mod.aliases || [],
            description: mod.description || "No description",
            category: mod.category || "utility"
          };
        });

      // Group commands by category
      const grouped = {};
      for (const cmd of allCommands) {
        const cat = cmd.category || "utility";
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(cmd);
      }

      // Build categorized help message
      let helpMessage = `
\`*・✦  S A T U R I A  ✦・*\`

┌────────────────────────
│  🌟 *Total Commands:* ${allCommands.length}
│  ⚡ *Prefix:* ${PREFIX}
│  📂 *Categories:* ${Object.keys(grouped).length}
└────────────────────────

`;

      // Add each category
      for (const [catKey, cmds] of Object.entries(grouped)) {
        const catInfo = categories[catKey] || { name: catKey, emoji: "📦" };
        helpMessage += `${catInfo.emoji} *${catInfo.name}*\n`;
        for (let i = 0; i < cmds.length; i++) {
          const cmd = cmds[i];
          const isLast = i === cmds.length - 1;
          const symbol = isLast ? "└・" : "├・";

          const aliases = cmd.aliases.length > 0 ? ` _(${cmd.aliases.slice(0, 3).join(", ")})_` : "";
          helpMessage += `${symbol}${PREFIX}${cmd.name}${aliases}\n`;
        }

        helpMessage += "\n";
      }

      await sock.sendMessage(jid, {
        image: THUMBNAIL,
        caption: helpMessage,
        footer: FOOTER,
        interactiveButtons: [{
          name: 'cosmic_commands',
          buttonParamsJson: JSON.stringify({
            mode: 'published',
            flow_message_version: '3',
            flow_token: '1:1307913409923914:293680f87029f5a13d1ec5e35e718af3',
            flow_id: '1307913409923914',
            flow_cta: '🚀 Explore More',
            flow_action: 'navigate',
            flow_action_payload: {
              screen: 'COSMIC_COMMANDS',
              params: {
                timestamp: Date.now(),
                user_id: m.sender.split('@')[0],
                cosmic_level: Math.random().toString(36).substr(2, 5)
              }
            },
            flow_metadata: {
              flow_json_version: '201',
              data_api_protocol: 'v2',
              flow_name: 'Cosmic Command Explorer',
              data_api_version: 'v2',
              categories: ['Cosmic', 'Commands', 'Help']
            }
          })
        }],
      }, { quoted: m });
      // const all_audio = global.audio || [];
      // const audio = all_audio[Math.floor(Math.random() * all_audio.length)];
      // await sock.sendAudio(m.chat, await getBuffer(audio), { ptt: true, quoted: m});
    } catch (error) {
      console.error('🌌 Help error:', error);
      await reply('❌ *Unable to show help menu.*');
    }
  },
};