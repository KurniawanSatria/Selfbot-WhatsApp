const {
  default: makeWASocket,
  generateForwardMessageContent,
  generateWAMessageFromContent,
  downloadContentFromMessage,
  downloadMediaMessage,
  getContentType,
  makeInMemoryStore
} = require("@innovatorssoft/baileys");
const pino = require("pino");
const { getRandom, getBuffer, convertToPtt, convertToMp3 } = require("./helper");
const { writeExifImg, videoToWebp } = require("./sticker");
const fs = require("fs");
const path = require("path");

const logger = pino({ level: "silent" });
const store = makeInMemoryStore({ logger: pino().child({ level: "silent" }) });
// Tidak perlu async — makeWASocket synchronous
exports.createSocket = (connectionOptions) => {
  const sock = makeWASocket(connectionOptions);
  if (!sock) {
    global.log?.error?.("makeWASocket returned undefined");
    return null;
  }
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

    const inputPath = getRandom(".tmp");
    fs.writeFileSync(inputPath, buffer);

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
    fs.unlinkSync(filePath);

    return sock.sendMessage(jid, {
      audio: outBuffer,
      mimetype,
      ptt,
      ...(ptt ? { waveform: new Uint8Array(64) } : {}),
    }, msgOptions);
  };
  sock.sendAudioV2 = async (jid, buffer) => {
    const inputPath = getRandom(".tmp");
    fs.writeFileSync(inputPath, buffer);
    let filePath, mimetype;
    try {
        filePath = await convertToPtt(inputPath);
        mimetype = "audio/ogg";
    } finally {
      fs.existsSync(inputPath) && fs.unlinkSync(inputPath);
    }

    const outBuffer = fs.readFileSync(filePath);
    fs.unlinkSync(filePath);
    return sock.sendMessage(jid, {audio: outBuffer, mimetype, ptt})
  };


  return sock;
}


let file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  delete require.cache[file];
  require(file);
});