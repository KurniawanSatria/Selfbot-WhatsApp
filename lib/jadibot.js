const {
  default: makeWASocket,
  useMultiFileAuthState,
  MessageStore,
  DisconnectReason,
  fetchLatestBaileysVersion,
  createAntiDeleteHandler,
  getAudioWaveform
} = require('baileys')
const P = require('pino')
const path = require('path')
const fs = require('fs')
const FileType = require('file-type')
const { getRandom, getBuffer, convertToPtt, convertToMp3 } = require('./helper')

const sessions = new Map()

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const loadEvents = async (sock, deps = {}) => {
  const eventsDir = path.join(__dirname, '../events')
  const files = fs.readdirSync(eventsDir).filter(f => f.endsWith('.js'))

  for (const file of files) {
    try {
      const mod = require(path.join(eventsDir, file))

      if (typeof mod.register !== 'function') continue

      if (deps.isClone && file !== 'message.upsert.js') continue

      mod.register(sock, deps)
    } catch (e) {
      global.log?.error?.(`[jadibot] event error ${file}: ${e.message}`)
    }
  }
}

const jadibot = async (reply, client, id) => {
  const num = id.split('@')[0]
  const store = new MessageStore({ maxMessagesPerChat: 500, ttl: 24 * 60 * 60 * 1000 });
  const sessionPath = path.join(__dirname, `../sessions/${num}`)
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath)

  const sock = makeWASocket({
    version: (await fetchLatestBaileysVersion()).version,
    logger: P({ level: 'silent' }),
    auth: state,
    printQRInTerminal: false
  })

  sessions.set(id, sock)

  let pairingSent = false

  sock.ev.on('creds.update', saveCreds)
  sock.store = store
  const antiDeleteHandler = createAntiDeleteHandler(sock.store);
  sock.ev.on("messages.update", async (updates) => {
    const deletedMessages = antiDeleteHandler(updates);

    for (const info of deletedMessages) {
      try {
        if (info.key.fromMe || info.key.remoteJid.endsWith("@newsletter") || info.key.remoteJid.endsWith("@g.us") || info.key.remoteJid.endsWith("@broadcast")) continue //ignore channels or groups message
        await sock.sendMessage(info.key.remoteJid, { forward: info.originalMessage }, { quoted: info.originalMessage });
        await sock.sendImageAsSticker(info.key.remoteJid, "https://i.pinimg.com/736x/b9/ac/df/b9acdf09223d5535c07f45e026d18a1d.jpg");
        global.log?.info(`Anti-delete: forwarded message in ${info.key.remoteJid}`);
      } catch (err) {
        global.log?.error(`Anti-delete error: ${util.format(err)}`);
      }
    }
  });
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update

    if (connection === 'connecting' && !pairingSent) {
      pairingSent = true

      try {
        await sleep(2000)

        if (!sock.authState?.creds?.registered) {
          const code = await sock.requestPairingCode(num, 'JADIBOTZ')
          await client.sendMessage(id, {
            text: 'Your Pairing Code: ' + code, footer: 'Saturia.',
            interactiveButtons: [{
              name: 'cta_copy',
              buttonParamsJson: JSON.stringify({
                display_text: 'Copy Code',
                copy_code: code
              })
            }]
          });
        }
      } catch { }
    }

    if (connection === 'open') {
      reply(`jadibot aktif\nuser: ${sock.user?.id}`)
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode

      if (code !== DisconnectReason.loggedOut) {
        sessions.delete(id)
        reply('reconnect jadibot...')

        return jadibot(reply, client, id)
      }

      sessions.delete(id)
      fs.rm(sessionPath, { recursive: true, force: true }, (err) => {
        if (err) return reply('gagal hapus session')
        reply('session logout total')
      })
    }
  })
  // ── Utility: Download media ───────────────────────────────────────────────
  sock.downloadMediaMessage = async (m) => {
    let msg = m.msg || m;
    if (m.quoted && (m.quoted.msg || m.quoted).mimetype) {
      msg = m.quoted.msg || m.quoted;
    }
    let mime = msg.mimetype || "";
    let messageType = msg.mtype ? msg.mtype.replace(/Message/gi, "") : mime.split("/")[0];
    const stream = await downloadContentFromMessage(msg, messageType);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
  };

  sock.downloadAndSaveMediaMessage = async (
    message,
    filename,
    attachExtension = true
  ) => {
    let quoted = message.msg ? message.msg : message;
    let mime = (message.msg || message).mimetype || "";
    let messageType = message.mtype ? message.mtype.replace(/Message/gi, "") : mime.split("/")[0];
    const stream = await downloadContentFromMessage(quoted, messageType);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }
    let type = await FileType.fromBuffer(buffer);
    trueFileName = attachExtension ? filename + "." + type.ext : filename;
    await fs.writeFileSync(trueFileName, buffer);
    return trueFileName;
  };

  // ── Utility: Forward pesan ────────────────────────────────────────────────
  sock.copyNForward = async (jid, message, forceForward = false, options = {}) => {
    message.message = message.message?.ephemeralMessage?.message || message.message || undefined;
    let mtype = Object.keys(message.message)[0];
    if (message.message[mtype]?.viewOnce) delete message.message[mtype].viewOnce;
    let content = await generateForwardMessageContent(message, forceForward);
    let ctype = Object.keys(content)[0];
    let context = mtype !== "conversation" ? message.message[mtype].contextInfo : {};
    content[ctype].contextInfo = { ...context, ...content[ctype].contextInfo };
    const waMessage = await generateWAMessageFromContent(jid, content,
      options ? { ...content[ctype], ...options, ...(options.contextInfo ? { contextInfo: { ...content[ctype].contextInfo, ...options.contextInfo } } : {}) } : {}
    );
    await sock.relayMessage(jid, waMessage.message, { messageId: waMessage.key.id });
    return waMessage;
  };

  // ── Utility: Kirim gambar sebagai stiker ──────────────────────────────────
  sock.sendImageAsSticker = async (jid, filePath, quoted, options = {}) => {
    let buff = Buffer.isBuffer(filePath) ? filePath
      : /^data:.*?\/.*?;base64,/i.test(filePath) ? Buffer.from(filePath.split`,`[1], "base64")
        : /^https?:\/\//.test(filePath) ? await getBuffer(filePath)
          : fs.existsSync(filePath) ? fs.readFileSync(filePath)
            : Buffer.alloc(0);
    let buffer = await writeExifImg(buff, { packname: "Aku adalah bayanganmu yang tak pernah kau beri nama.", author: "Saturia" });
    return sock.sendMessage(jid, { sticker: { url: buffer }, ...options }, { quoted });
  };

  // ── Utility: Kirim video sebagai stiker ───────────────────────────────────
  sock.sendVideoAsSticker = async (jid, filePath, quoted, options = {}) => {
    let buff = Buffer.isBuffer(filePath) ? filePath
      : /^data:.*?\/.*?;base64,/i.test(filePath) ? Buffer.from(filePath.split`,`[1], "base64")
        : /^https?:\/\//.test(filePath) ? await getBuffer(filePath)
          : fs.existsSync(filePath) ? fs.readFileSync(filePath)
            : Buffer.alloc(0);
    let buffer = await videoToWebp(buff, { packname: "Aku adalah bayanganmu yang tak pernah kau beri nama.", author: "Saturia" });
    return sock.sendMessage(jid, { sticker: { url: buffer }, ...options }, { quoted });
  };
  // ── Utility: Kirim Audio/Pesan Suara ───────────────────────────────────
  sock.sendAudio = async (jid, buffer, options = {}) => {
    const { ptt = false, ...msgOptions } = options;
    let buff = Buffer.isBuffer(buffer) ? buffer
      : /^data:.*?\/.*?;base64,/i.test(buffer) ? Buffer.from(buffer.split`,`[1], "base64")
        : /^https?:\/\//.test(buffer) ? await getBuffer(buffer)
          : fs.existsSync(buffer) ? fs.readFileSync(buffer)
            : Buffer.alloc(0);
    const inputPath = getRandom(".tmp");
    fs.writeFileSync(inputPath, buff);

    let filePath, mimetype;

    try {
      if (ptt) {
        filePath = await convertToPtt(inputPath);
        mimetype = "audio/ogg; codecs=opus";
      } else {
        filePath = await convertToMp3(inputPath);
        mimetype = "audio/mpeg";
      }
    } finally {
      fs.existsSync(inputPath) && fs.unlinkSync(inputPath);
    }

    const outBuffer = fs.readFileSync(filePath);
    const waveform = await getAudioWaveform(outBuffer, logger);
    fs.unlinkSync(filePath);

    return sock.sendMessage(jid, {
      audio: outBuffer,
      mimetype,
      ptt,
      ...(ptt ? { waveform } : {}),
    }, msgOptions);
  };
  const mod = require('../events/message.upsert')
  mod.register(sock)

}

const stopjadibot = async (reply, id) => {
  const sock = sessions.get(id)

  if (!sock) return reply('ga ada session aktif')

  try {
    await sock.logout()
  } catch { }

  sessions.delete(id)

  reply('jadibot dimatikan')
}

const listjadibot = () => Array.from(sessions.keys())

module.exports = {
  jadibot,
  stopjadibot,
  listjadibot
}