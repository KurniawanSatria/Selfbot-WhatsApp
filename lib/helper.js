const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const axios = require("axios"); // ← tambah ini
const { TMP_DIR } = require("../config");

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR);

const getRandom = (ext) =>
  path.join(TMP_DIR, `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function convertToPtt(inputPath) {
  const outputPath = getRandom(".ogg");
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioCodec("libopus")
      .format("ogg")
      .audioBitrate("48k")
      .audioChannels(1)
      .outputOptions(["-vn", "-avoid_negative_ts make_zero"])
      .on("end", () => resolve(outputPath))
      .on("error", reject)
      .save(outputPath);
  });
}

async function convertToMp3(inputPath) {
  const outputPath = getRandom(".mp3");
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioCodec("libmp3lame")
      .format("mp3")
      .audioFrequency(44100)
      .audioChannels(2)
      .audioBitrate("128k")
      .on("end", () => resolve(outputPath))
      .on("error", reject)
      .save(outputPath);
  });
}

async function sendAudio(sock, jid, buffer, ptt = false, options = {}) {
  const inputPath = getRandom(".tmp");
  fs.writeFileSync(inputPath, buffer);

  let filePath, mimetype;

  if (ptt) {
    filePath = await convertToPtt(inputPath);
    mimetype = "audio/ogg; codecs=opus";
  } else {
    filePath = await convertToMp3(inputPath);
    mimetype = "audio/mpeg";
  }

  fs.unlinkSync(inputPath);
  const outBuffer = fs.readFileSync(filePath);
  fs.unlinkSync(filePath);

  await sock.sendMessage(jid, {
    audio: outBuffer,
    mimetype,
    ptt,
    ...(ptt ? {
      waveform: [
        1, 18, 32, 49, 70, 61, 50, 81, 64, 77, 71, 85,
        62, 52, 84, 68, 86, 62, 84, 74, 50, 80, 77, 65,
        100, 61, 73, 72, 69, 76, 99, 76, 87, 67, 83, 84,
        53, 96, 84, 81, 61, 78, 83, 53, 94, 87, 82, 74,
        83, 83, 49, 81, 94, 85, 74, 88, 89, 60, 82, 90,
        78, 46, 45, 7
      ]
    } : {}),
  }, options);
}

async function getBuffer(url, options = {}) {
  const res = await axios({
    method: "get",
    url,
    headers: { DNT: 1, "Upgrade-Insecure-Request": 1 },
    ...options,
    responseType: "arraybuffer",
  });
  return Buffer.from(res.data);
}
async function fetchJson(url, options = {}) {
  const res = await axios({
    method: "get",
    url,
    headers: { DNT: 1, "Upgrade-Insecure-Request": 1 },
    ...options,
    responseType: "json",
  });
  return res.data;
}

const convertToOgg = convertToPtt; // backward compat

const os = require('node:os');
const { randomBytes, createHash, createHmac, createCipheriv, randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { PassThrough, Readable } = require('stream');
const baileys = require('baileys');

let _fileTypeFromBuffer = null;
async function fileTypeFromBuffer(buf) {
  if (!_fileTypeFromBuffer) {
    const mod = await import('file-type');
    _fileTypeFromBuffer = mod.fileTypeFromBuffer;
  }
  return _fileTypeFromBuffer(buf);
}

let ffmpegPath;
try {
  ffmpegPath = require('ffmpeg-static');
} catch {
  try {
    ffmpegPath = require('fluent-ffmpeg').ffmpegPath() || 'ffmpeg';
  } catch {
    ffmpegPath = 'ffmpeg';
  }
}

let patchMessageId, generateMessageID;
try {
  const patchMod = require('./core/patchMsgId.js');
  patchMessageId = patchMod.patchMessageId;
  generateMessageID = patchMod.generateMessageID;
} catch {
  patchMessageId = (sock) => sock;
  generateMessageID = () => require('node:crypto').randomUUID();
}

let sharp;
try {
  sharp = require('sharp');
} catch {
  sharp = null;
}

const {
  downloadContentFromMessage,
  prepareWAMessageMedia,
  generateWAMessage,
  generateWAMessageFromContent,
  getMediaKeys,
  unixTimestampSeconds,
  generateMessageIDV2,
  proto,
  MEDIA_HKDF_KEY_MAPPING,
  MEDIA_PATH_MAP
} = baileys;

if (!MEDIA_HKDF_KEY_MAPPING['sticker-pack']) {
  MEDIA_HKDF_KEY_MAPPING['sticker-pack']           = 'Sticker Pack'
  MEDIA_HKDF_KEY_MAPPING['thumbnail-sticker-pack'] = 'Sticker Pack Thumbnail'
  MEDIA_PATH_MAP['sticker-pack']                    = '/mms/sticker-pack'
  MEDIA_PATH_MAP['thumbnail-sticker-pack']          = '/mms/thumbnail-sticker-pack'
}

const STK_TMP = path.join(os.tmpdir(), 'fearless-stickerpack')

function run(file, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child  = spawn(file, args, { ...options })
    const stdout = []
    const stderr = []
    if (child.stdout) child.stdout.on('data', d => stdout.push(d))
    if (child.stderr) child.stderr.on('data', d => stderr.push(d))
    child.on('error', reject)
    child.on('close', code => {
      const result = {
        code,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr)
      }
      if (code === 0) resolve(result)
      else reject(Object.assign(new Error(`${file} exited with code ${code}`), result))
    })
  })
}

async function tmpFile(ext) {
  await fs.promises.mkdir(STK_TMP, { recursive: true })
  return path.join(STK_TMP, `${randomBytes(10).toString('hex')}${ext ? '.' + ext : ''}`)
}

const isWebP = buf =>
  buf && buf.length >= 12 &&
  buf.toString('ascii', 0, 4) === 'RIFF' &&
  buf.toString('ascii', 8, 12) === 'WEBP'

function isAnimatedWebP(buf) {
  if (!isWebP(buf)) return false
  try {
    let off = 12
    while (off + 8 <= buf.length) {
      const id = buf.toString('ascii', off, off + 4)
      const sz = buf.readUInt32LE(off + 4)
      if (id === 'VP8X') return ((buf[off + 8] ?? 0) & 0x02) !== 0
      off += 8 + sz + (sz % 2)
    }
  } catch {}
  return false
}

async function toWebp(buf) {
  if (isWebP(buf)) return buf
  const src = await tmpFile('')
  const out = await tmpFile('webp')
  await fs.promises.writeFile(src, buf)
  try {
    await run(ffmpegPath, ['-y', '-i', src, '-vcodec', 'libwebp', '-lossless', '1', '-loop', '0', '-an', '-vsync', '0', out])
    return await fs.promises.readFile(out)
  } finally {
    fs.promises.unlink(src).catch(() => {})
    fs.promises.unlink(out).catch(() => {})
  }
}

async function toJpegThumb(buf, size = 252) {
  const src = await tmpFile('')
  const out = await tmpFile('jpg')
  await fs.promises.writeFile(src, buf)
  try {
    await run(ffmpegPath, [
      '-y', '-i', src,
      '-vf', `scale=${size}:${size}:force_original_aspect_ratio=increase,crop=${size}:${size}`,
      '-q:v', '3', out
    ])
    return await fs.promises.readFile(out)
  } finally {
    fs.promises.unlink(src).catch(() => {})
    fs.promises.unlink(out).catch(() => {})
  }
}

async function resolveBuffer(src) {
  if (!src) return null
  if (Buffer.isBuffer(src)) return src
  if (src instanceof Uint8Array) return Buffer.from(src)
  if (typeof src === 'string') {
    if (fs.existsSync(src)) return fs.readFileSync(src)
    if (/^https?:\/\//i.test(src)) {
      const r = await fetch(src, { signal: AbortSignal.timeout(30000) })
      if (!r.ok) throw new Error(`Fetch gagal ${r.status}: ${src}`)
      return Buffer.from(await r.arrayBuffer())
    }
    if (src.startsWith('data:')) return Buffer.from(src.split(',', 2)[1] || '', 'base64')
    throw new Error(`Sumber string tidak dikenali: ${src.slice(0, 80)}`)
  }
  if (typeof src === 'object') {
    return resolveBuffer(src.data ?? src.buffer ?? src.url ?? src.path ?? null)
  }
  return null
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function storeZip(entries) {
  const locals  = []
  const central = []
  let offset    = 0

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8')
    const crc     = crc32(data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, nameBuf, data)

    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4)
    cd.writeUInt16LE(20, 6)
    cd.writeUInt16LE(0, 8)
    cd.writeUInt16LE(0, 10)
    cd.writeUInt16LE(0, 12)
    cd.writeUInt16LE(0, 14)
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(data.length, 20)
    cd.writeUInt32LE(data.length, 24)
    cd.writeUInt16LE(nameBuf.length, 28)
    cd.writeUInt16LE(0, 30)
    cd.writeUInt16LE(0, 32)
    cd.writeUInt16LE(0, 34)
    cd.writeUInt16LE(0, 36)
    cd.writeUInt32LE(0, 38)
    cd.writeUInt32LE(offset, 42)
    central.push(cd, nameBuf)

    offset += local.length + nameBuf.length + data.length
  }

  const localPart   = Buffer.concat(locals)
  const centralPart = Buffer.concat(central)
  const eocd        = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralPart.length, 12)
  eocd.writeUInt32LE(localPart.length, 16)
  return Buffer.concat([localPart, centralPart, eocd])
}

async function sendStickerPack(sock, jid, data = {}, options = {}) {
  const {
    cover,
    stickers    = [],
    name        = 'Sticker Pack',
    publisher   = 'Unknown',
    description = '',
    emojis: defaultEmojis = ['\uD83C\uDFA8'],
    origin      = 'USER_CREATED'
  } = data

  if (!stickers.length) throw new Error('sendStickerPack: stickers tidak boleh kosong')
  if (!cover)           throw new Error('sendStickerPack: cover wajib diisi')

  const encryptForUpload = async (plaintext, mediaType, providedMediaKey = null) => {
    const mediaKey  = providedMediaKey ? Buffer.from(providedMediaKey) : randomBytes(32)
    const { iv, cipherKey, macKey } = await getMediaKeys(mediaKey, mediaType)
    const cipher    = createCipheriv('aes-256-cbc', cipherKey, iv)
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
    const mac       = createHmac('sha256', macKey).update(iv).update(ciphertext).digest().slice(0, 10)
    const encrypted = Buffer.concat([ciphertext, mac])
    return {
      mediaKey,
      encrypted,
      fileSha256:    createHash('sha256').update(plaintext).digest(),
      fileEncSha256: createHash('sha256').update(encrypted).digest(),
      fileLength:    plaintext.length
    }
  }

  const writeTempAndUpload = async (encrypted, mediaType) => {
    const tmp = await tmpFile('enc')
    await fs.promises.writeFile(tmp, encrypted.encrypted)
    try {
      const result = await sock.waUploadToServer(tmp, {
        mediaType,
        fileEncSha256B64: encrypted.fileEncSha256.toString('base64'),
        timeoutMs: 60000
      })
      if (!result?.directPath) throw new Error(`Upload ${mediaType} gagal: tidak ada directPath`)
      return result
    } finally {
      fs.promises.unlink(tmp).catch(() => {})
    }
  }

  const packId      = options.packId || generateMessageIDV2()
  const zipEntries  = []
  const stickerMeta = []

  for (let i = 0; i < stickers.length; i++) {
    const s      = stickers[i]
    const srcBuf = await resolveBuffer(s.data ?? s.sticker ?? s.url ?? s.path ?? s)
    if (!srcBuf) {
      console.warn(`[sendStickerPack] sticker #${i + 1} dilewati (buffer kosong)`)
      continue
    }
    const webpBuf  = await toWebp(srcBuf)
    const fileName = `${createHash('sha256').update(webpBuf).digest('base64url')}.webp`
    if (!zipEntries.some(e => e.name === fileName)) zipEntries.push({ name: fileName, data: webpBuf })
    stickerMeta.push({
      fileName,
      mimetype:          'image/webp',
      isAnimated:        isAnimatedWebP(webpBuf),
      isLottie:          false,
      emojis:            Array.isArray(s.emojis) && s.emojis.length ? s.emojis : defaultEmojis,
      accessibilityLabel: s.accessibilityLabel || s.label || ''
    })
  }

  if (!stickerMeta.length) throw new Error('sendStickerPack: tidak ada sticker valid')

  const coverBuf       = await resolveBuffer(cover.data ?? cover)
  if (!coverBuf)       throw new Error('sendStickerPack: cover gagal dimuat')
  const trayIconFileName = `${packId}.webp`
  zipEntries.push({ name: trayIconFileName, data: await toWebp(coverBuf) })

  const zipBuffer = storeZip(zipEntries)

  const packEnc    = await encryptForUpload(zipBuffer, 'sticker-pack')
  const packUpload = await writeTempAndUpload(packEnc, 'sticker-pack')

  let thumbBuf = await toJpegThumb(coverBuf, 252).catch(() => null)
  if (!thumbBuf?.length) thumbBuf = coverBuf

  const thumbEnc    = await encryptForUpload(thumbBuf, 'thumbnail-sticker-pack', packEnc.mediaKey)
  const thumbUpload = await writeTempAndUpload(thumbEnc, 'thumbnail-sticker-pack')

  const Origin             = proto.Message.StickerPackMessage.StickerPackOrigin
  const stickerPackMessage = {
    stickerPackId:       packId,
    name:                name || 'Sticker Pack',
    publisher:           publisher || 'Unknown',
    stickers:            stickerMeta,
    fileLength:          zipBuffer.length,
    fileSha256:          packEnc.fileSha256,
    fileEncSha256:       packEnc.fileEncSha256,
    mediaKey:            packEnc.mediaKey,
    directPath:          packUpload.directPath,
    packDescription:     description || `${stickerMeta.length} stickers`,
    mediaKeyTimestamp:   unixTimestampSeconds(),
    trayIconFileName,
    thumbnailDirectPath: thumbUpload.directPath,
    thumbnailSha256:     thumbEnc.fileSha256,
    thumbnailEncSha256:  thumbEnc.fileEncSha256,
    thumbnailHeight:     252,
    thumbnailWidth:      252,
    imageDataHash:       createHash('sha256').update(thumbBuf).digest('base64'),
    stickerPackSize:     zipBuffer.length,
    stickerPackOrigin:   Origin[origin] ?? Origin.USER_CREATED
  }

  if (options.quoted?.key) {
    stickerPackMessage.contextInfo = {
      stanzaId:      options.quoted.key.id,
      participant:   options.quoted.key.participant || options.quoted.key.remoteJid,
      quotedMessage: options.quoted.message || { conversation: '' }
    }
  }

  const content = {
    messageContextInfo: { messageSecret: randomBytes(32) },
    stickerPackMessage
  }

  return sock.relayMessage(jid, content, { messageId: options.messageId })
}


