const config = require('../config');
const { PREFIX, CHANNEL, AUTHORIZED_NUMBERS, COOLDOWN, FEATURES } = config;
const OpenAI = require("openai");
const { createMessageStoreHandler, quickContact, createContactCards, generateVCard, createContactCard } = require("baileys");
const crypto = require("crypto");
const { serialize } = require('../lib/serialize');
const db = require('../lib/database');
const fs = require('fs');
const util = require('node:util');
const { exec } = require('node:child_process');
const https = require('https');
const { getRandom, getBuffer, convertToPtt, convertToMp3 } = require("../lib/helper");
// ─── Anti-Spam ────────────────────────────────────────────────────────────────
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


module.exports = {
    register(sock) {
        sock.ev.on("messages.upsert", createMessageStoreHandler(sock.store));
        sock.ev.on("messages.upsert", async ({ messages }) => {
            for (const raw of messages) {
                if (!raw.message) continue;
                if (raw.key.id.startsWith('INO')) continue;
                // ─── Serialize ────────────────────────────────────────────
                const m = await serialize(sock, raw);

                try {
                    const { chat, sender, body } = m;
                    if (!body) continue;
                    
                    // Auto-add chat to database if not exists
                    try {
                        const chatExists = await db.isChatAllowed(chat);
                        if (!chatExists && sock.store?.chats?.[chat]) {
                            const chatData = sock.store.chats[chat];
                            await db.addAllowedChat(
                                chat,
                                chatData.name || '',
                                chat.endsWith('@g.us') ? 'group' : 'individual'
                            );
                        }
                    } catch (e) {
                        // Ignore DB errors for auto-add
                    }
                    
                    // Check if sender is authorized (config + database)
                    const senderNumber = sender.split('@')[0];
                    let isAuthorized = AUTHORIZED_NUMBERS.includes(senderNumber) || m.fromMe;
                    
                    // Also check database for allowed numbers
                    if (!isAuthorized) {
                        try {
                            isAuthorized = await db.isNumberAllowed(senderNumber);
                        } catch (e) {
                            // DB not initialized yet
                        }
                    }
                    
                    // Also check if chat is allowed (for groups)
                    const isChatAllowed = await db.isChatAllowed(chat);
                    
                    //console.log(body)
                    // ── Eval ──────────────────────────────────────────────
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

                    // ── Exec ──────────────────────────────────────────────
                    if (body.startsWith("$") && isAuthorized) {
                        const code = body.slice(1).trim();
                        m.reply("Executing...");
                        exec(code, (err, stdout) => {
                            m.reply(err ? String(err) : stdout || "(no output)");
                        });
                        continue;
                    }

                    // Skip unauthorized for other commands
                    if (!isAuthorized) continue;

                    // Tiktok Audio Grabber
                    if (body.startsWith("grab_audio") && isAuthorized) {
                        sock.sendMessage(chat, {audio: { url: body.split(" ")[1] }, mimetype: "audio/mp4", ptt: false}, { quoted: m });
                        continue;
                    }

                    // ── Auto-detect URL for downloader ──────────────────────────────────────────────
                    const urlPattern = /(https?:\/\/[^\s]+)/gi;
                    const foundUrls = body.match(urlPattern);

                    if (foundUrls && foundUrls.length > 0 && isAuthorized) {
                        const platforms = {
                            youtube: { id: "youtube", name: "YouTube", patterns: [/youtube\.com/i, /youtu\.be/i] },
                            tiktok: { id: "tiktok", name: "TikTok", patterns: [/tiktok\.com/i] },
                            instagram: { id: "instagram", name: "Instagram", patterns: [/instagram\.com/i, /instagr\.am/i] },
                            twitter: { id: "twitter", name: "Twitter/X", patterns: [/twitter\.com/i, /x\.com/i] },
                            facebook: { id: "facebook", name: "Facebook", patterns: [/facebook\.com/i, /fb\.watch/i, /fb\.me/i] },
                            soundcloud: { id: "soundcloud", name: "SoundCloud", patterns: [/soundcloud\.com/i] },
                            spotify: { id: "spotify", name: "Spotify", patterns: [/spotify\.com/i] }
                        }
                        if (platforms.tiktok.patterns.some(pattern => pattern.test(foundUrls[0]))) {
                            m.reply("Processing TikTok link...");
                            const { ttsave } = require('../lib/downloader');
                            const result = await ttsave(foundUrls[0]);
                            if (result.status === 200) {
                                const res = result.data;
                                if (res.type === "slide") {
                                    const images = res.images.map(i => ({ image: { url: i } }));
                                    await sock.sendMessage(chat, { album: images }, { quoted: m });
                                    await sock.sendMessage(chat, {text: 'Want the audio? Click the button below!', footer: config.FOOTER,
                                        interactiveButtons: [
                                            {
                                                name: 'quick_reply',
                                                buttonParamsJson: JSON.stringify({
                                                    display_text: 'Grab Audio',
                                                    id: 'grab_audio ' + res.music.play_url,
                                                })
                                            }
                                        ]
                                    });
                                } else if (res.type === "video") {
                                    await sock.sendMessage(chat, {
                                        video: { url: res.video.hd_play_url || res.video.play_url }, caption: res.title, footer: config.FOOTER,
                                        interactiveButtons: [
                                            {
                                                name: 'quick_reply',
                                                buttonParamsJson: JSON.stringify({
                                                    display_text: 'Grab Audio',
                                                    id: 'grab_audio ' + res.music.play_url,
                                                })
                                            }
                                        ],
                                    }, { quoted: m });
                                }
                            }
                        }
                    }

                    // ── Interactive Response Handler ───────────────────────
                    // Handle button/list responses (e.g., from /allowed command)
                    if (body.startsWith('allowed ')) {
                        // Parse interactive response
                        const interactiveArgs = body.split(' ');
                        const subCmd = interactiveArgs[1];
                        
                        // Handle toggle from list selection
                        if (subCmd === 'toggle' && interactiveArgs.length >= 4) {
                            const chatId = interactiveArgs[2];
                            const action = interactiveArgs[3];
                            
                            const enabled = action === 'enable';
                            await db.toggleAllowedChat(chatId, enabled);
                            
                            const chat = sock.store.chats[chatId];
                            await m.reply(`✓ ${chat?.name || chatId?.split('@')[0]}\nStatus: ${enabled ? '🟢 Enabled' : '🔴 Disabled'}`);
                            
                            // Refresh the list
                            setTimeout(async () => {
                                if (chatId.endsWith('@g.us')) {
                                    await sock.sendMessage(chat, { text: `_${chat?.name || 'Group'} updated_` });
                                }
                            }, 500);
                        }
                        continue;
                    }
                    
                    // ── Commands (PREFIX wajib) ───────────────────────────
                    if (!body.startsWith(PREFIX)) continue;

                    const rawBody = body.slice(PREFIX.length).trim();
                    const args = rawBody.split(/\s+/);
                    const cmd = args.shift().toLowerCase();

                    if (!global.commands.has(cmd)) continue;

                    const quoted = m.quoted || m;
                    const mime = (quoted.msg || quoted).mimetype || "";
                    const qmsg = quoted.msg || quoted;
                    const mod = global.commands.get(cmd);

                    // Check authorization for commands (allow if: config auth, DB allowed number, or allowed chat)
                    const canUseCommand = isAuthorized || isChatAllowed;
                    if (!canUseCommand && !m.fromMe) {
                        continue;
                    }

                    const remaining = isOnCooldown(sender, cmd, mod.cooldown ?? DEFAULT_COOLDOWN);
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