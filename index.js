const {
  useMultiFileAuthState,
  MessageStore,
  jidNormalizedUser,
  fetchLatestBaileysVersion,
  Browsers
} = require("baileys");
const { AUTH_DIR } = require("./config");
const { createSocket } = require("./lib/socket");
const db = require("./lib/database");
const fs = require("fs");
const path = require("path");
const pino = require("pino");
const chalk = require("chalk");
const util = require('node:util');
const moment = require('moment-timezone');
// ─── Logger ───────────────────────────────────────────────────────────────────
const time = () => chalk.dim(`[${moment.tz('Asia/Jakarta').format('HH:MM')}]`);
const log = {
  info: (...a) => console.log(time(), chalk.cyan("◆"), ...a),
  success: (...a) => console.log(time(), chalk.green("✔"), ...a),
  warn: (...a) => console.log(time(), chalk.yellow("⚠"), ...a),
  error: (...a) => console.log(time(), chalk.red("✖"), ...a),
  cmd: (...a) => console.log(time(), chalk.magenta("►"), ...a),
  reload: (...a) => console.log(time(), chalk.blue("↻"), ...a),
};
global.log = log;
process.on("uncaughtException", (err) => {
  log.error(`Uncaught Exception: ${util.format(err)}`);
});

process.on("unhandledRejection", (err) => {
  log.error(`Unhandled Rejection: ${util.format(err)}`);
});
// ─── Command Loader ───────────────────────────────────────────────────────────
const cmdDir = path.join(__dirname, "commands");
global.commands = new Map();

function loadCommands() {
  global.commands.clear();
  const files = fs.readdirSync(cmdDir).filter((f) => f.endsWith(".js"));

  for (const file of files) {
    const fullPath = path.join(cmdDir, file);
    delete require.cache[require.resolve(fullPath)];
    const mod = require(fullPath);
    if (!mod.name) continue;
    global.commands.set(mod.name, mod);
    for (const alias of mod.aliases ?? []) global.commands.set(alias, mod);
  }

  const names = [...new Set(global.commands.values())].map((m) => m.name).join(", ");
  global.log.success(chalk.bold(`${files.length} command(s) loaded`) + chalk.dim(` → [${names}]`));
}

function watchCommands() {
  for (const file of fs.readdirSync(cmdDir).filter((f) => f.endsWith(".js"))) {
    const fullPath = require.resolve(path.join(cmdDir, file));
    fs.watchFile(fullPath, { interval: 500 }, () => {
      global.log.reload(`Hot-reload: ${chalk.yellow(file)}`);
      loadCommands();
    });
  }
}


loadCommands();
watchCommands();


async function loadEvents(sock, deps = {}) {
  const eventsDir = path.join(__dirname, "events");
  const files = fs.readdirSync(eventsDir).filter((f) => f.endsWith(".js"));

  for (const file of files) {
    try {
      const mod = require(path.join(eventsDir, file));

      if (typeof mod.register !== "function") {
        global.log?.warn(`[EventLoader] Skipping ${file}: no register() export`);
        continue;
      }

      mod.register(sock, deps);
      global.log?.info(`[EventLoader] Loaded: ${file}`);
    } catch (err) {
      global.log?.error(`[EventLoader] Failed to load ${file}: ${err.message}`);
    }
  }
}

function getStoreChatCount(store) {
  const chats = store?.chats;
  if (!chats) return 0;
  if (typeof chats.size === "number") return chats.size;
  if (Array.isArray(chats)) return chats.length;
  if (typeof chats === "object") return Object.keys(chats).length;
  return 0;
}
// ─── Start ────────────────────────────────────────────────────────────────────
const start = async () => {
  const store = new MessageStore({ maxMessagesPerChat: 500, ttl: 24 * 60 * 60 * 1000 });
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  const logger = pino({ level: "silent" })
  global.logger = logger
  global.log.info(`Baileys version: ${chalk.cyan(version.join("."))}`);

  const connectionOptions = {
    version,
    auth: state,
    printQRInTerminal: false,
    logger,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 0,
    generateHighQualityLinkPreview: true,

    patchMessageBeforeSending: (message) => {
      const requiresPatch = !!(
        message.buttonsMessage ||
        message.templateMessage ||
        message.listMessage
      );
      if (requiresPatch) {
        message = {
          viewOnceMessage: {
            message: {
              messageContextInfo: {
                deviceListMetadataVersion: 2,
                deviceListMetadata: {},
              },
              ...message,
            },
          },
        };
      }
      return message;
    },

    getMessage: async (key) => {
      const jid = jidNormalizedUser(key.remoteJid);
      const msg = await store.loadMessage(jid, key.id);
      return msg?.message || "";
    },
  }
  const sock = await createSocket(connectionOptions);
  sock.store = store

  // Initialize database
  try {
    await db.init();
    global.db = db.db;
    global.log.success('Database initialized');
    
    // Auto-load all chats from store
    await db.loadAllChatsFromStore(sock.store);
    global.log.success(`Loaded ${getStoreChatCount(store)} chats to database`);
  } catch (err) {
    global.log.error(`Database init error: ${err.message}`);
  }

  await loadEvents(sock, { saveCreds, restartFn: start });
  return sock;
}

start().catch((err) => {
  global.log.error("Fatal error:", JSON.stringify(util.format(err), null, 2));
  process.exit(1);
});

// ─── Hot-reload ───────────────────────────────────────────────────────────────
let file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  log.reload(`${__filename} updated, restarting...`);
  delete require.cache[file];
  process.send("reset");
  require(file);
});