const FALLBACK_JPEG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8/5+hnoEIwDiqkL4KA' +
    'A/0E/8fJ9hBAAAAAElFTkSuQmCC',
  'base64'
);

async function uploadLinkThumb(sock, url, fallbackSize) {
  const WAMC = await prepareWAMessageMedia(
    { image: { url } },
    { upload: sock.waUploadToServer, mediaTypeOverride: "thumbnail-link" }
  );
  const i = WAMC.imageMessage || WAMC;
  return {
    image: i,
    meta: {
      thumbnailDirectPath: i.directPath,
      thumbnailSha256: i.fileSha256 ? Buffer.from(i.fileSha256).toString("base64") : "",
      thumbnailEncSha256: i.fileEncSha256 ? Buffer.from(i.fileEncSha256).toString("base64") : "",
      mediaKey: i.mediaKey ? Buffer.from(i.mediaKey).toString("base64") : "",
      mediaKeyTimestamp: i.mediaKeyTimestamp || Math.floor(Date.now() / 1000),
      thumbnailHeight: i.height || fallbackSize.h,
      thumbnailWidth: i.width || fallbackSize.w
    }
  };
}

function extractIE(text, { extract = true, hyperlink = true, citation = true, latex = true } = {}) {
  if (!extract) return { text, ie: [], inline_entities: [] };

  const createIE = (type, ie) => {
    if (type === "hyperlink") return {
      key: ie.key,
      metadata: { display_name: ie.text, is_trusted: ie.is_trusted, url: ie.url, __typename: "GenAIInlineLinkItem" }
    };
    if (type === "citation") return {
      key: ie.key,
      metadata: { reference_id: ie.reference_id, reference_url: ie.url, reference_title: ie.url, reference_display_name: ie.url, sources: [], __typename: "GenAISearchCitationItem" }
    };
    if (type === "latex") return {
      key: ie.key,
      metadata: { latex_expression: ie.text, latex_image: { url: ie.url, width: Number(ie.width) || 100, height: Number(ie.height) || 100 }, font_height: Number(ie.font_height) || 83.333333333333, padding: Number(ie.padding) || 15, __typename: "GenAILatexItem" }
    };
  };

  let ie = [], inline_entities = [], result = "", last = 0;
  let citation_index = 1, hyperlink_index = 0, latex_index = 0;
  const stack = [];

  for (let i = 0; i < text.length; i++) {
    if (text[i] === "[" && text[i - 1] !== "\\") {
      stack.push(i);
    } else if (text[i] === "]" && (text[i + 1] === "(" || text[i + 1] === "<")) {
      const start = stack.pop();
      if (start == null) continue;
      const open = text[i + 1], close = open === "(" ? ")" : ">";
      const type = open === "(" ? "link" : "latex";
      let end = i + 2, depth = 1;
      while (end < text.length && depth) {
        if (text[end] === open && text[end - 1] !== "\\") depth++;
        else if (text[end] === close && text[end - 1] !== "\\") depth--;
        end++;
      }
      if (depth) continue;
      const raw = text.slice(start + 1, i).trim();
      let url = text.slice(i + 2, end - 1).trim();
      let key, tag, data;
      if (type === "latex") {
        if (!latex) continue;
        const [txt = "", width = null, height = null, font_height = null, padding = null] = raw.split("|");
        key = `NIXEL_LATEX_${latex_index++}`;
        tag = `{{${key}}}${txt || "image"}{{/${key}}}`;
        data = { type: "latex", ie: { key, text: txt, url, width, height, font_height, padding } };
      } else if (raw) {
        if (!hyperlink) continue;
        const trusted = !url.startsWith("!");
        if (!trusted) url = url.slice(1);
        key = `NIXEL_HYPERLINK_${hyperlink_index++}`;
        tag = `{{${key}}}${url}{{/${key}}}`;
        data = { type: "hyperlink", ie: { key, text: raw, url, is_trusted: trusted } };
      } else {
        if (!citation) continue;
        key = `NIXEL_CITATION_${citation_index - 1}`;
        tag = `{{${key}}}${url}{{/${key}}}`;
        data = { type: "citation", ie: { reference_id: citation_index++, key, text: "", url } };
      }
      result += text.slice(last, start) + tag;
      last = end;
      ie.push(data);
      const entity = createIE(data.type, data.ie);
      if (entity) inline_entities.push(entity);
      i = end - 1;
    }
  }
  result += text.slice(last);
  return { text: result, ie, inline_entities };
}

const RICH_TYPE_MAP = { 0: "DEFAULT", 1: "KEYWORD", 2: "METHOD", 3: "STR", 4: "NUMBER", 5: "COMMENT" };

function aiRichTokenizer(code, lang = "javascript") {
  const keywordsMap = {
    javascript: new Set(["break","case","catch","continue","debugger","delete","do","else","finally","for","function","if","in","instanceof","new","return","switch","this","throw","try","typeof","var","void","while","with","true","false","null","undefined","class","const","let","super","extends","export","import","yield","static","constructor","async","await","get","set"]),
    typescript: new Set(["abstract","any","as","asserts","bigint","boolean","declare","enum","implements","infer","interface","is","keyof","module","namespace","never","readonly","require","number","object","override","private","protected","public","satisfies","string","symbol","type","unknown","using","from","break","case","catch","continue","do","else","finally","for","function","if","new","return","switch","this","throw","try","var","void","while","class","const","let","extends","import","export","async","await"]),
    python: new Set(["False","None","True","and","as","assert","async","await","break","class","continue","def","del","elif","else","except","finally","for","from","global","if","import","in","is","lambda","nonlocal","not","or","pass","raise","return","try","while","with","yield"]),
    java: new Set(["abstract","assert","boolean","break","byte","case","catch","char","class","const","continue","default","do","double","else","enum","extends","final","finally","float","for","goto","if","implements","import","instanceof","int","interface","long","native","new","package","private","protected","public","return","short","static","strictfp","super","switch","synchronized","this","throw","throws","transient","try","void","volatile","while"]),
    golang: new Set(["break","case","chan","const","continue","default","defer","else","fallthrough","for","func","go","goto","if","import","interface","map","package","range","return","select","struct","switch","type","var"]),
    c: new Set(["auto","break","case","char","const","continue","default","do","double","else","enum","extern","float","for","goto","if","int","long","register","return","short","signed","sizeof","static","struct","switch","typedef","union","unsigned","void","volatile","while"]),
    cpp: new Set(["alignas","alignof","and","auto","bool","break","case","catch","class","const","constexpr","continue","delete","do","double","else","enum","explicit","export","extern","false","float","for","friend","if","inline","int","long","mutable","namespace","new","noexcept","nullptr","operator","private","protected","public","return","short","signed","sizeof","static","struct","switch","template","this","throw","true","try","typedef","typename","union","unsigned","using","virtual","void","while"]),
    php: new Set(["abstract","and","array","as","break","callable","case","catch","class","clone","const","continue","declare","default","do","echo","else","elseif","empty","enddeclare","endfor","endforeach","endif","endswitch","endwhile","extends","final","finally","fn","for","foreach","function","global","goto","if","implements","include","include_once","instanceof","interface","match","namespace","new","null","or","private","protected","public","require","require_once","return","static","switch","throw","trait","try","use","var","while","yield"]),
    rust: new Set(["as","break","const","continue","crate","else","enum","extern","false","fn","for","if","impl","in","let","loop","match","mod","move","mut","pub","ref","return","self","Self","static","struct","super","trait","true","type","unsafe","use","where","while"]),
    html: new Set(["html","head","body","div","span","p","a","img","video","audio","script","style","link","meta","form","input","button","table","tr","td","th","ul","ol","li","section","article","header","footer","nav","main"]),
    bash: new Set(["if","then","else","elif","fi","for","while","do","done","case","esac","function","in","select","until","break","continue","return","export","readonly","local","declare"]),
    markdown: new Set(["#","##","###","####","#####","######"])
  };

  if (!lang || lang === "txt" || lang === "text" || lang === "plaintext") {
    return {
      codeBlock: [{ codeContent: code, highlightType: 0 }],
      unified_codeBlock: [{ content: code, type: "DEFAULT" }]
    };
  }

  const keywords = keywordsMap[lang.toLowerCase()] || new Set();
  const tokens = [];
  let i = 0;

  const push = (content, type) => {
    if (!content) return;
    const last = tokens[tokens.length - 1];
    if (last && last.highlightType === type) last.codeContent += content;
    else tokens.push({ codeContent: content, highlightType: type });
  };

  const isIdentifier = (char) => {
    if (lang === "css") return /[a-zA-Z0-9_$-]/.test(char);
    if (lang === "html") return /[a-zA-Z0-9_$:-]/.test(char);
    return /[a-zA-Z0-9_$]/.test(char);
  };

  while (i < code.length) {
    const c = code[i];
    if (/\s/.test(c)) {
      const s = i;
      while (i < code.length && /\s/.test(code[i])) i++;
      push(code.slice(s, i), 0);
      continue;
    }
    if ((c === "/" && code[i + 1] === "/") || (c === "#" && ["python", "bash"].includes(lang))) {
      const s = i;
      while (i < code.length && code[i] !== "\n") i++;
      push(code.slice(s, i), 5);
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const s = i; const q = c; i++;
      while (i < code.length) {
        if (code[i] === "\\" && i + 1 < code.length) i += 2;
        else if (code[i] === q) { i++; break; }
        else i++;
      }
      push(code.slice(s, i), 3);
      continue;
    }
    if (/[0-9]/.test(c)) {
      const s = i;
      while (i < code.length && /[0-9._]/.test(code[i])) i++;
      push(code.slice(s, i), 4);
      continue;
    }
    if (/[a-zA-Z_$]/.test(c)) {
      const s = i;
      while (i < code.length && isIdentifier(code[i])) i++;
      const word = code.slice(s, i);
      let type = 0;
      if (keywords.has(word)) {
        type = 1;
      } else if (lang === "css") {
        let j = i;
        while (j < code.length && /\s/.test(code[j])) j++;
        if (code[j] === ":") type = 1;
      } else if (lang === "html") {
        let p = s - 1;
        while (p >= 0 && /\s/.test(code[p])) p--;
        if (code[p] === "<" || (code[p] === "/" && code[p - 1] === "<")) type = 1;
      }
      if (type === 0) {
        let j = i;
        while (j < code.length && /\s/.test(code[j])) j++;
        if (code[j] === "(") type = 2;
      }
      push(word, type);
      continue;
    }
    push(c, 0);
    i++;
  }
  return {
    codeBlock: tokens,
    unified_codeBlock: tokens.map(t => ({ content: t.codeContent, type: RICH_TYPE_MAP[t.highlightType] ?? "DEFAULT" }))
  };
}

