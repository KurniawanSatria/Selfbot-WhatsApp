const config = require("../config");
const { PREFIX, CHANNEL, AUTHORIZED_NUMBERS, COOLDOWN, FEATURES } = config;
const OpenAI = require("openai");
const {
  quickContact,
  createContactCards,
  generateVCard,
  createContactCard,
} = require("baileys");
const crypto = require("crypto");
const { serialize } = require("../lib/serialize");
const db = require("../lib/database");
const fs = require("fs");
const util = require("node:util");
const { exec } = require("node:child_process");
const https = require("https");
const {
  getRandom,
  getBuffer,
  convertToPtt,
  convertToMp3,
} = require("../lib/helper");
const { proto } = require("baileys");

const DEFAULT_COOLDOWN = 5000;
const cooldowns = new Map();

function isOnCooldown(sender, cmd, cooldownMs) {
  const key = `${sender}:${cmd}`;
  const last = cooldowns.get(key) ?? 0;
  const remaining = cooldownMs - (Date.now() - last);
  if (remaining > 0) return remaining;
  cooldowns.set(key, Date.now());
  return 0;
}

setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [key, ts] of cooldowns) {
    if (ts < cutoff) cooldowns.delete(key);
  }
}, 600_000);

async function handleAntiDelete(sock, raw) {
  if (!FEATURES?.ANTI_DELETE) return;
  if (!raw?.message?.protocolMessage?.key) return;

  const protocol = raw.message.protocolMessage;
  const revokeType = proto.Message.ProtocolMessage.Type.REVOKE;
  if (protocol.type !== revokeType) return;

  const targetKey = protocol.key;
  const targetJid = targetKey.remoteJid || raw.key?.remoteJid;
  if (!targetJid || !targetKey.id) return;

  const isPrivateJid = /@(s\.whatsapp\.net|lid)$/.test(targetJid);
  if (!isPrivateJid) return;

  const original = await sock.store?.loadMessage?.(targetJid, targetKey.id);
  if (!original?.message) {
    await sock.sendImageAsSticker(targetJid, "https://i.pinimg.com/736x/b9/ac/df/b9acdf09223d5535c07f45e026d18a1d.jpg", raw.key);
    return;
  }

  const deleter = (raw.key?.participant || raw.key?.remoteJid || "")
    .replace(/@.+$/, "")
    .trim();
  const originalSender = (targetKey.participant || targetKey.remoteJid || "")
    .replace(/@.+$/, "")
    .trim();

  const mentions = [
    raw.key?.participant,
    targetKey.participant,
    targetKey.remoteJid,
  ].filter(Boolean);

 await sock.sendImageAsSticker(targetJid, "https://i.pinimg.com/736x/b9/ac/df/b9acdf09223d5535c07f45e026d18a1d.jpg", null);

  await sock.copyNForward(targetJid, original, true);
}

