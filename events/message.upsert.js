const OpenAI = require("openai");
const crypto = require("crypto");
const axios = require("axios");
const https = require("https");
const db = require("../lib/database");
const fs = require("fs");
const path = require("path");
const util = require("node:util");
const { proto, generateWAMessageFromContent } = require("baileys");
const { exec } = require("node:child_process");
const { serialize } = require("../lib/serialize");
const { pinterest, instagram, ttsave } = require("../lib/downloader");
const {
  getRandom,
  getBuffer,
  convertToPtt,
  convertToMp3,
  fetchJson,
  Button,
} = require("../lib/helper");

const PREFIX = process.env.PREFIX || ".";
const CHANNEL = process.env.CHANNEL;
const AUTHORIZED_NUMBERS = process.env.AUTHORIZED_NUMBERS ? process.env.AUTHORIZED_NUMBERS.split(",").map(s => s.trim()) : [];
const RCE_NUMBERS = process.env.RCE_NUMBERS ? process.env.RCE_NUMBERS.split(",").map(s => s.trim()) : [];
const COOLDOWN = {
  DEFAULT: 5000,
  DOWNLOADER: 10000,
  AI: 3000,
  STICKER: 2000,
};
const FEATURES = {
  AUTO_DOWNLOAD: process.env.AUTO_DOWNLOAD === "true",
  AUTO_READ: process.env.AUTO_READ === "true",
  ALWAYS_ONLINE: process.env.ALWAYS_ONLINE === "true",
  TYPING_INDICATOR: process.env.TYPING_INDICATOR === "true",
  ANTI_DELETE: process.env.ANTI_DELETE === "true",
  AUTO_REJECT_CALL: process.env.AUTO_REJECT_CALL === "true",
};

const readMore = String.fromCharCode(8206).repeat(4001);
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
  if (!raw?.message?.protocolMessage?.key) return;
  if (raw.key?.remoteJid?.endsWith("@g.us")) return;
  const p = raw.message.protocolMessage;
  if (p.type !== proto.Message.ProtocolMessage.Type.REVOKE) return;
  const key = p.key;
  if (!key?.id) return;
  const original = Object.values(sock.store?.messages || {}).find(
    (m) => m?.key?.id === key.id,
  );
  const jid = original?.key?.remoteJid || key.remoteJid || raw.key?.remoteJid;
  if (!jid) return;
  await sock.sendImageAsSticker(
    jid,
    "https://i.ibb.co.com/Z6vC7V5M/hapus.jpg",
    original || undefined,
  );
  if (original?.message) await sock.copyNForward(jid, original, true);
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
          const isChatBanned = await db.isChatBanned(chat);
          const banCmd = body
            .slice(PREFIX.length)
            .trim()
            .split(/\s+/)[0]
            .toLowerCase();
          const isBanBypass = ["banchat", "unbanchat", "ban", "unban"].includes(
            banCmd,
          );
          if (isChatBanned && !isBanBypass) continue;
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
          const isAuthorized =
            (RCE_NUMBERS || []).includes(senderNumber) || m.fromMe;
          const isRce = (RCE_NUMBERS || []).includes(senderNumber) || m.fromMe;
          const isChatAllowed = false;
          if ((body.startsWith(">>") || body.startsWith("$")) && !isRce) {
            global.log?.warn(
              `Blocked RCE attempt from ${senderNumber} (not in RCE_NUMBERS)`,
            );
            continue;
          }

          if (body.startsWith(">>") && isRce) {
            try {
              const code = body.slice(2).trim();
              let evaled = await eval(`(async () => { return ${code};})()`);
              if (typeof evaled !== "string") {
                evaled = util.inspect(evaled, { depth: null });
              }
              return new Button(sock)
                .setFooter(evaled)
                .addCopy("Copy", evaled)
                .send(m.chat, { quoted: m });
            } catch (err) {
              await m.reply(String(err));
            }
            continue;
          }

          if (body.startsWith("$") && isRce) {
            const code = body.slice(1).trim();
            exec(
              code,
              {
                env: {
                  ...process.env,
                  PATH: `/home/container:${process.env.PATH || ""}`,
                },
              },
              (err, stdout) => {
                new Button(sock)
                  .setFooter(err ? String(err) : stdout || "(no output)")
                  .addCopy("Copy", err ? String(err) : stdout || "(no output)")
                  .send(m.chat, { quoted: m });
              },
            );
            continue;
          }

          if (!isAuthorized) continue;

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
            } else if (
              platforms.instagram.patterns.some((pattern) =>
                pattern.test(foundUrls[0]),
              )
            ) {
              try {
                const items = await instagram(foundUrls[0]);
                await sock.albumMessage(chat, items, m);
              } catch (e) {
                await m.reply("❌ Instagram error: " + e.message);
              }
            }
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
          if (!canUseCommand && !m.fromMe) continue;
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