function aiRichTable(arr, { hyperlink = true, citation = true, latex = true } = {}) {
  if (!Array.isArray(arr) || !arr.every(row => Array.isArray(row) && row.every(cell => typeof cell === "string"))) {
    throw new TypeError("Table must be a nested array of strings");
  }
  const [header, ...rows] = arr;
  const maxLen = Math.max(header.length, ...rows.map(r => r.length));
  const normalize = (r) => [...r, ...Array(maxLen - r.length).fill("")];

  const unified_rows = [
    { is_header: true, cells: normalize(header) },
    ...rows.map(r => ({ is_header: false, cells: normalize(r) }))
  ].map(row => {
    const markdown_cells = row.cells.map(cell => {
      const ex = extractIE(cell, { hyperlink, citation, latex });
      return { text: ex.text, ...(ex.inline_entities.length ? { inline_entities: ex.inline_entities } : {}) };
    });
    return { ...row, ...(markdown_cells.some(c => c.inline_entities?.length) ? { markdown_cells } : {}) };
  });

  const rowsMeta = unified_rows.map(r => ({
    items: r.cells,
    ...(r.is_header ? { isHeading: true } : {})
  }));

  return { title: "", rows: rowsMeta, unified_rows };
}

function newRichLayout(name, data, extra = {}) {
  return {
    ...extra,
    view_model: {
      [Array.isArray(data) ? "primitives" : "primitive"]: data,
      __typename: `GenAI${name}LayoutViewModel`
    }
  };
}

async function waitAllPromises(input) {
  const isPromise = v => v && typeof v.then === "function";
  const isObject = v => v && typeof v === "object";
  const deep = async (v) => {
    if (isPromise(v)) return deep(await v);
    if (Array.isArray(v)) return Promise.all(v.map(deep));
    if (isObject(v)) {
      const entries = await Promise.all(Object.entries(v).map(async ([k, val]) => [k, await deep(val)]));
      return Object.fromEntries(entries);
    }
    return v;
  };
  return deep(await input);
}

const INTERACTIVE_NODES = [
  {
    tag: "biz",
    attrs: {},
    content: [
      {
        tag: "interactive",
        attrs: { type: "native_flow", v: "1" },
        content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }]
      }
    ]
  }
];
const AI_NODES = [{ tag: "bot", attrs: { biz_bot: "1" } }];

function toNativeFlow(button) {
  if (button?.name && button?.buttonParamsJson) return button;
  switch (button.type) {
    case "url":
      return {
        name: "cta_url",
        buttonParamsJson: JSON.stringify({
          display_text: button.text,
          url: button.url,
          merchant_url: button.url
        })
      };
    case "copy":
      return {
        name: "cta_copy",
        buttonParamsJson: JSON.stringify({
          display_text: button.text,
          id: button.id || button.copy,
          copy_code: button.copy
        })
      };
    case "call":
      return {
        name: "cta_call",
        buttonParamsJson: JSON.stringify({
          display_text: button.text,
          phone_number: button.phone
        })
      };
    case "list":
      return {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: button.text || "Menu",
          sections: (button.sections || []).map((section) => ({
            title: section.title,
            rows: (section.rows || []).map((row) => ({
              header: row.header || "",
              title: row.title,
              description: row.description || "",
              id: row.id || row.title
            }))
          }))
        })
      };
    case "flow":
      return {
        name: button.name,
        buttonParamsJson: JSON.stringify(button.params || {})
      };
    case "reply":
    default:
      return {
        name: "quick_reply",
        buttonParamsJson: JSON.stringify({
          display_text: button.text,
          id: button.id || button.text
        })
      };
  }
}

const normalizeButtons = (list = []) => list.map(toNativeFlow);

function detectMime(src) {
  if (!src) return null;
  if (src.thumbnail) return "thumbnail";
  if (src.image) return "image";
  if (src.video) return "video";
  if (src.document) return "document";
  return null;
}

async function resolveMedia(sock, content, mime) {
  if (!mime) return {};
  const asSource = (v) => (typeof v === "string" ? { url: v } : v);

  if (mime === "thumbnail") {
    const media = await prepareWAMessageMedia(
      { image: asSource(content.thumbnail) },
      { upload: sock.waUploadToServer }
    );
    return { hasMediaAttachment: true, imageMessage: media.imageMessage };
  }

  const payload = { [mime]: asSource(content[mime]) };
  if (mime === "document") {
    if (content.jpegThumbnail) payload.jpegThumbnail = content.jpegThumbnail;
    if (content.mimetype) payload.mimetype = content.mimetype;
    if (content.fileName) payload.fileName = content.fileName;
  }

  const media = await prepareWAMessageMedia(payload, { upload: sock.waUploadToServer });
  const key = `${mime}Message`;
  if (mime === "document" && content.fileName) media[key].fileName = content.fileName;
  if (mime === "document" && content.mimetype) media[key].mimetype = content.mimetype;
  return { hasMediaAttachment: true, [key]: media[key] };
}

async function resolveExternalAd(content, ctxRaw) {
  const extAd = content.externalAdReply || ctxRaw.externalAdReply || null;
  if (extAd?.thumbnailUrl && !extAd.jpegThumbnail) {
    try {
      const r = await fetch(extAd.thumbnailUrl);
      extAd.jpegThumbnail = Buffer.from(await r.arrayBuffer());
    } catch {
    }
  }
  return extAd;
}

