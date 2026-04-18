const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const axios = require("axios"); // ← tambah ini
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

module.exports = { getRandom, sleep, convertToPtt, convertToMp3, sendAudio, getBuffer, fetchJson, convertToOgg };

// ─── Self hot-reload ──────────────────────────────────────────────────────────
const file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  delete require.cache[file];
  require(file);
});