require("dotenv").config();
const {
  useMultiFileAuthState,
  jidNormalizedUser,
  fetchLatestBaileysVersion,
  Browsers,
  generateWAMessageFromContent,
} = require("baileys");
const sharp = require("sharp");
const AUTH_DIR = process.env.AUTH_DIR || "./session";
const FEATURES = {
  AUTO_DOWNLOAD: process.env.AUTO_DOWNLOAD === "true",
  AUTO_READ: process.env.AUTO_READ === "true",
  ALWAYS_ONLINE: process.env.ALWAYS_ONLINE === "true",
  TYPING_INDICATOR: process.env.TYPING_INDICATOR === "true",
  ANTI_DELETE: process.env.ANTI_DELETE === "true",
  AUTO_REJECT_CALL: process.env.AUTO_REJECT_CALL === "true",
};
const CALL_WHITELIST = process.env.CALL_WHITELIST ? process.env.CALL_WHITELIST.split(",").map(s => s.trim()) : [];
const { createSocket } = require("./lib/socket");
const storeModule = require("./lib/store");
const makeInMemoryStore =
  storeModule.makeInMemoryStore || storeModule.default?.makeInMemoryStore;
const db = require("./lib/database");
const fs = require("fs");
const path = require("path");
const pino = require("pino");
const chalk = require("chalk");
const util = require("node:util");
const moment = require("moment-timezone");

const time = () => chalk.dim(`[${moment.tz("Asia/Jakarta").format("HH:MM")}]`);
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

  const names = [...new Set(global.commands.values())]
    .map((m) => m.name)
    .join(", ");
  global.log.success(chalk.bold(`${files.length} command(s) loaded`));
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
        global.log?.warn(
          `[EventLoader] Skipping ${file}: no register() export`,
        );
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

const start = async () => {
  const store = makeInMemoryStore();
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  const logger = pino({ level: "silent" });
  global.logger = logger;
  global.log.info(`Baileys version: ${chalk.cyan(version.join("."))}`);

  const connectionOptions = {
    version,
    auth: state,
    printQRInTerminal: false,
    logger,
    markOnlineOnConnect: true,
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
  };

  const sock = await createSocket(connectionOptions);

  store.bind(sock.ev);

  sock.store = store;

  try {
    await db.init();
    global.db = db.db;
    global.log.success("Database initialized");

    await db.loadAllChatsFromStore(sock.store);
    global.log.success(`Loaded ${getStoreChatCount(store)} chats to database`);

    setInterval(
      async () => {
        try {
          const cleaned = await db.cleanupExpiredSessions();
          if (cleaned > 0) {
            global.log.info(`Cleaned up ${cleaned} expired sessions`);
          }
        } catch (err) {
          global.log.error(`Session cleanup error: ${err.message}`);
        }
      },
      60 * 60 * 1000,
    ); // Run every hour
  } catch (err) {
    global.log.error(`Database init error: ${err.message}`);
  }

  await loadEvents(sock, { saveCreds, restartFn: start });
  const processedCalls = new Set();
  sock.ev.on("call", async (calls) => {
    if (!FEATURES?.AUTO_REJECT_CALL) return;
    const call = calls[0];
    if (!call || processedCalls.has(call.id)) return;
    processedCalls.add(call.id);
    setTimeout(() => processedCalls.delete(call.id), 300000);
    const callerNumber = call.from.split("@")[0];
    if ((CALL_WHITELIST || []).includes(callerNumber)) return;
    try {
      await sock.rejectCall(call.id, call.from);
      const thumbBuffer = await sharp(fs.readFileSync("assets/call.png"))
        .resize(300, 300)
        .toBuffer();
      const msg = generateWAMessageFromContent(
        call.from,
        {
          buttonsMessage: {
            contentText: "Your call has been rejected by auto-reject.",
            footerText: "© Saturia",
            headerType: 6,
            locationMessage: {
              degreesLatitude: 0,
              degreesLongitude: 0,
              name: "Saturia",
              address: "Self Bot",
              jpegThumbnail: thumbBuffer,
            },
            viewOnce: true,
            buttons: [
              {
                buttonId: "sada",
                buttonText: { displayText: "SHUT THE FUCK UP" },
                type: 1,
              },
            ],
          },
        },
        {},
      );
      await sock.relayMessage(call.from, msg.message, {
        messageId: msg.key.id,
        additionalNodes: [
          {
            tag: "biz",
            attrs: {},
            content: [
              {
                tag: "interactive",
                attrs: { type: "native_flow", v: "1" },
                content: [
                  { tag: "native_flow", attrs: { v: "9", name: "mixed" } },
                ],
              },
            ],
          },
        ],
      });
    } catch (e) {
      global.log?.error(`Auto-reject call error: ${e.message}`);
    }
  });

  return sock;
};

start().catch((err) => {
  global.log.error("Fatal error:", JSON.stringify(util.format(err), null, 2));
  process.exit(1);
});

let file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  log.reload(`${__filename} updated, restarting...`);
  delete require.cache[file];
  if (typeof process.send === "function") {
    process.send("reset");
  } else {
    process.exit(0);
  }
});
