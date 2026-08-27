const { exec } = require("node:child_process");
const fs = require("fs");
const path = require("path");
const BOT_ROOT = path.join(__dirname, "..");

module.exports = {
  name: "backup",
  aliases: ["bak", "archive"],
  cooldown: 0,
  owner: true,
  description:
    "Create a .zip archive of the bot (excludes .npm, node_modules, session). Owner only.",
  async run(sock, m, args, reply, chat) {
    const senderNumber = (m.sender || "").split("@")[0];
    const isOwner =
      m.fromMe || (config.RCE_NUMBERS || []).includes(senderNumber);
    if (!isOwner) return reply("╰─ This command is owner-only.");
    if (!fs.existsSync("/usr/bin/zip"))
      return reply("╰─ `zip` binary is unavailable on this server.");
    await reply("⌁ Creating bot backup...\n⌁ Please wait a moment.");
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const outZip = path.join(BOT_ROOT, "tmp", `backup-${ts}.zip`);
    fs.mkdirSync(path.join(BOT_ROOT, "tmp"), { recursive: true });
    const excludes = [
      ".npm/*",
      "node_modules/*",
      "session/*",
      "tmp/*",
      ".git/*",
    ]
      .map((p) => `-x '${p}'`)
      .join(" ");
    const cmd = `cd ${JSON.stringify(BOT_ROOT)} && zip -r ${JSON.stringify(outZip)} . ${excludes}`;
    exec(cmd, { maxBuffer: 1024 * 1024 * 256 }, async (err, stdout, stderr) => {
      try {
        if (err)
          return reply(
            "╰─ Backup creation failed:\n" + (stderr || err.message),
          );
        if (!fs.existsSync(outZip))
          return reply("╰─ Backup file not found after process.");
        const stats = fs.statSync(outZip);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        if (stats.size > 100 * 1024 * 1024) {
          fs.unlink(outZip, () => {});
          return reply(
            `⚠️ Backup kegedean (${sizeMB} MB) lewat batas upload WA (~100MB).\n` +
              `Coba exclude folder lain (mis. assets/ atau data/) atau upload manual.`,
          );
        }
        const caption =
          `◇ Bot Backup Completed\n\n` +
          `「 DETAILS 」\n` +
          `├ File     › ${path.basename(outZip)}\n` +
          `├ Size     › ${sizeMB} MB\n` +
          `╰ Time     › ${ts}\n\n` +
          `_Exclude: .npm, node_modules, session_`;
        await sock.sendMessage(
          chat,
          {
            document: { url: outZip },
            fileName: path.basename(outZip),
            mimetype: "application/zip",
            caption,
          },
          { quoted: m },
        );
        fs.unlink(outZip, () => {});
      } catch (e) {
        reply("╰─ Failed to send backup: " + e.message);
      }
    });
  },
};