async function fetchThumb(src) {
  if (!src) return undefined;
  if (Buffer.isBuffer(src)) return src;
  if (typeof src === "string") {
    try {
      const r = await fetch(src);
      return Buffer.from(await r.arrayBuffer());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

async function buildLocation(sock, jid, content, options, contextInfo) {
  const thumb = await fetchThumb(content.thumbnail || content.image);
  const loc = content.location || {};
  const buttons = (content.buttons || []).map((b) =>
    b.buttonId
      ? b
      : {
          buttonId: b.id || b.text || randomUUID(),
          buttonText: { displayText: b.text || b.displayText || "" },
          type: 1
        }
  );

  return generateWAMessageFromContent(
    jid,
    {
      buttonsMessage: {
        contentText: content.body || content.text || content.caption || "",
        footerText: content.footer || "",
        headerType: 6,
        locationMessage: {
          degreesLatitude: loc.latitude ?? loc.degreesLatitude ?? 0,
          degreesLongitude: loc.longitude ?? loc.degreesLongitude ?? 0,
          name: content.title || loc.name || "",
          address: content.subtitle || loc.address || "",
          jpegThumbnail: thumb
        },
        viewOnce: true,
        contextInfo,
        buttons
      }
    },
    { userJid: sock.user?.id, ...options }
  );
}

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function bindButton(sock) {
  sock.sendButton = async (jid, content = {}, options = {}) => {
    if (content.viewOnceMessage?.message?.interactiveMessage) {
      content = content.viewOnceMessage.message.interactiveMessage;
    } else if (content.interactiveMessage) {
      content = content.interactiveMessage;
    }

    const ctxRaw = content.contextInfo || {};
    const extAd = await resolveExternalAd(content, ctxRaw);
    const contextInfo = {
      mentionedJid: content.mentions || ctxRaw.mentionedJid || [],
      ...ctxRaw,
      ...(extAd ? { externalAdReply: extAd } : {})
    };

    const additionalNodes = content.ai === true ? [...INTERACTIVE_NODES, ...AI_NODES] : INTERACTIVE_NODES;

    if (content.location) {
      const msg = await buildLocation(sock, jid, content, options, contextInfo);
      await sock.relayMessage(jid, msg.message, { messageId: msg.key.id, additionalNodes });
      return msg;
    }

    if (Array.isArray(content.cards) && content.cards.length > 0) {
      const cards = [];
      for (const card of content.cards) {
        const mime = detectMime(card);
        const header = await resolveMedia(sock, card, mime);
        cards.push({
          header: { title: card.title || "", ...header },
          body: { text: card.caption || card.body || card.text || "" },
          footer: { text: card.footer || "" },
          nativeFlowMessage: { buttons: normalizeButtons(card.buttons), messageVersion: 1 }
        });
      }

      const carouselHeaderTitle = isObj(content.header)
        ? (content.header.title || "")
        : (content.header || content.title || "");
      const carouselBody = isObj(content.body)
        ? (content.body.text || "")
        : (content.body || content.text || content.caption || "");
      const carouselFooter = isObj(content.footer)
        ? (content.footer.text || "")
        : (content.footer || "");

      const carousel = {
        header: { title: carouselHeaderTitle },
        body: { text: carouselBody },
        footer: { text: carouselFooter },
        contextInfo,
        carouselMessage: { cards, messageVersion: 1, carouselCardType: 1 }
      };

      const msg = generateWAMessageFromContent(
        jid,
        { interactiveMessage: carousel },
        { userJid: sock.user?.id, ...options }
      );
      await sock.relayMessage(jid, msg.message, { messageId: msg.key.id, additionalNodes });
      return msg;
    }

    const isStructured = isObj(content.header) || isObj(content.body) || isObj(content.footer);

    let interactive;

    if (isStructured) {
      const rawNativeFlow = content.nativeFlowMessage || null;
      const rawButtons = rawNativeFlow?.buttons || content.buttons || [];
      const buttons = normalizeButtons(rawButtons);

      let nativeFlow = { buttons };
      if (rawNativeFlow) {
        const { buttons: _b, ...rest } = rawNativeFlow;
        nativeFlow = { ...nativeFlow, ...rest };
      }

      interactive = {
        header: isObj(content.header) ? content.header : { title: content.header || "" },
        body: isObj(content.body) ? content.body : { text: content.body || "" },
        footer: isObj(content.footer) ? content.footer : { text: content.footer || "" },
        nativeFlowMessage: nativeFlow,
        contextInfo
      };
    } else {
      const mime = detectMime(content);
      const header = await resolveMedia(sock, content, mime);

      const rawNativeFlow = content.nativeFlowMessage || null;
      const buttons = normalizeButtons(
        rawNativeFlow?.buttons || content.buttons || content.interactiveButtons || []
      );
      let nativeFlow = { buttons };
      if (rawNativeFlow) {
        const { buttons: _b, ...rest } = rawNativeFlow;
        nativeFlow = { ...nativeFlow, ...rest };
      }

      interactive = {
        header: {
          title: content.header || content.title || "",
          subtitle: content.subtitle || "",
          ...header
        },
        body: { text: content.body || content.text || content.caption || "" },
        footer: { text: content.footer || "" },
        nativeFlowMessage: nativeFlow,
        contextInfo
      };
    }

    const msg = generateWAMessageFromContent(
      jid,
      { interactiveMessage: interactive },
      { userJid: sock.user?.id, ...options }
    );
    await sock.relayMessage(jid, msg.message, { messageId: msg.key.id, additionalNodes });
    return msg;
  };

  return sock;
}

function bindWrapper(sock) {
  bindButton(sock);
  patchMessageId(sock);

  sock.sendWithThumbnail = async (jid, data = {}, quoted = null, options = {}) => {
    let {
      text = "",
      title = "",
      body = "",
      thumbnailUrl = null,
      faviconUrl = null,
      sourceUrl = "",
      renderLargerThumbnail = true,
      previewType = renderLargerThumbnail ? 1 : 0,
      showSourceUrl = true,
      ...restData
    } = data;

    if (!sourceUrl) sourceUrl = global.myUrl || "https://github.com";

    let finalText = showSourceUrl ? sourceUrl + "\n" + (text || "") : text || "";
    const matchedText = sourceUrl;

    const mentionedJid = new Set();
    if (Array.isArray(restData?.mentions)) {
      for (const j of restData.mentions) if (j && typeof j === "string") mentionedJid.add(j.trim());
    }

    const fullJidRegex = /(\d{8,15})@(s\.whatsapp\.net|lid)/g;
    let match;
    while ((match = fullJidRegex.exec(finalText)) !== null) {
      mentionedJid.add(`${match[1]}@${match[2]}`);
    }
    const atOnlyRegex = /@(\d{8,15})\b/g;
    while ((match = atOnlyRegex.exec(finalText)) !== null) {
      const number = match[1];
      if (!mentionedJid.has(`${number}@s.whatsapp.net`) && !mentionedJid.has(`${number}@lid`)) {
        mentionedJid.add(`${number}@lid`);
      }
    }

    finalText = finalText
      .replace(/(\d{8,15})@(s\.whatsapp\.net|lid)/g, "@$1")
      .replace(/@(\d{8,15})\b/g, "@$1");

    let thumbnailData = {};
    let jpegThumbnailBuffer;

    if (thumbnailUrl) {
      try {
        const { image, meta } = await uploadLinkThumb(sock, thumbnailUrl, { h: 736, w: 1308 });
        jpegThumbnailBuffer = image.jpegThumbnail || FALLBACK_JPEG;
        if (renderLargerThumbnail) {
          thumbnailData = { ...meta, inviteLinkGroupTypeV2: 0 };
        }
      } catch {
        jpegThumbnailBuffer = FALLBACK_JPEG;
      }
    }

    if (!jpegThumbnailBuffer) jpegThumbnailBuffer = FALLBACK_JPEG;

    let faviconMMSMetadata = null;
    if (faviconUrl) {
      try {
        const { meta } = await uploadLinkThumb(sock, faviconUrl, { h: 48, w: 48 });
        faviconMMSMetadata = meta;
      } catch {
      }
    }

    let contextInfo = {
      mentionedJid: [...mentionedJid],
      groupMentions: [],
      statusAttributions: []
    };

    if (quoted?.key) {
      contextInfo.stanzaId = quoted.key.id;
      contextInfo.participant = quoted.key.participant || quoted.key.remoteJid;
      contextInfo.remoteJid = quoted.key.remoteJid;
      contextInfo.fromMe = quoted.key.fromMe || false;
      contextInfo.quotedMessage = quoted.message || { conversation: "" };
      contextInfo.quotedType = 0;
    }

    if (restData.contextInfo) contextInfo = { ...contextInfo, ...restData.contextInfo };

    const { mentions: _m, contextInfo: _c, ...passthrough } = restData;

    const content = {
      extendedTextMessage: {
        text: finalText,
        matchedText,
        canonicalUrl: sourceUrl,
        title: title || "",
        description: body || "",
        previewType,
        renderLargerThumbnail,
        inviteLinkGroupTypeV2: 0,
        jpegThumbnail: jpegThumbnailBuffer,
        ...thumbnailData,
        ...(faviconMMSMetadata && { faviconMMSMetadata }),
        contextInfo,
        ...passthrough
      },
      messageContextInfo: { messageSecret: randomBytes(32) }
    };

    return sock.relayMessage(jid, content, { quoted, ...options });
  };

  sock.sendAiRich = async (jid, data = {}, options = {}) => {
    const {
      disclaimer = "",
      sources = [],
      submessages = [],
      footer = "",
      unifiedData = null,
      forwarded = true
    } = data;

    const metadataSources = sources.map((s, i) => ({
      provider: s.provider || s.title || "Bot",
      thumbnailCDNURL: s.thumbnailUrl || "",
      sourceProviderURL: s.providerUrl || s.url || "",
      sourceQuery: s.query || "",
      faviconCDNURL: s.faviconUrl || "",
      citationNumber: s.citationNumber ?? i + 1,
      sourceTitle: s.title || "Source"
    }));

    const extraRichSources = [];
    const builtSubmessages = [];
    const sections = [];

    for (const s of submessages) {

      switch (s.type) {

        case "text": {
          const { text: t, inline_entities } = extractIE(s.text || "");
          builtSubmessages.push({ messageType: 2, messageText: t });
          sections.push(newRichLayout("Single", {
            text: t,
            ...(inline_entities.length ? { inline_entities } : {}),
            __typename: "GenAIMarkdownTextUXPrimitive"
          }));
          break;
        }

        case "code": {
          const lang = s.language || "javascript";
          let meta;
          if (s.code) {
            meta = aiRichTokenizer(s.code, lang);
          } else {
            const blocks = (s.blocks || []).map(b => ({
              codeContent: b.codeContent ?? b.content ?? "",
              highlightType: b.highlightType ?? 0
            }));
            meta = {
              codeBlock: blocks,
              unified_codeBlock: blocks.map(b => ({ content: b.codeContent, type: RICH_TYPE_MAP[b.highlightType] ?? "DEFAULT" }))
            };
          }
          builtSubmessages.push({ messageType: 5, codeMetadata: { codeLanguage: lang, codeBlocks: meta.codeBlock } });
          sections.push(newRichLayout("Single", { language: lang, code_blocks: meta.unified_codeBlock, __typename: "GenAICodeUXPrimitive" }));
          break;
        }

        case "table": {
          let rows, unified_rows;
          if (Array.isArray(s.rows) && s.rows.every(r => Array.isArray(r) && r.every(c => typeof c === "string"))) {
            const meta = aiRichTable(s.rows);
            rows = meta.rows;
            unified_rows = meta.unified_rows;
          } else {
            rows = (s.rows || []).map(r => {
              if (Array.isArray(r)) return { items: r, isHeading: false };
              return { items: r.items ?? r.cells ?? [], isHeading: r.isHeading ?? r.header ?? false };
            });
            unified_rows = rows.map(r => ({ is_header: r.isHeading || false, cells: r.items }));
          }
          builtSubmessages.push({ messageType: 4, tableMetadata: { title: s.title || "", rows } });
          sections.push(newRichLayout("Single", { rows: unified_rows, __typename: "GenATableUXPrimitive" }));
          break;
        }

        case "image":
        case "grid": {
          let list;
          if (s.images) {
            list = s.images.map(img => ({
              imagePreviewUrl: img.previewUrl || img.url || "",
              imageHighResUrl: img.highResUrl || img.previewUrl || img.url || "",
              sourceUrl: img.sourceUrl || img.url || ""
            }));
          } else {
            const urls = Array.isArray(s.url) ? s.url : [s.url].filter(Boolean);
            list = urls.map(u => ({ imagePreviewUrl: u, imageHighResUrl: u, sourceUrl: u }));
          }
          builtSubmessages.push({
            messageType: 1,
            gridImageMetadata: {
              gridImageUrl: { imagePreviewUrl: s.previewUrl || list[0]?.imagePreviewUrl || "" },
              imageUrls: list
            }
          });
          list.forEach(img => sections.push(newRichLayout("Single", {
            media: { url: img.imagePreviewUrl, mime_type: "image/jpeg" },
            imagine_type: 3,
            status: { status: "READY" },
            __typename: "GenAIImaginePrimitive"
          })));
          break;
        }

        case "video": {
          const isObj = s.url && typeof s.url === "object" && !Array.isArray(s.url);
          const videoUrl = isObj ? (s.url.url || "") : (s.url || "");
          const fileLength = isObj ? (s.url.file_length ?? 0) : (s.fileLength ?? 0);
          const duration = isObj ? (s.url.duration ?? 0) : (s.duration ?? 0);
          const thumbnail = isObj ? (s.url.thumbnail || null) : (s.thumbnail || null);
          builtSubmessages.push({ messageType: 2, messageText: "[ CANNOT_LOAD_VIDEO ]" });
          sections.push(newRichLayout("Single", {
            media: { url: videoUrl, mime_type: isObj ? (s.url.mime_type ?? "video/mp4") : "video/mp4", file_length: fileLength, duration },
            imagine_type: "ANIMATE",
            status: { status: "READY" },
            ...(thumbnail ? { thumbnail: { raw_media: thumbnail } } : {}),
            __typename: "GenAIImaginePrimitive"
          }));
          break;
        }

        case "reels": {
          const items = (s.items || []).map(item => ({
            title: item.title || item.username || "",
            profileIconUrl: item.profileIconUrl || item.avatarUrl || item.profile || "",
            thumbnailUrl: item.thumbnailUrl || item.thumbnail || "",
            videoUrl: item.videoUrl || item.url || "",
            reelsTitle: item.reels_title || item.reelsTitle || item.title || "",
            likesCount: item.likes_count ?? item.like ?? 0,
            sharesCount: item.shares_count ?? item.share ?? 0,
            viewCount: item.view_count ?? item.view ?? 0,
            reelSource: item.reel_source || item.source || "IG",
            isVerified: !!(item.is_verified || item.verified)
          }));
          builtSubmessages.push({
            messageType: 9,
            contentItemsMetadata: {
              contentType: 1,
              itemsMetadata: items.map(item => ({
                reelItem: {
                  title: item.title,
                  profileIconUrl: item.profileIconUrl,
                  thumbnailUrl: item.thumbnailUrl,
                  videoUrl: item.videoUrl
                }
              }))
            }
          });
          items.forEach((item, idx) => extraRichSources.push({
            provider: "Bot",
            thumbnailCDNURL: item.thumbnailUrl,
            sourceProviderURL: item.videoUrl,
            sourceQuery: "",
            faviconCDNURL: item.profileIconUrl,
            citationNumber: idx + 1,
            sourceTitle: item.title
          }));
          sections.push(newRichLayout("HScroll", items.map(item => ({
            reels_url: item.videoUrl,
            thumbnail_url: item.thumbnailUrl,
            creator: item.title,
            avatar_url: item.profileIconUrl,
            reels_title: item.reelsTitle,
            likes_count: item.likesCount,
            shares_count: item.sharesCount,
            view_count: item.viewCount,
            reel_source: item.reelSource,
            is_verified: item.isVerified,
            __typename: "GenAIReelPrimitive"
          }))));
          break;
        }

        case "tip": {
          builtSubmessages.push({ messageType: 2, messageText: s.text || "" });
          sections.push(newRichLayout("Single", { text: s.text || "", __typename: "GenAIMetadataTextPrimitive" }));
          break;
        }

        case "suggest": {
          const texts = Array.isArray(s.text) ? s.text : [s.text || s.suggest].filter(Boolean);
          const primitives = texts.map(t => ({
            prompt_text: t,
            prompt_type: "SUGGESTED_PROMPT",
            __typename: "GenAIFollowUpSuggestionPillPrimitive"
          }));
          const layout = s.layout ?? (primitives.length === 1 ? "Single" : s.scroll !== false ? "HScroll" : "ActionRow");
          sections.push(newRichLayout(layout, layout === "Single" ? primitives[0] : primitives, { __typename: "GenAIUnifiedResponseSection" }));
          break;
        }

        case "source": {
          let srcList = s.sources || [];
          if (srcList.every(v => typeof v === "string")) srcList = [srcList];
          const isValidSources = Array.isArray(sources) && (
              sources.every((item) => typeof item === 'string') ||
              sources.every((item) => Array.isArray(item) && item.every((v) => typeof v === 'string'))
          );
          if (isValidSources) {
            sections.push(newRichLayout("Single", {
              sources: srcList.map(([icon, url, text]) => ({
                source_type: "THIRD_PARTY",
                source_display_name: text ?? "",
                source_subtitle: "AI",
                source_url: url ?? "",
                favicon: { url: icon ?? "", mime_type: "image/jpeg", width: 16, height: 16 }
              })),
              __typename: "GenAISearchResultPrimitive"
            }));
          }
          break;
        }

        case "product": {
          const isArray = Array.isArray(s.data);
          const items = isArray ? s.data : [s.data ?? s].filter(v => v?.title);
          const primitives = items.map(item => ({
            title: item.title,
            brand: item.brand,
            price: item.price,
            sale_price: item.sale_price || item.salePrice,
            product_url: item.product_url || item.url,
            image: { url: item.image_url || item.imageUrl || item.image || "" },
            additional_images: [{ url: item.icon_url || item.iconUrl || item.icon || "" }],
            __typename: "GenAIProductItemCardPrimitive"
          }));
          builtSubmessages.push({ messageType: 2, messageText: "[ CANNOT_LOAD_PRODUCT ]" });
          sections.push(newRichLayout(isArray ? "HScroll" : "Single", isArray ? primitives : primitives[0]));
          break;
        }

        case "post": {
          const isArray = Array.isArray(s.data);
          const items = isArray ? s.data : [s.data ?? s];
          const primitives = items.map(p => ({
            title: p.title ?? "",
            subtitle: p.subtitle ?? "",
            username: p.username ?? "",
            profile_picture_url: p.profile_picture_url || p.profileUrl || p.profile || "",
            is_verified: !!(p.is_verified || p.verified),
            thumbnail_url: p.thumbnail_url || p.thumbnail || "",
            post_caption: p.post_caption || p.caption || "",
            likes_count: p.likes_count ?? p.likes ?? 0,
            comments_count: p.comments_count ?? p.comments ?? 0,
            shares_count: p.shares_count ?? p.shares ?? 0,
            post_url: p.post_url || p.url || "",
            post_deeplink: p.post_deeplink || p.deeplink || "",
            source_app: p.source_app || p.source || "INSTAGRAM",
            footer_label: p.footer_label || p.footer || "",
            footer_icon: p.footer_icon || p.icon || "",
            is_carousel: items.length > 1,
            orientation: p.orientation ?? "LANDSCAPE",
            post_type: p.post_type ?? "VIDEO",
            __typename: "GenAIPostPrimitive"
          }));
          builtSubmessages.push({ messageType: 2, messageText: "[ CANNOT_LOAD_POST ]" });
          sections.push(newRichLayout("HScroll", primitives));
          break;
        }

        default:
          builtSubmessages.push(s);
          break;
      }
    }

    if (footer) sections.push(newRichLayout("Single", { text: footer, __typename: "GenAIMetadataTextPrimitive" }));

    const allRichSources = [...metadataSources, ...extraRichSources];

    const botMetadata = {};
    if (disclaimer) botMetadata.messageDisclaimerText = disclaimer;
    if (allRichSources.length) botMetadata.richResponseSourcesMetadata = { sources: allRichSources };

    const forwardInfo = forwarded
      ? { forwardingScore: 1, isForwarded: true, forwardedAiBotMessageInfo: { botJid: "0@bot" }, forwardOrigin: 4 }
      : {};

    const quotedInfo = {};
    if (options.quoted?.key) {
      quotedInfo.stanzaId = options.quoted.key.id;
      quotedInfo.participant = options.quoted.key.participant || options.quoted.key.remoteJid;
      quotedInfo.quotedType = 0;
      quotedInfo.quotedMessage = options.quoted.message || { conversation: "" };
    }

    const contextInfo = { ...forwardInfo, ...quotedInfo };

    let unifiedResponse;
    if (unifiedData) {
      unifiedResponse = { data: unifiedData };
    } else {
      const resolvedSections = await waitAllPromises(sections);
      unifiedResponse = {
        data: Buffer.from(JSON.stringify({
          response_id: randomBytes(16).toString("hex"),
          sections: resolvedSections
        })).toString("base64")
      };
    }

    return sock.relayMessage(jid, {
      messageContextInfo: {
        deviceListMetadata: {},
        deviceListMetadataVersion: 2,
        ...(Object.keys(botMetadata).length ? { botMetadata } : {})
      },
      botForwardedMessage: {
        message: {
          richResponseMessage: {
            messageType: 1,
            submessages: builtSubmessages,
            unifiedResponse,
            contextInfo
          }
        }
      }
    }, {});
  };

  sock.sendStickerPack = (jid, data, options) => sendStickerPack(sock, jid, data, options);

  return sock;
}

class Toolkit {
  constructor() {}

  static extractIE(text, { extract = true, hyperlink = true, citation = true, latex = true } = {}) {
    return extractIE(text, { extract, hyperlink, citation, latex });
  }

  static async resize(buffer, x, y, fit = 'cover') {
    return await sharp(buffer)
      .resize(x, y, {
        fit,
        position: 'center',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  }

  static async waitAllPromises(input) {
    return await waitAllPromises(input);
  }

  static async fetchBuffer(url, options = {}, { silent = true } = {}) {
    try {
      let response = await fetch(url, options);
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (silent) return Buffer.alloc(0);
      throw error;
    }
  }

  static async toUrl(_client, path, mediaType = 'document') {
    if (!path) throw new Error('Url or buffer needed');

    const media = await prepareWAMessageMedia(
      {
        [mediaType]: Buffer.isBuffer(path) ? path : { url: path },
      },
      {
        upload: _client.waUploadToServer,
        jid: '@newsletter',
      }
    );

    return Object.values(media)[0]?.url;
  }

  static async resolveMedia(_client, media, mediaType = 'image', { resolveUrl = false, resolveWAUrl = false, result = 'url', resize = false, width = 300, height = 300 } = {}) {
    const isUrl = (str) => /^https?:\/\/.+/i.test(str);

    const isWAUrl = (str) => /^https?:\/\/[^/]*\.whatsapp\.net\//i.test(str);

    if (Array.isArray(media)) {
      return Promise.all(
        media.map((item) =>
          Toolkit.resolveMedia(_client, item, mediaType, {
            resolveUrl,
            resolveWAUrl,
            result,
            resize,
            width,
            height,
          })
        )
      );
    }

    const originalIsBuffer = Buffer.isBuffer(media);

    if (typeof media === 'string' && isUrl(media)) {
      if (isWAUrl(media)) {
        if (resolveWAUrl) {
          media = await Toolkit.fetchBuffer(media, {}, { silent: true });
        } else if (!resolveUrl) {
          if (result === 'url') return media;

          media = await Toolkit.fetchBuffer(media, {}, { silent: true });
        }
      } else {
        if (!resolveUrl) {
          if (result === 'url') return media;

          media = await Toolkit.fetchBuffer(media, {}, { silent: true });
        } else {
          media = await Toolkit.fetchBuffer(media, {}, { silent: true });
        }
      }
    }

    if (typeof media === 'string' && !isUrl(media)) {
      media = Buffer.from(media, 'base64');
    }

    if (!Buffer.isBuffer(media) || !media.length) {
      return;
    }

    if (resize && Buffer.isBuffer(media)) {
      media = await Toolkit.resize(media, width, height);
    }

    if (result === 'buffer') {
      return media;
    }

    if (result === 'base64') {
      return media.toString('base64');
    }

    if (originalIsBuffer) {
      return Toolkit.toUrl(_client, media, mediaType);
    }

    return Toolkit.toUrl(_client, media, mediaType);
  }

  static getMp4Duration(buffer, { silent = true } = {}) {
    try {
      if (!Buffer.isBuffer(buffer) || buffer.length < 8) {
        if (silent) return 0;
        throw new Error('Invalid buffer');
      }

      let offset = 0;

      while (offset < buffer.length - 8) {
        const size = buffer.readUInt32BE(offset);

        if (size < 8 || offset + size > buffer.length) {
          if (silent) return 0;
          throw new Error('Invalid atom size');
        }

        const type = buffer.toString('ascii', offset + 4, offset + 8);

        if (type === 'moov') {
          let moovOffset = offset + 8;
          const moovEnd = offset + size;

          while (moovOffset < moovEnd - 8) {
            const childSize = buffer.readUInt32BE(moovOffset);

            if (childSize < 8 || moovOffset + childSize > moovEnd) {
              if (silent) return 0;
              throw new Error('Invalid child atom size');
            }

            const childType = buffer.toString('ascii', moovOffset + 4, moovOffset + 8);

            if (childType === 'mvhd') {
              const version = buffer.readUInt8(moovOffset + 8);

              if (version === 0) {
                const timescale = buffer.readUInt32BE(moovOffset + 20);
                const duration = buffer.readUInt32BE(moovOffset + 24);

                if (!timescale) {
                  if (silent) return 0;
                  throw new Error('Invalid timescale');
                }

                return duration / timescale;
              }

              if (version === 1) {
                const timescale = buffer.readUInt32BE(moovOffset + 32);
                const duration = Number(buffer.readBigUInt64BE(moovOffset + 36));

                if (!timescale) {
                  if (silent) return 0;
                  throw new Error('Invalid timescale');
                }

                return duration / timescale;
              }
            }

            moovOffset += childSize;
          }
        }

        offset += size;
      }

      if (silent) return 0;

      throw new Error('No mvhd found!');
    } catch (err) {
      if (silent) return 0;
      throw err;
    }
  }

  static getMp4Preview(videoBuffer, { time, result = 'buffer', resize = true, width = 300, height = 300, silent = true } = {}) {
    return new Promise((resolve, reject) => {
      const fail = (err) => {
        if (silent) {
          return resolve(result === 'base64' ? '' : Buffer.alloc(0));
        }
        return reject(err);
      };

      try {
        if (!Buffer.isBuffer(videoBuffer) || !videoBuffer.length) {
          return fail(new Error('videoBuffer tidak valid atau kosong'));
        }

        const inputStream = new Readable({ read() {} });
        inputStream.push(videoBuffer);
        inputStream.push(null);

        const outputStream = new PassThrough();
        const chunks = [];

        outputStream.on('data', (chunk) => chunks.push(chunk));

        outputStream.on('end', async () => {
          try {
            let output = Buffer.concat(chunks);

            if (!output.length) {
              return fail(new Error('Output kosong — cek format atau timestamp video'));
            }

            if (resize) {
              output = await Toolkit.resize(output, width, height);
            }

            return resolve(result === 'base64' ? output.toString('base64') : output);
          } catch (err) {
            return fail(err);
          }
        });

        outputStream.on('error', fail);

        time ??= Math.min(Toolkit.getMp4Duration(videoBuffer) * 0.2, 10);

        const ff = spawn(ffmpegPath, [
          '-ss', String(time),
          '-vframes', '1',
          '-vcodec', 'png',
          '-f', 'image2pipe'
        ]);

        ff.stdin.write(videoBuffer);
        ff.stdin.end();

        let stderr = '';
        ff.stderr.on('data', d => { stderr += d.toString(); });

        ff.stdout.pipe(outputStream);

        ff.on('close', (code) => {
          if (code !== 0) {
            return fail(new Error(`ffmpeg exit ${code}: ${stderr.slice(-200)}`));
          }
        });

        ff.on('error', (err) => {
          return fail(new Error(`ffmpeg error: ${err.message}`));
        });

      } catch (err) {
        return fail(err);
      }
    });
  }
}

class BaseBuilder {
  constructor() {
    this._title = '';
    this._subtitle = '';
    this._body = '';
    this._footer = '';
    this._contextInfo = {};
    this._extraPayload = {};
  }

  setTitle(title) {
    if (typeof title !== 'string') {
      throw new TypeError('Title must be a string');
    }
    this._title = title;
    return this;
  }

  setSubtitle(subtitle) {
    if (typeof subtitle !== 'string') {
      throw new TypeError('Subtitle must be a string');
    }
    this._subtitle = subtitle;
    return this;
  }

  setBody(body) {
    if (typeof body !== 'string') {
      throw new TypeError('Body must be a string');
    }
    this._body = body;
    return this;
  }

  setFooter(footer) {
    if (typeof footer !== 'string') {
      throw new TypeError('Footer must be a string');
    }
    this._footer = footer;
    return this;
  }

  setContextInfo(obj) {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      throw new TypeError('ContextInfo must be a plain object');
    }

    this._contextInfo = obj;
    return this;
  }

  addPayload(obj) {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      throw new TypeError('Payload must be a plain object');
    }

    Object.assign(this._extraPayload, obj);

    return this;
  }
}

class Button extends BaseBuilder {
  #client;

  constructor(client) {
    super();
    if (!client) {
      throw new Error('Socket is required');
    }
    this.#client = client;

    this._buttons = [];
    this._data;
    this._currentSelectionIndex = -1;
    this._currentSectionIndex = -1;
    this._params = {};
  }

  setVideo(path, options = {}) {
    if (!path) throw new Error('Url or buffer needed');
    Buffer.isBuffer(path) ? (this._data = { video: path, ...options }) : (this._data = { video: { url: path }, ...options });
    return this;
  }

  setImage(path, options = {}) {
    if (!path) throw new Error('Url or buffer needed');
    Buffer.isBuffer(path) ? (this._data = { image: path, ...options }) : (this._data = { image: { url: path }, ...options });
    return this;
  }

  setDocument(path, options = {}) {
    if (!path) throw new Error('Url or buffer needed');
    Buffer.isBuffer(path) ? (this._data = { document: path, ...options }) : (this._data = { document: { url: path }, ...options });
    return this;
  }

  setMedia(obj) {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      throw new TypeError('Media must be a plain object');
    }

    this._data = obj;
    return this;
  }

  clearButtons() {
    this._buttons = [];
    return this;
  }

  setParams(obj) {
    this._params = obj;
    return this;
  }

  addButton(name, params) {
    this._buttons.push({
      name,
      buttonParamsJson: typeof params === 'string' ? params : JSON.stringify(params),
    });

    return this;
  }

  makeRow(header = '', title = '', description = '', id = '') {
    if (this._currentSelectionIndex === -1 || this._currentSectionIndex === -1) {
      throw new Error('You need to create a selection and a section first');
    }
    const buttonParams = JSON.parse(this._buttons[this._currentSelectionIndex].buttonParamsJson);
    buttonParams.sections[this._currentSectionIndex].rows.push({ header, title, description, id });
    this._buttons[this._currentSelectionIndex].buttonParamsJson = JSON.stringify(buttonParams);
    return this;
  }

  makeSection(title = '', highlight_label = '') {
    if (this._currentSelectionIndex === -1) {
      throw new Error('You need to create a selection first');
    }
    const buttonParams = JSON.parse(this._buttons[this._currentSelectionIndex].buttonParamsJson);
    buttonParams.sections.push({ title, highlight_label, rows: [] });
    this._currentSectionIndex = buttonParams.sections.length - 1;
    this._buttons[this._currentSelectionIndex].buttonParamsJson = JSON.stringify(buttonParams);
    return this;
  }

  addSelection(title, options = {}) {
    this._buttons.push({ ...options, name: 'single_select', buttonParamsJson: JSON.stringify({ title, sections: [] }) });
    this._currentSelectionIndex = this._buttons.length - 1;
    this._currentSectionIndex = -1;
    return this;
  }

  addReply(display_text = '', id = '', options = {}) {
    this._buttons.push({
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({
        display_text,
        id,
        ...options,
      }),
    });
    return this;
  }

  addCall(display_text = '', id = '', options = {}) {
    this._buttons.push({
      name: 'cta_call',
      buttonParamsJson: JSON.stringify({
        display_text,
        id,
        ...options,
      }),
    });
    return this;
  }

  addReminder(display_text = '', id = '', options = {}) {
    this._buttons.push({
      name: 'cta_reminder',
      buttonParamsJson: JSON.stringify({
        display_text,
        id,
        ...options,
      }),
    });
    return this;
  }

  addCancelReminder(display_text = '', id = '', options = {}) {
    this._buttons.push({
      name: 'cta_cancel_reminder',
      buttonParamsJson: JSON.stringify({
        display_text,
        id,
        ...options,
      }),
    });
    return this;
  }

  addAddress(display_text = '', id = '', options = {}) {
    this._buttons.push({
      name: 'address_message',
      buttonParamsJson: JSON.stringify({
        display_text,
        id,
        ...options,
      }),
    });
    return this;
  }

  addLocation(options = {}) {
    this._buttons.push({
      name: 'send_location',
      buttonParamsJson: JSON.stringify(options),
    });
    return this;
  }

  addUrl(display_text = '', url = '', webview_interaction = false, options = {}) {
    this._buttons.push({
      ...options,
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({
        display_text,
        url,
        webview_interaction,
        ...options,
      }),
    });
    return this;
  }

  addCopy(display_text = '', copy_code = '', options = {}) {
    this._buttons.push({
      name: 'cta_copy',
      buttonParamsJson: JSON.stringify({
        display_text,
        copy_code,
        ...options,
      }),
    });
    return this;
  }

  static paramsList = {
    limited_time_offer: {
      text: 'string',
      url: 'string',
      copy_code: 'string',
      expiration_time: 'number',
    },
    bottom_sheet: {
      in_thread_buttons_limit: 'number',
      divider_indices: ['number'],
      list_title: 'string',
      button_title: 'string',
    },
    tap_target_configuration: {
      title: 'string',
      description: 'string',
      canonical_url: 'string',
      domain: 'string',
      buttonIndex: 'number',
    },
  };

  async toCard() {
    return {
      body: {
        text: this._body,
      },
      footer: {
        text: this._footer,
      },
      header: {
        title: this._title,
        subtitle: this._subtitle,
        hasMediaAttachment: !!this._data,
        ...(this._data
          ? await prepareWAMessageMedia(this._data, { upload: this.#client.waUploadToServer }).catch((e) => {
              if (String(e).includes('Invalid media type')) return this._data;
              throw e;
            })
          : {}),
      },
      nativeFlowMessage: {
        messageParamsJson: JSON.stringify(this._params),
        buttons: this._buttons,
      },
    };
  }

  async build(jid, { ...options } = {}) {
    if (!jid) throw new Error('Button.build: jid is required');
    const message = await this.toCard();
    const userJid = this.#client.user?.id || this.#client.authState?.creds?.me?.id || jid;

    const msg = await generateWAMessageFromContent(
      jid,
      {
        ...this._extraPayload,
        interactiveMessage: {
          ...message,
          contextInfo: this._contextInfo,
        },
      },
      { userJid, ...options }
    );

    msg.key.id = options.messageId || generateMessageID();
    return msg;
  }

  async send(jid, { ...options } = {}) {
    if (!jid) throw new Error('Button.send: jid is required');
    const msg = await this.build(jid, options);

    await this.#client.relayMessage(jid, msg.message, {
      messageId: msg.key.id,
      additionalNodes: [
        {
          tag: 'biz',
          attrs: {},
          content: [
            {
              tag: 'interactive',
              attrs: { type: 'native_flow', v: '1' },
              content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
            },
          ],
        },
      ],
      ...options,
    });
    return msg;
  }
}