module.exports = {
  register(sock) {
    sock.ev.on("messages.upsert", async ({ messages }) => {
      for (const raw of messages) {
        if (!raw.message) continue;
        if (!raw.key?.id) continue;
        if (raw.key.id.startsWith("INO")) continue;

        try {
          await handleAntiDelete(sock, raw);
        } catch (antiDeleteErr) {
          global.log?.warn(`Anti-delete error: ${antiDeleteErr.message}`);
        }

        const m = await serialize(sock, raw);
        // console.log(JSON.stringify(m, null, 2)); // uncomment for debug

        try {
          const { chat, sender, body } = m;
          if (!body) continue;

          try {
            const chatExists = await db.isChatAllowed(chat);
            if (!chatExists && sock.store?.chats?.[chat]) {
              const chatData = sock.store.chats[chat];
              await db.addAllowedChat(
                chat,
                chatData.name || "",
                chat.endsWith("@g.us") ? "group" : "individual",
              );
            }
          } catch (e) {}

          const senderNumber = sender.split("@")[0];
          let isAuthorized =
            AUTHORIZED_NUMBERS.includes(senderNumber) || m.fromMe;

          if (!isAuthorized) {
            try {
              isAuthorized = await db.isNumberAllowed(senderNumber);
            } catch (e) {}
          }

          const isChatAllowed = await db.isChatAllowed(chat);

          if (body.startsWith(">>") && isAuthorized) {
            try {
              const code = body.slice(2).trim();
              let evaled = /await/i.test(code)
                ? await eval(`(async () => { ${code} })()`)
                : eval(code);
              if (typeof evaled !== "string") evaled = util.inspect(evaled);
              await m.reply(evaled);
            } catch (err) {
              await m.reply(String(err));
            }
            continue;
          }

          if (body.startsWith("$") && isAuthorized) {
            const code = body.slice(1).trim();
            m.reply("Executing...");
            exec(code, (err, stdout) => {
              m.reply(err ? String(err) : stdout || "(no output)");
            });
            continue;
          }

          if (!isAuthorized) continue;

          try {
            const db = require("../lib/database");
            const activeSession = await db.getActiveSession(sender);
            if (activeSession) {
              const botInstance = activeSession.botInstance;
              await m.reply(
                `🤖 *Active Bot Session*\n\n` +
                  `Session ID: ${activeSession.sessionId}\n` +
                  `Bot Instance: ${botInstance}\n` +
                  `Expires: ${activeSession.expiresAt}\n\n` +
                  `Commands will be routed to this bot instance.`,
              );
              continue;
            }
          } catch (e) {
            console.error("Database error in session check:", e);
          }

          if (body.startsWith("grab_audio") && isAuthorized) {
            sock.sendMessage(
              chat,
              {
                audio: { url: body.split(" ")[1] },
                mimetype: "audio/mpeg",
                ptt: false,
              },
              { quoted: m },
            );
            continue;
          }

          const urlPattern = /(https?:\/\/[^\s]+)/gi;
          const foundUrls = body.match(urlPattern);

          if (foundUrls && foundUrls.length > 0 && isAuthorized) {
            const platforms = {
              youtube: {
                id: "youtube",
                name: "YouTube",
                patterns: [/youtube\.com/i, /youtu\.be/i],
              },
              tiktok: {
                id: "tiktok",
                name: "TikTok",
                patterns: [/tiktok\.com/i],
              },
              instagram: {
                id: "instagram",
                name: "Instagram",
                patterns: [/instagram\.com/i, /instagr\.am/i],
              },
              twitter: {
                id: "twitter",
                name: "Twitter/X",
                patterns: [/twitter\.com/i, /x\.com/i],
              },
              facebook: {
                id: "facebook",
                name: "Facebook",
                patterns: [/facebook\.com/i, /fb\.watch/i, /fb\.me/i],
              },
              soundcloud: {
                id: "soundcloud",
                name: "SoundCloud",
                patterns: [/soundcloud\.com/i],
              },
              spotify: {
                id: "spotify",
                name: "Spotify",
                patterns: [/spotify\.com/i],
              },
            };
            if (
              platforms.tiktok.patterns.some((pattern) =>
                pattern.test(foundUrls[0]),
              )
            ) {
              m.reply("Processing TikTok link...");
              const { ttsave } = require("../lib/downloader");
              const result = await ttsave(foundUrls[0]);
              if (result.status === 200) {
                const res = result.data;
                if (res.type === "slide") {
                  const images = res.images.map((i) => ({ image: { url: i } }));
                  await sock.sendMessage(
                    chat,
                    { album: images },
                    { quoted: m },
                  );
                  await sock.sendMessage(chat, {
                    text: "Want the audio? Click the button below!",
                    footer: config.FOOTER,
                    buttonsMessage: {
                      contentText: "Want the audio? Click the button below!",
                      footerText: config.FOOTER,
                      headerType: 1,
                      buttons: [
                        {
                          buttonId: "grab_audio " + res.music.play_url,
                          buttonText: { displayText: "Grab Audio" },
                          type: 1,
                        },
                      ],
                    },
                  });
                } else if (res.type === "video") {
                  await sock.sendMessage(
                    chat,
                    {
                      video: {
                        url: res.video.hd_play_url || res.video.play_url,
                      },
                      caption: res.title,
                      footer: config.FOOTER,
                      buttonsMessage: {
                        contentText: res.title,
                        footerText: config.FOOTER,
                        headerType: 1,
                        buttons: [
                          {
                            buttonId: "grab_audio " + res.music.play_url,
                            buttonText: { displayText: "Grab Audio" },
                            type: 1,
                          },
                        ],
                      },
                    },
                    { quoted: m },
                  );
                }
              }
            }
          }

          if (body.startsWith("allowed ")) {
            const interactiveArgs = body.split(" ");
            const subCmd = interactiveArgs[1];

            if (subCmd === "toggle" && interactiveArgs.length >= 4) {
              const chatId = interactiveArgs[2];
              const action = interactiveArgs[3];

              const enabled = action === "enable";
              await db.toggleAllowedChat(chatId, enabled);

              const chat = sock.store.chats[chatId];
              await m.reply(
                `✓ ${chat?.name || chatId?.split("@")[0]}\nStatus: ${enabled ? "🟢 Enabled" : "🔴 Disabled"}`,
              );

              setTimeout(async () => {
                if (chatId.endsWith("@g.us")) {
                  await sock.sendMessage(chat, {
                    text: `_${chat?.name || "Group"} updated_`,
                  });
                }
              }, 500);
            }
            continue;
          }

          if (!body.startsWith(PREFIX)) continue;

          const rawBody = body.slice(PREFIX.length).trim();
          const args = rawBody.split(/\s+/);
          const cmd = args.shift().toLowerCase();

          if (!global.commands.has(cmd)) continue;

          const quoted = m.quoted || m;
          const mime = (quoted.msg || quoted).mimetype || "";
          const qmsg = quoted.msg || quoted;
          const mod = global.commands.get(cmd);

          const canUseCommand = isAuthorized || isChatAllowed;
          if (!canUseCommand && !m.fromMe) {
            continue;
          }

          const remaining = isOnCooldown(
            sender,
            cmd,
            mod.cooldown ?? DEFAULT_COOLDOWN,
          );
          if (remaining > 0) continue;

          global.log?.cmd(`${cmd} ${args.join(" ")}`.trim());
          await mod.run(sock, m, args, m.reply, chat);
        } catch (err) {
          global.log?.error(`Handler error: ${err.message}`);
        }
      }
    });
  },
};
