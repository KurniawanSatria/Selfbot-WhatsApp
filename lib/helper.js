const fs     = require("fs");
const path   = require("path");
const ffmpeg = require("fluent-ffmpeg");
const axios  = require("axios"); // ← tambah ini
const { TMP_DIR } = require("../config");

// ─── SETUP DIR ───────────────────────────────────────────────────────────────
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR);

// ─── HELPERS ─────────────────────────────────────────────────────────────────
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
      .on("end",   () => resolve(outputPath))
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
      .on("end",   () => resolve(outputPath))
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
    ...(ptt ? { waveform: new Uint8Array(64) } : {}),
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

module.exports = { getRandom, sleep, convertToPtt, convertToMp3, sendAudio, getBuffer, fetchJson, convertToOgg };

// ─── Self hot-reload ──────────────────────────────────────────────────────────
const file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  delete require.cache[file];
  require(file);
});