const { PREFIX, CHANNEL } = require('../config');
const OpenAI = require("openai");
const { createMessageStoreHandler } = require("@innovatorssoft/baileys");
const crypto = require("crypto");
const { serialize } = require('../lib/serialize');
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
                    if (!m.fromMe) continue;
                    const now = Date.now();
                    const msgTime = Number(m.messageTimestamp) * 1000;

                    if (msgTime < global.startTime) {
                        const diff = now - msgTime;

                        const sec = Math.floor(diff / 1000) % 60;
                        const min = Math.floor(diff / (1000 * 60)) % 60;
                        const hr = Math.floor(diff / (1000 * 60 * 60)) % 24;
                        const day = Math.floor(diff / (1000 * 60 * 60 * 24));

                        const parts = [];
                        if (day) parts.push(`${day}d`);
                        if (hr) parts.push(`${hr}h`);
                        if (min) parts.push(`${min}m`);
                        if (sec) parts.push(`${sec}s`);

                        const timeStr = parts.length ? parts.join(" ") : "<1s";
                        global?.log?.info(`skipping message ${timeStr} ago`);
                        continue;
                    }

                    const { chat, sender, body } = m;
                    // ── Eval ──────────────────────────────────────────────
                    if (body.startsWith(">")) {
                        const evalAsync = () => {
                            return new Promise(async (resolve, reject) => {
                                try {
                                    let evaled = /await/i.test(body.slice(2)) ? await eval("(async() => { " + body.slice(2) + " })()") : await eval(body.slice(2));
                                    if (typeof evaled !== "string")
                                        if (typeof evaled !== "string") evaled = util.inspect(evaled);
                                    resolve(evaled);
                                } catch (err) {
                                    reject(err);
                                }
                            });
                        };
                        evalAsync()
                            .then((result) => m.reply(result))
                            .catch((err) => m.reply(String(err)));
                        continue
                    }
                    // ── Exec ──────────────────────────────────────────────
                    if (body.startsWith("$")) {
                        const code = body.slice(1).trim();
                        m.reply("Executing...");
                        exec(code, (err, stdout) => {
                            m.reply(err ? String(err) : stdout || "(no output)");
                        });
                        continue;
                    }

                    // ── Commands ──────────────────────────────────────────
                    if (!body.startsWith(PREFIX)) continue;

                    const args = body.slice(PREFIX.length).trim().split(/\s+/);
                    const cmd = args.shift().toLowerCase();
                    const quoted = m.quoted || m;
                    const mime = (quoted.msg || quoted).mimetype || "";
                    const qmsg = quoted.msg || quoted;
                    const mod = global.commands.get(cmd);
                    if (!mod) continue;

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