class ButtonV2 extends BaseBuilder {
  #client;

  constructor(client) {
    super();
    if (!client) {
      throw new Error('Socket is required');
    }

    this.#client = client;
    this._image;
    this._data;
    this._buttons = [];
  }

  addButton(displayText = '', buttonId = randomUUID()) {
    this._buttons.push({
      buttonId,
      buttonText: { displayText },
      type: 1,
    });
    return this;
  }

  addRawButton(obj) {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      throw new TypeError('Buttons must be a plain object');
    }

    this._buttons.push(obj);
    return this;
  }

  setThumbnail(path) {
    if (!path) throw new Error('Url or buffer needed');
    this._image = path;
    return this;
  }

  setMedia(obj) {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      throw new TypeError('Media must be a plain object');
    }

    this._data = obj;
    return this;
  }

  async build(jid, { ...options } = {}) {
    if (!jid) throw new Error('ButtonV2.build: jid is required');
    let _thumbnail = this._image ? await Toolkit.resize(Buffer.isBuffer(this._image) ? this._image : await Toolkit.fetchBuffer(this._image, {}, { silent: true }), 300, 300) : null;
    const userJid = this.#client.user?.id || this.#client.authState?.creds?.me?.id || jid;
    const msg = generateWAMessageFromContent(
      jid,
      {
        ...this._extraPayload,
        buttonsMessage: {
          contentText: this._body,
          footerText: this._footer,
          ...(this._data
            ? this._data
            : {
                headerType: 6,
                locationMessage: {
                  degreesLatitude: 0,
                  degreesLongitude: 0,
                  name: this._title,
                  address: this._subtitle,
                  jpegThumbnail: _thumbnail,
                },
              }),
          viewOnce: true,
          contextInfo: this._contextInfo,
          buttons: [...this._buttons],
        },
      },
      { userJid, ...options }
    );

    msg.key.id = options.messageId || generateMessageID();
    return msg;
  }

  async send(jid, { ...options } = {}) {
    if (!jid) throw new Error('ButtonV2.send: jid is required');
    if (this._buttons.length < 1) throw new Error('ButtonV2 requires at least one button');
    const msg = await this.build(jid, options);

    await this.#client.relayMessage(jid, msg.message, {
      messageId: msg.key.id,
      additionalNodes: [
        {
          tag: 'biz',
          attrs: {},
          content: [
            {
              tag: 'interactive',
              attrs: { type: 'native_flow', v: '1' },
              content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
            },
          ],
        },
      ],
      ...options,
    });
    return msg;
  }
}

