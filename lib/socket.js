const {
  default: makeWASocket,
  generateForwardMessageContent,
  generateWAMessageFromContent,
  downloadContentFromMessage,
  downloadMediaMessage,
  getContentType,
  makeInMemoryStore,
  getAudioWaveform
} = require("baileys");
const pino = require("pino");
const { getRandom, getBuffer, convertToPtt, convertToMp3 } = require("./helper");
const { writeExifImg, videoToWebp } = require("./sticker");
const fs = require("fs");
const path = require("path");
const logger = pino({ level: "error" });
const store = makeInMemoryStore({ logger: pino().child({ level: "error" }) });

exports.createSocket = (connectionOptions) => {
  const sock = makeWASocket(connectionOptions);
  if (!sock) {
    global.log?.error?.("makeWASocket returned undefined");
    return null;
  }
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

  sock.sendImageAsSticker = async (jid, filePath, quoted, options = {}) => {
    let buff = Buffer.isBuffer(filePath) ? filePath
      : /^data:.*?\/.*?;base64,/i.test(filePath) ? Buffer.from(filePath.split`,`[1], "base64")
        : /^https?:\/\//.test(filePath) ? await getBuffer(filePath)
          : fs.existsSync(filePath) ? fs.readFileSync(filePath)
            : Buffer.alloc(0);
    let buffer = await writeExifImg(buff, { packname: "Aku adalah bayanganmu yang tak pernah kau beri nama.", author: "Saturia" });
    return sock.sendMessage(jid, { sticker: { url: buffer }, ...options }, { quoted });
  };

  sock.sendVideoAsSticker = async (jid, filePath, quoted, options = {}) => {
    let buff = Buffer.isBuffer(filePath) ? filePath
      : /^data:.*?\/.*?;base64,/i.test(filePath) ? Buffer.from(filePath.split`,`[1], "base64")
        : /^https?:\/\//.test(filePath) ? await getBuffer(filePath)
          : fs.existsSync(filePath) ? fs.readFileSync(filePath)
            : Buffer.alloc(0);
    let buffer = await videoToWebp(buff, { packname: "Aku adalah bayanganmu yang tak pernah kau beri nama.", author: "Saturia" });
    return sock.sendMessage(jid, { sticker: { url: buffer }, ...options }, { quoted });
  };
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
    return sock.sendMessage(jid, { audio: outBuffer, mimetype, ptt: true })
  };

  return sock;
};

exports.createChildSocket = async (parentSocket, botInstance) => {
  const childSocket = makeWASocket({
    ...parentSocket.options,
    auth: parentSocket.auth,
    logger: parentSocket.logger,
    store: parentSocket.store,
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 0,
    generateHighQualityLinkPreview: true,
  });

  childSocket.downloadMediaMessage = parentSocket.downloadMediaMessage;
  childSocket.downloadAndSaveMediaMessage = parentSocket.downloadAndSaveMediaMessage;
  childSocket.copyNForward = parentSocket.copyNForward;
  childSocket.sendImageAsSticker = parentSocket.sendImageAsSticker;
  childSocket.sendVideoAsSticker = parentSocket.sendVideoAsSticker;
  childSocket.sendAudio = parentSocket.sendAudio;
  childSocket.sendAudioV2 = parentSocket.sendAudioV2;

  const eventsDir = path.join(__dirname, "..", "events");
  const files = fs.readdirSync(eventsDir).filter((f) => f.endsWith(".js"));

  for (const file of files) {
    try {
      const mod = require(path.join(eventsDir, file));

      if (typeof mod.register !== "function") {
        continue;
      }

      mod.register(childSocket, { saveCreds: parentSocket.options.auth.saveCreds, restartFn: async () => {} });
    } catch (err) {
    }
  }

  return childSocket;
};

let file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  delete require.cache[file];
  require(file);
});