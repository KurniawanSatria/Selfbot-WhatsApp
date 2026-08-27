const fs = require("fs");
const path = require("path");
const { Button } = require("../lib/helper");

const BOT_ROOT = path.join(__dirname, "..");

const EXCLUDE_DIRS = new Set([
  "node_modules",
  "session",
  ".npm",
  "tmp",
  ".git",
  "data",
]);
const MAX_COPY_CHARS = 60000;

function jaro(a, b) {
  a = a.toLowerCase();
  b = b.toLowerCase();
  if (a === b) return 1;
  const lenA = a.length,
    lenB = b.length;
  const matchDist = Math.floor(Math.max(lenA, lenB) / 2) - 1;
  if (matchDist < 0) return 0;
  let matches = 0;
  const aMatch = new Array(lenA).fill(false);
  const bMatch = new Array(lenB).fill(false);
  for (let i = 0; i < lenA; i++) {
    const lo = Math.max(0, i - matchDist);
    const hi = Math.min(lenB - 1, i + matchDist);
    for (let j = lo; j <= hi; j++) {
      if (!bMatch[j] && b[j] === a[i]) {
        aMatch[i] = bMatch[j] = true;
        matches++;
        break;
      }
    }
  }
  if (matches === 0) return 0;
  let t = 0,
    k = 0;
  for (let i = 0; i < lenA; i++) {
    if (aMatch[i]) {
      while (!bMatch[k]) k++;
      if (a[i] !== b[k]) t++;
      k++;
    }
  }
  t /= 2;
  const m = matches;
  let sim = (m / lenA + m / lenB + (m - t) / m) / 3;
  let p = 0;
  const maxPref = Math.min(4, Math.min(lenA, lenB));
  for (let i = 0; i < maxPref; i++) {
    if (a[i] === b[i]) p++;
    else break;
  }
  return sim + p * 0.1 * (1 - sim);
}

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    if (EXCLUDE_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(full, out);
    } else {
      out.push(full);
    }
  }
}

function resolveSafe(inputPath) {
  const abs = path.resolve(BOT_ROOT, inputPath);
  const root = path.resolve(BOT_ROOT);
  if (!abs.startsWith(root + path.sep) && abs !== root) return null;
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
  return abs;
}

module.exports = {
  name: "getfile",
  aliases: ["gf", "file"],
  cooldown: 3000,
  owner: true,
  description:
    "Search bot files by name (fuzzy), then send contents as text with a copy button. .getfile <query> or .getfile <path>",

  async run(sock, m, args, reply, chat) {
    if (!args.length) {
      return reply("⌬ Usage  ›  .getfile <filename> (e.g. `message-upsert`)");
    }

    const rawInput = args.join(" ");

    if (rawInput.includes("/") || rawInput.includes("\\")) {
      const direct = resolveSafe(rawInput);
      if (!direct) {
        return reply("╰─ Invalid path or path is outside the bot directory.");
      }
      return sendFile(sock, m, chat, direct);
    }

    const query = rawInput.toLowerCase();
    const all = [];
    walk(BOT_ROOT, all);

    const scored = all
      .map((f) => {
        const base = path.basename(f).toLowerCase();
        const noExt = base.replace(/\.[^.]+$/, "");
        const score = Math.max(jaro(query, base), jaro(query, noExt));
        return { f, base, score };
      })
      .filter((x) => x.score >= 0.4)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    if (scored.length === 0) {
      return reply(`╰─ No matching file found for "${rawInput}".`);
    }

    if (scored.length === 1) {
      return sendFile(sock, m, chat, scored[0].f);
    }

    const btn = new Button(sock)
      .setBody(
        `「 ${scored.length} MATCHES 」\n${rawInput}\n▸ Select a file to view:`,
      )
      .setFooter("© Saturia")
      .addSelection("Select File");

    for (const s of scored) {
      const relPath = "./" + path.relative(BOT_ROOT, s.f).replace(/\\/g, "/");
      btn.makeSection(path.basename(path.dirname(s.f)) || "root");
      btn.makeRow(
        "",
        s.base,
        `${(s.score * 100).toFixed(0)}% match`,
        `.getfile ${relPath}`,
      );
    }

    await btn.send(chat, { quoted: m });
  },
};

async function sendFile(sock, m, chat, filePath) {
  try {
    const stat = fs.statSync(filePath);
    const name = path.basename(filePath);
    const sizeKB = (stat.size / 1024).toFixed(1);

    if (stat.size > 100 * 1024 * 1024) {
      return sock.sendMessage(
        chat,
        { text: `⌁ File too large (${sizeKB} KB) to send.` },
        { quoted: m },
      );
    }

    const content = fs.readFileSync(filePath, "utf-8");

    if (content.length > MAX_COPY_CHARS) {
      const buf = fs.readFileSync(filePath);

      return sock.sendMessage(
        chat,
        {
          document: buf,
          fileName: name,
          mimetype: "application/octet-stream",
          caption: `「 ${name} 」 (${sizeKB} KB)\n╰─ Content exceeds the copy limit. Sent as a document instead.`,
        },
        { quoted: m },
      );
    }

    const btn = new Button(sock)
      .setBody(`「 ${name} 」 (${sizeKB} KB)\n\n\`\`\`${content}\`\`\``)
      .setFooter("© Saturia")
      .addCopy("Copy File Contents", content);

    await btn.send(chat, { quoted: m });
  } catch (err) {
    await sock.sendMessage(
      chat,
      { text: `╰─ Failed to read or send file: ${err.message}` },
      { quoted: m },
    );
  }
}