class Carousel extends BaseBuilder {
  #client;

  constructor(client) {
    super();
    if (!client) {
      throw new Error('Socket is required');
    }

    this.#client = client;
    this._cards = [];
  }

  addCard(card) {
    const cards = Array.isArray(card) ? card : [card];
    const baseIndex = this._cards.length;

    for (const [index, c] of cards.entries()) {
      if (!c?.header?.hasMediaAttachment) {
        throw new Error(`Card [${baseIndex + index}] must include an image or video in header`);
      }
    }

    this._cards.push(...cards);
    return this;
  }

  build(jid, { ...options } = {}) {
    if (!jid) throw new Error('Carousel.build: jid is required');
    const userJid = this.#client.user?.id || this.#client.authState?.creds?.me?.id || jid;
    const msg = generateWAMessageFromContent(
      jid,
      {
        ...this._extraPayload,
        interactiveMessage: {
          header: {
            hasMediaAttachment: false,
          },
          body: { text: this._body },
          footer: { text: this._footer },
          contextInfo: this._contextInfo,
          carouselMessage: {
            cards: this._cards,
          },
        },
      },
      { userJid, ...options }
    );
    msg.key.id = options.messageId || generateMessageID();
    return msg;
  }

  async send(jid, { ...options } = {}) {
    if (!jid) throw new Error('Carousel.send: jid is required');
    const msg = this.build(jid, options);

    await this.#client.relayMessage(jid, msg.message, {
      messageId: msg.key.id,
      additionalNodes: [
        {
          tag: 'biz',
          attrs: {},
          content: [
            {
              tag: 'interactive',
              attrs: { type: 'native_flow', v: '1' },
              content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
            },
          ],
        },
      ],
      ...options,
    });
    return msg;
  }
}

class AIRich extends BaseBuilder {
  #client;

  constructor(client) {
    if (!client) {
      throw new Error('Socket is required');
    }

    super();
    this.#client = client;
    this._contextInfo = {};
    this._submessages = [];
    this._sections = [];
    this._richResponseSources = [];
  }

  addSubmessage(submessage) {
    const items = Array.isArray(submessage) ? submessage : [submessage];

    for (const item of items) {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) {
        throw new TypeError('Submessage must be a plain object or array of plain objects');
      }

      this._submessages.push(item);
    }

    return this;
  }

  addSection(section) {
    const items = Array.isArray(section) ? section : [section];

    for (const item of items) {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) {
        throw new TypeError('Section must be a plain object or array of plain objects');
      }

      this._sections.push(item);
    }

    return this;
  }

  addText(text, { hyperlink = true, citation = true, latex = true } = {}) {
    if (typeof text != 'string') {
      throw new TypeError('Text must be a string');
    }

    const { text: extractedText, inline_entities } = extractIE(text, {
      hyperlink,
      citation,
      latex,
    });

    this._submessages.push({
      messageType: 2,
      messageText: extractedText,
    });

    this._sections.push(
      AIRich.newLayout('Single', {
        text: extractedText,
        ...(inline_entities.length && {
          inline_entities,
        }),
        __typename: 'GenAIMarkdownTextUXPrimitive',
      })
    );

    return this;
  }

  addCode(language, code) {
    if (typeof language !== 'string' || typeof code !== 'string') {
      throw new TypeError('Language and code must be a string');
    }

    const meta = AIRich.tokenizer(code, language);

    this._submessages.push({
      messageType: 5,
      codeMetadata: {
        codeLanguage: language,
        codeBlocks: meta.codeBlock,
      },
    });

    this._sections.push(
      AIRich.newLayout('Single', {
        language,
        code_blocks: meta.unified_codeBlock,
        __typename: 'GenAICodeUXPrimitive',
      })
    );

    return this;
  }

  addTable(table, { hyperlink = true, citation = true, latex = true } = {}) {
    if (!Array.isArray(table)) {
      throw new TypeError('Table must be an array');
    }

    const meta = AIRich.toTableMetadata(table, { hyperlink, citation, latex });

    this._submessages.push({
      messageType: 4,
      tableMetadata: {
        title: meta.title,
        rows: meta.rows,
      },
    });

    this._sections.push(
      AIRich.newLayout('Single', {
        rows: meta.unified_rows,
        __typename: 'GenATableUXPrimitive',
      })
    );

    return this;
  }

  addSource(sources = []) {
    const isValidSources = Array.isArray(sources) && (
        sources.every((item) => typeof item === 'string') ||
        sources.every((item) => Array.isArray(item) && item.every((v) => typeof v === 'string'))
    );
    if (!isValidSources) {
      throw new TypeError('Sources must be a string array or an array of string arrays');
    }

    if (sources.every((item) => typeof item === 'string')) {
      sources = [sources];
    }

    const source = sources.map(([icon, url, text]) => ({
      source_type: 'THIRD_PARTY',
      source_display_name: text ?? '',
      source_subtitle: 'AI',
      source_url: url ?? '',
      favicon: {
        url: Toolkit.resolveMedia(this.#client, icon ?? '', 'image'),
        mime_type: 'image/jpeg',
        width: 16,
        height: 16,
      },
    }));

    this._sections.push(
      AIRich.newLayout('Single', {
        sources: source,
        __typename: 'GenAISearchResultPrimitive',
      })
    );

    return this;
  }

  addReels(reelsItems = []) {
    if (
      !(
        (reelsItems && typeof reelsItems === 'object' && !Array.isArray(reelsItems)) ||
        (Array.isArray(reelsItems) && reelsItems.every((item) => item && typeof item === 'object' && !Array.isArray(item)))
      )
    ) {
      throw new TypeError('Reels items must be an object or an array of objects');
    }

    if (!Array.isArray(reelsItems)) {
      reelsItems = [reelsItems];
    }

    const reels = reelsItems.map((item) => ({
      ...item,
      _avatar: Toolkit.resolveMedia(this.#client, item.profileIconUrl ?? item.profile_url ?? item.profile ?? '', 'image'),
      _thumbnail: Toolkit.resolveMedia(this.#client, item.thumbnailUrl ?? item.thumbnail ?? '', 'image'),
    }));

    this._submessages.push({
      messageType: 9,
      contentItemsMetadata: {
        contentType: 1,
        itemsMetadata: reels.map((item) => ({
          reelItem: {
            title: item.username ?? '',
            profileIconUrl: item._avatar,
            thumbnailUrl: item._thumbnail,
            videoUrl: item.videoUrl ?? item.url ?? '',
          },
        })),
      },
    });

    reels.forEach((item, idx) => {
      this._richResponseSources.push({
        provider: 'NIXEL',
        thumbnailCDNURL: item._thumbnail,
        sourceProviderURL: item.videoUrl ?? item.url ?? '',
        sourceQuery: '',
        faviconCDNURL: item._avatar,
        citationNumber: idx + 1,
        sourceTitle: item.username ?? '',
      });
    });

    this._sections.push(
      AIRich.newLayout(
        'HScroll',
        reels.map((item) => ({
          reels_url: item.videoUrl ?? item.url ?? '',
          thumbnail_url: item._thumbnail,
          creator: item.username ?? item.title ?? '',
          avatar_url: item._avatar,
          reels_title: item.reels_title ?? item.title ?? '',
          likes_count: item.likes_count ?? item.like ?? 0,
          shares_count: item.shares_count ?? item.share ?? 0,
          view_count: item.view_count ?? item.view ?? 0,
          reel_source: item.reel_source ?? item.source ?? 'IG',
          is_verified: !!(item.is_verified || item.verified),
          __typename: 'GenAIReelPrimitive',
        }))
      )
    );

    return this;
  }

  addImage(imageUrl, { resolveUrl = false } = {}) {
    if (!(typeof imageUrl === 'string' || Buffer.isBuffer(imageUrl) || (Array.isArray(imageUrl) && imageUrl.every((v) => typeof v === 'string' || Buffer.isBuffer(v))))) {
      throw new TypeError('imageUrl must be string | buffer | array of string/buffer');
    }

    const list = Array.isArray(imageUrl)
      ? imageUrl.map((v) => {
          const url = Toolkit.resolveMedia(this.#client, v, 'image', { resolveUrl });
          return {
            imagePreviewUrl: url,
            imageHighResUrl: url,
            sourceUrl: url,
          };
        })
      : (() => {
          const url = Toolkit.resolveMedia(this.#client, imageUrl, 'image', { resolveUrl });
          return [
            {
              imagePreviewUrl: url,
              imageHighResUrl: url,
              sourceUrl: url,
            },
          ];
        })();

    this._submessages.push({
      messageType: 1,
      gridImageMetadata: {
        gridImageUrl: {
          imagePreviewUrl: list[0]?.imagePreviewUrl,
        },
        imageUrls: list,
      },
    });

    list.forEach(({ imagePreviewUrl }) => {
      this._sections.push(
        AIRich.newLayout('Single', {
          media: {
            url: imagePreviewUrl,
            mime_type: 'image/png',
          },
          imagine_type: 'IMAGE',
          status: { status: 'READY' },
          __typename: 'GenAIImaginePrimitive',
        })
      );
    });

    return this;
  }

  addVideo(videoUrl, { autoFill = true } = {}) {
    const isObjectVideo = (v) => v && typeof v === 'object' && v.url;

    const isValidPrimitive =
      typeof videoUrl === 'string' ||
      Buffer.isBuffer(videoUrl) ||
      isObjectVideo(videoUrl) ||
      (Array.isArray(videoUrl) && videoUrl.every((v) => typeof v === 'string' || Buffer.isBuffer(v) || isObjectVideo(v)));

    if (!isValidPrimitive) {
      throw new TypeError('videoUrl must be string | buffer | object | array');
    }

    const items = Array.isArray(videoUrl) ? videoUrl : [videoUrl];

    this._submessages.push({
      messageType: 2,
      messageText: '[ CANNOT_LOAD_VIDEO - NIXEL ]',
    });

    items.forEach((item) => {
      const isObject = isObjectVideo(item);

      const url = isObject ? Toolkit.resolveMedia(this.#client, item.url ?? '', 'video') : Toolkit.resolveMedia(this.#client, item, 'video');

      const bufferPromise = autoFill ? Promise.resolve(url).then((u) => Toolkit.fetchBuffer(u)) : null;

      const file_length = isObject && item.file_length != null ? item.file_length : autoFill ? bufferPromise.then((b) => b?.length ?? 0) : 0;

      const duration =
        isObject && item.duration != null
          ? item.duration
          : autoFill
            ? bufferPromise.then((b) =>
                Toolkit.getMp4Duration(b, {
                  silent: true,
                })
              )
            : 0;

      const thumbnail =
        isObject && item.thumbnail
          ? Toolkit.resolveMedia(this.#client, item.thumbnail, 'image', {
              result: 'base64',
              resize: true,
              width: 300,
              height: 300,
            })
          : autoFill
            ? bufferPromise
              ? bufferPromise.then((b) =>
                  Toolkit.getMp4Preview(b, {
                    time: 0,
                    result: 'base64',
                  })
                )
              : null
            : null;

      this._sections.push(
        AIRich.newLayout('Single', {
          media: {
            url,
            mime_type: isObject ? (item.mime_type ?? 'video/mp4') : 'video/mp4',
            file_length,
            duration,
          },
          imagine_type: 'ANIMATE',
          status: { status: 'READY' },
          thumbnail: {
            raw_media: thumbnail,
          },
          __typename: 'GenAIImaginePrimitive',
        })
      );
    });

    return this;
  }

  addProduct(data = {}) {
    if (!((data && typeof data === 'object' && !Array.isArray(data)) || (Array.isArray(data) && data.every((item) => item && typeof item === 'object' && !Array.isArray(item))))) {
      throw new TypeError('Product items must be an object or an array of objects');
    }

    this._submessages.push({
      messageType: 2,
      messageText: '[ CANNOT_LOAD_PRODUCT - NIXEL ]',
    });

    const items = Array.isArray(data) ? data : [data];

    const product = items.map((item) => ({
      title: item.title,
      brand: item.brand,
      price: item.price,
      sale_price: item.sale_price,
      product_url: item.product_url ?? item.url,
      image: {
        url: Toolkit.resolveMedia(this.#client, item.image_url ?? item.image, 'image'),
      },
      additional_images: [
        {
          url: Toolkit.resolveMedia(this.#client, item.icon_url ?? item.icon, 'image'),
        },
      ],
      __typename: 'GenAIProductItemCardPrimitive',
    }));

    this._sections.push(AIRich.newLayout(Array.isArray(data) ? 'HScroll' : 'Single', Array.isArray(data) ? product : product[0]));

    return this;
  }

  addPost(data = {}) {
    if (!((data && typeof data === 'object' && !Array.isArray(data)) || (Array.isArray(data) && data.every((item) => item && typeof item === 'object' && !Array.isArray(item))))) {
      throw new TypeError('Post items must be an object or an array of objects');
    }

    const posts = Array.isArray(data) ? data : [data];

    this._submessages.push({
      messageType: 2,
      messageText: '[ CANNOT_LOAD_POST - NIXEL ]',
    });

    const primitives = posts.map((p) => ({
      title: p.title ?? '',
      subtitle: p.subtitle ?? '',
      username: p.username ?? '',
      profile_picture_url: Toolkit.resolveMedia(this.#client, p.profile_picture_url ?? p.profile_url ?? p.profile ?? '', 'image'),
      is_verified: !!(p.is_verified || p.verified),
      thumbnail_url: Toolkit.resolveMedia(this.#client, p.thumbnail_url ?? p.thumbnail ?? '', 'image'),
      post_caption: p.post_caption ?? p.caption ?? '',
      likes_count: p.likes_count ?? p.like ?? 0,
      comments_count: p.comments_count ?? p.comment ?? 0,
      shares_count: p.shares_count ?? p.share ?? 0,
      post_url: p.post_url ?? p.url ?? '',
      post_deeplink: p.post_deeplink ?? p.deeplink ?? '',
      source_app: p.source_app || p.source || 'INSTAGRAM',
      footer_label: p.footer_label ?? p.footer ?? '',
      footer_icon: Toolkit.resolveMedia(this.#client, p.footer_icon ?? p.icon ?? '', 'image'),
      is_carousel: posts.length > 1,
      orientation: p.orientation ?? 'LANDSCAPE',
      post_type: p.post_type ?? 'VIDEO',
      __typename: 'GenAIPostPrimitive',
    }));

    this._sections.push(AIRich.newLayout('HScroll', primitives));

    return this;
  }

  addTip(text) {
    this._submessages.push({
      messageType: 2,
      messageText: text,
    });

    this._sections.push(
      AIRich.newLayout('Single', {
        text,
        __typename: 'GenAIMetadataTextPrimitive',
      })
    );

    return this;
  }

  addSuggest(suggestion, { scroll = true, layout } = {}) {
    if (!(typeof suggestion === 'string' || (Array.isArray(suggestion) && suggestion.every((v) => typeof v === 'string')))) {
      throw new TypeError('Suggestion must be a string or array of strings');
    }

    const suggest = Array.isArray(suggestion)
      ? suggestion.map((text) => ({
          prompt_text: text,
          prompt_type: 'SUGGESTED_PROMPT',
          __typename: 'GenAIFollowUpSuggestionPillPrimitive',
        }))
      : [
          {
            prompt_text: suggestion,
            prompt_type: 'SUGGESTED_PROMPT',
            __typename: 'GenAIFollowUpSuggestionPillPrimitive',
          },
        ];

    const type = layout ?? (suggest.length === 1 ? 'Single' : scroll ? 'HScroll' : 'ActionRow');

    this._sections.push(AIRich.newLayout(type, type === 'Single' ? suggest[0] : suggest, { __typename: 'GenAIUnifiedResponseSection' }));

    return this;
  }

  async build({ forwarded = true, notification = false, includesUnifiedResponse = true, includesSubmessages = true, quoted, quotedParticipant, ...options } = {}) {
    const forward = forwarded
      ? {
          forwardingScore: 1,
          isForwarded: true,
          forwardedAiBotMessageInfo: { botJid: '0@bot' },
          forwardOrigin: 4,
        }
      : {};

    const notif = notification
      ? {
          sessionTransparencyMetadata: {
            disclaimerText: '~ Ahmad tumbuh kembang',
            hcaId: `hca_${Date.now()}`,
            sessionTransparencyType: 1,
          },
        }
      : {};

    const qObj = quoted
      ? {
          stanzaId: quoted?.key?.id || quoted?.id,
          participant: quotedParticipant || quoted?.key?.participant || quoted?.key?.remoteJid,
          quotedType: 0,
          quotedMessage: typeof quoted === 'object' && quoted !== null ? (quoted.message ?? quoted) : undefined,
        }
      : {};

    const sections = this._footer
      ? [
          ...(await waitAllPromises(this._sections)),
          AIRich.newLayout('Single', {
            text: this._footer,
            __typename: 'GenAIMetadataTextPrimitive',
          }),
        ]
      : [...(await waitAllPromises(this._sections))];

    return {
      messageContextInfo: {
        deviceListMetadata: {},
        deviceListMetadataVersion: 2,
        botMetadata: {
          messageDisclaimerText: this._title,
          richResponseSourcesMetadata: { sources: this._richResponseSources },
          ...notif,
        },
      },
      ...this._extraPayload,
      botForwardedMessage: {
        message: {
          richResponseMessage: {
            messageType: 1,
            submessages: includesSubmessages ? await waitAllPromises(this._submessages) : [],
            unifiedResponse: {
              data: includesUnifiedResponse ? Buffer.from(JSON.stringify({ response_id: randomUUID(), sections })).toString('base64') : '',
            },
            contextInfo: {
              ...forward,
              ...qObj,
              ...this._contextInfo,
            },
          },
        },
      },
    };
  }

  async send(jid, { forwarded, notification, includesUnifiedResponse, includesSubmessages, ...options } = {}) {
    const msg = await this.build({ forwarded, notification, includesUnifiedResponse, includesSubmessages, ...options });

    return await this.#client.relayMessage(jid, msg, { ...options });
  }

  static tokenizer(code, lang = 'javascript') {
    const keywordsMap = {
      javascript: new Set([
        'break',
        'case',
        'catch',
        'continue',
        'debugger',
        'delete',
        'do',
        'else',
        'finally',
        'for',
        'function',
        'if',
        'in',
        'instanceof',
        'new',
        'return',
        'switch',
        'this',
        'throw',
        'try',
        'typeof',
        'var',
        'void',
        'while',
        'with',
        'true',
        'false',
        'null',
        'undefined',
        'class',
        'const',
        'let',
        'super',
        'extends',
        'export',
        'import',
        'yield',
        'static',
        'constructor',
        'async',
        'await',
        'get',
        'set',
      ]),

      typescript: new Set([
        'abstract',
        'any',
        'as',
        'asserts',
        'bigint',
        'boolean',
        'declare',
        'enum',
        'implements',
        'infer',
        'interface',
        'is',
        'keyof',
        'module',
        'namespace',
        'never',
        'readonly',
        'require',
        'number',
        'object',
        'override',
        'private',
        'protected',
        'public',
        'satisfies',
        'string',
        'symbol',
        'type',
        'unknown',
        'using',
        'from',
        'break',
        'case',
        'catch',
        'continue',
        'do',
        'else',
        'finally',
        'for',
        'function',
        'if',
        'new',
        'return',
        'switch',
        'this',
        'throw',
        'try',
        'var',
        'void',
        'while',
        'class',
        'const',
        'let',
        'extends',
        'import',
        'export',
        'async',
        'await',
      ]),

      python: new Set([
        'False',
        'None',
        'True',
        'and',
        'as',
        'assert',
        'async',
        'await',
        'break',
        'class',
        'continue',
        'def',
        'del',
        'elif',
        'else',
        'except',
        'finally',
        'for',
        'from',
        'global',
        'if',
        'import',
        'in',
        'is',
        'lambda',
        'nonlocal',
        'not',
        'or',
        'pass',
        'raise',
        'return',
        'try',
        'while',
        'with',
        'yield',
      ]),

      java: new Set([
        'abstract',
        'assert',
        'boolean',
        'break',
        'byte',
        'case',
        'catch',
        'char',
        'class',
        'const',
        'continue',
        'default',
        'do',
        'double',
        'else',
        'enum',
        'extends',
        'final',
        'finally',
        'float',
        'for',
        'goto',
        'if',
        'implements',
        'import',
        'instanceof',
        'int',
        'interface',
        'long',
        'native',
        'new',
        'package',
        'private',
        'protected',
        'public',
        'return',
        'short',
        'static',
        'strictfp',
        'super',
        'switch',
        'synchronized',
        'this',
        'throw',
        'throws',
        'transient',
        'try',
        'void',
        'volatile',
        'while',
      ]),

      golang: new Set([
        'break',
        'case',
        'chan',
        'const',
        'continue',
        'default',
        'defer',
        'else',
        'fallthrough',
        'for',
        'func',
        'go',
        'goto',
        'if',
        'import',
        'interface',
        'map',
        'package',
        'range',
        'return',
        'select',
        'struct',
        'switch',
        'type',
        'var',
      ]),

      c: new Set([
        'auto',
        'break',
        'case',
        'char',
        'const',
        'continue',
        'default',
        'do',
        'double',
        'else',
        'enum',
        'extern',
        'float',
        'for',
        'goto',
        'if',
        'int',
        'long',
        'register',
        'return',
        'short',
        'signed',
        'sizeof',
        'static',
        'struct',
        'switch',
        'typedef',
        'union',
        'unsigned',
        'void',
        'volatile',
        'while',
      ]),

      cpp: new Set([
        'alignas',
        'alignof',
        'and',
        'auto',
        'bool',
        'break',
        'case',
        'catch',
        'class',
        'const',
        'constexpr',
        'continue',
        'delete',
        'do',
        'double',
        'else',
        'enum',
        'explicit',
        'export',
        'extern',
        'false',
        'float',
        'for',
        'friend',
        'if',
        'inline',
        'int',
        'long',
        'mutable',
        'namespace',
        'new',
        'noexcept',
        'nullptr',
        'operator',
        'private',
        'protected',
        'public',
        'return',
        'short',
        'signed',
        'sizeof',
        'static',
        'struct',
        'switch',
        'template',
        'this',
        'throw',
        'true',
        'try',
        'typedef',
        'typename',
        'union',
        'unsigned',
        'using',
        'virtual',
        'void',
        'while',
      ]),

      php: new Set([
        'abstract',
        'and',
        'array',
        'as',
        'break',
        'callable',
        'case',
        'catch',
        'class',
        'clone',
        'const',
        'continue',
        'declare',
        'default',
        'do',
        'echo',
        'else',
        'elseif',
        'empty',
        'enddeclare',
        'endfor',
        'endforeach',
        'endif',
        'endswitch',
        'endwhile',
        'extends',
        'final',
        'finally',
        'fn',
        'for',
        'foreach',
        'function',
        'global',
        'goto',
        'if',
        'implements',
        'include',
        'include_once',
        'instanceof',
        'interface',
        'match',
        'namespace',
        'new',
        'null',
        'or',
        'private',
        'protected',
        'public',
        'require',
        'require_once',
        'return',
        'static',
        'switch',
        'throw',
        'trait',
        'try',
        'use',
        'var',
        'while',
        'yield',
      ]),

      rust: new Set([
        'as',
        'break',
        'const',
        'continue',
        'crate',
        'else',
        'enum',
        'extern',
        'false',
        'fn',
        'for',
        'if',
        'impl',
        'in',
        'let',
        'loop',
        'match',
        'mod',
        'move',
        'mut',
        'pub',
        'ref',
        'return',
        'self',
        'Self',
        'static',
        'struct',
        'super',
        'trait',
        'true',
        'type',
        'unsafe',
        'use',
        'where',
        'while',
      ]),

      html: new Set([
        'html',
        'head',
        'body',
        'div',
        'span',
        'p',
        'a',
        'img',
        'video',
        'audio',
        'script',
        'style',
        'link',
        'meta',
        'form',
        'input',
        'button',
        'table',
        'tr',
        'td',
        'th',
        'ul',
        'ol',
        'li',
        'section',
        'article',
        'header',
        'footer',
        'nav',
        'main',
      ]),

      bash: new Set([
        'if',
        'then',
        'else',
        'elif',
        'fi',
        'for',
        'while',
        'do',
        'done',
        'case',
        'esac',
        'function',
        'in',
        'select',
        'until',
        'break',
        'continue',
        'return',
        'export',
        'readonly',
        'local',
        'declare',
      ]),

      markdown: new Set(['#', '##', '###', '####', '#####', '######']),
    };

    if (!lang || lang === 'txt' || lang === 'text' || lang === 'plaintext') {
      return {
        codeBlock: [
          {
            codeContent: code,
            highlightType: 0,
          },
        ],
        unified_codeBlock: [
          {
            content: code,
            type: 'DEFAULT',
          },
        ],
      };
    }

    const TYPE_MAP = {
      0: 'DEFAULT',
      1: 'KEYWORD',
      2: 'METHOD',
      3: 'STR',
      4: 'NUMBER',
      5: 'COMMENT',
    };

    const keywords = keywordsMap[lang.toLowerCase()] || new Set();
    const tokens = [];

    let i = 0;

    const push = (content, type) => {
      if (!content) return;

      const last = tokens[tokens.length - 1];

      if (last && last.highlightType === type) {
        last.codeContent += content;
      } else {
        tokens.push({
          codeContent: content,
          highlightType: type,
        });
      }
    };

    const isIdentifier = (char) => {
      switch (lang.toLowerCase()) {
        case 'css':
          return /[a-zA-Z0-9_$-]/.test(char);

        case 'html':
          return /[a-zA-Z0-9_$:-]/.test(char);

        default:
          return /[a-zA-Z0-9_$]/.test(char);
      }
    };

    while (i < code.length) {
      const c = code[i];

      if (/\s/.test(c)) {
        let s = i;

        while (i < code.length && /\s/.test(code[i])) {
          i++;
        }

        push(code.slice(s, i), 0);
        continue;
      }

      if ((c === '/' && code[i + 1] === '/') || (c === '#' && ['python', 'bash'].includes(lang))) {
        let s = i;

        while (i < code.length && code[i] !== '\n') {
          i++;
        }

        push(code.slice(s, i), 5);
        continue;
      }

      if (c === '"' || c === "'" || c === '`') {
        let s = i;
        const q = c;

        i++;

        while (i < code.length) {
          if (code[i] === '\\' && i + 1 < code.length) {
            i += 2;
          } else if (code[i] === q) {
            i++;
            break;
          } else {
            i++;
          }
        }

        push(code.slice(s, i), 3);
        continue;
      }

      if (/[0-9]/.test(c)) {
        let s = i;

        while (i < code.length && /[0-9._]/.test(code[i])) {
          i++;
        }

        push(code.slice(s, i), 4);
        continue;
      }

      if (/[a-zA-Z_$]/.test(c)) {
        let s = i;

        while (i < code.length && isIdentifier(code[i])) {
          i++;
        }

        const word = code.slice(s, i);

        let type = 0;

        if (keywords.has(word)) {
          type = 1;
        } else if (lang === 'css') {
          let j = i;

          while (j < code.length && /\s/.test(code[j])) {
            j++;
          }

          if (code[j] === ':') {
            type = 1;
          }
        } else if (lang === 'html') {
          let p = s - 1;

          while (p >= 0 && /\s/.test(code[p])) {
            p--;
          }

          if (code[p] === '<' || (code[p] === '/' && code[p - 1] === '<')) {
            type = 1;
          }
        }

        if (type === 0) {
          let j = i;

          while (j < code.length && /\s/.test(code[j])) {
            j++;
          }

          if (code[j] === '(') {
            type = 2;
          }
        }

        push(word, type);
        continue;
      }

      push(c, 0);
      i++;
    }

    return {
      codeBlock: tokens,
      unified_codeBlock: tokens.map((t) => ({
        content: t.codeContent,
        type: TYPE_MAP[t.highlightType],
      })),
    };
  }

  static toTableMetadata(arr, { hyperlink = true, citation = true, latex = true } = {}) {
    if (!Array.isArray(arr) || !arr.every((row) => Array.isArray(row) && row.every((cell) => typeof cell === 'string'))) {
      throw new TypeError('Table must be a nested array of strings');
    }

    const [header, ...rows] = arr;

    const maxLen = Math.max(header.length, ...rows.map((r) => r.length));

    const normalize = (r) => [...r, ...Array(maxLen - r.length).fill('')];

    const unified_rows = [
      {
        is_header: true,
        cells: normalize(header),
      },
      ...rows.map((r) => ({
        is_header: false,
        cells: normalize(r),
      })),
    ].map((row) => {
      const markdown_cells = row.cells.map((cell) => {
        const extracted = extractIE(cell, { hyperlink, citation, latex });

        return {
          text: extracted.text,
          ...(extracted.inline_entities.length ? { inline_entities: extracted.inline_entities } : {}),
        };
      });

      return {
        ...row,
        ...(markdown_cells.some((c) => c.inline_entities?.length) ? { markdown_cells } : {}),
      };
    });

    const rowsMeta = unified_rows.map((r) => ({
      items: r.cells,
      ...(r.is_header ? { isHeading: true } : {}),
    }));

    return {
      title: '',
      rows: rowsMeta,
      unified_rows,
    };
  }

  static newLayout(name, data, extra = {}) {
    return {
      ...extra,
      view_model: {
        [Array.isArray(data) ? 'primitives' : 'primitive']: data,
        __typename: `GenAI${name}LayoutViewModel`,
      },
    };
  }
}

global.Button = Button;
global.ButtonV2 = ButtonV2;
global.Carousel = Carousel;
global.AIRich = AIRich;
global.Toolkit = Toolkit;

const file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  delete require.cache[file];
  require(file);
});

module.exports = {
  getRandom,
  sleep,
  convertToPtt,
  convertToMp3,
  sendAudio,
  getBuffer,
  fetchJson,
  convertToOgg,
  storeZip,
  sendStickerPack,
  bindWrapper,
  Button,
  ButtonV2,
  Carousel,
  AIRich,
  Toolkit
};