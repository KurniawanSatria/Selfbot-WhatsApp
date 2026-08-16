const { spawn } = require("child_process");
const axios = require('axios');
const fs = require("fs");
const path = require("path");
const os = require("os");

const YTDLP_BIN = process.env.YTDLP_PATH || "/home/container/yt-dlp";
const TMP_DIR = path.join(os.tmpdir(), "ytmp3-cache");

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

function run(bin, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, options);
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Timeout: ${bin} tidak selesai dalam waktu yang ditentukan`));
    }, options.timeoutMs || 120000);

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`Gagal menjalankan "${bin}": ${err.message} (pastikan binary tersedia di PATH)`));
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`${bin} exit code ${code}: ${stderr.slice(-500) || stdout.slice(-500)}`));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

async function ytmp3(url) {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const outputTemplate = path.join(TMP_DIR, `${id}.%(ext)s`);
  await run(
    YTDLP_BIN,
    [
      "-x",
      "--audio-format", "mp3",
      "--audio-quality", "128K",
      "--no-playlist",
      "--no-warnings",
      "--extractor-args", "youtube:player_client=android,web,tv",
      "-o", outputTemplate,
      url,
    ],
    { timeoutMs: 120000 }
  );
  const expectedPath = path.join(TMP_DIR, `${id}.mp3`);
  if (!fs.existsSync(expectedPath)) {
    const files = fs.readdirSync(TMP_DIR).filter((f) => f.startsWith(id));
    if (files.length === 0) {
      throw new Error("yt-dlp selesai tapi file output tidak ditemukan");
    }
    return {
      filePath: path.join(TMP_DIR, files[0]),
      cleanup: () => fs.promises.unlink(path.join(TMP_DIR, files[0])).catch(() => {}),
    };
  }
  return {
    filePath: expectedPath,
    cleanup: () => fs.promises.unlink(expectedPath).catch(() => {}),
  };
}



async function pollStatus(statusUrl, headers) {
    const r = await axios.get(statusUrl, { headers, timeout: 15000, validateStatus: () => true });
    if (typeof r.data === "string") {
        throw new Error(`Status endpoint tidak mengembalikan JSON (status ${r.status}): ${r.data.slice(0, 150)}`);
    }
    return r.data;
}



async function ttsave(url) {
  try {
    const requestData = new URLSearchParams({
      url: url,
      count: 12,
      cursor: 0,
      web: 1,
      hd: 1
    });

    const response = await axios.post('https://tikwm.com/api/', requestData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });

    const apiData = response.data;

    if (apiData.code !== 0) {
      return {
        author: "Herza",
        status: 400,
        message: apiData.msg || "API request failed"
      };
    }

    const data = apiData.data;

    const isSlide = data.images && data.images.length > 0;
    const isVideo = data.duration > 0 && (data.play || data.hdplay);

    let contentType;
    if (isSlide) {
      contentType = "slide";
    } else if (isVideo) {
      contentType = "video";
    } else {
      contentType = "unknown";
    }

    const result = {
      author: "Saturia",
      status: 200,
      data: {
        type: contentType,
        id: data.id,
        title: data.title,
        region: data.region,
        cover: `https://tikwm.com${data.cover}`,
        duration: data.duration,

        author: {
          id: data.author.id,
          username: data.author.unique_id,
          nickname: data.author.nickname,
          avatar: `https://tikwm.com${data.author.avatar}`
        },

        stats: {
          play_count: data.play_count,
          digg_count: data.digg_count,
          comment_count: data.comment_count,
          share_count: data.share_count,
          download_count: data.download_count,
          collect_count: data.collect_count
        },

        music: data.music_info ? {
          id: data.music_info.id,
          title: data.music_info.title,
          author: data.music_info.author,
          duration: data.music_info.duration,
          original: data.music_info.original,
          play_url: data.music_info.play
        } : null,

        created_time: data.create_time
      }
    };

    if (contentType === "video") {
      result.data.video = {
        play_url: `https://tikwm.com${data.play}`,
        watermark_play_url: `https://tikwm.com${data.wmplay}`,
        hd_play_url: `https://tikwm.com${data.hdplay}`,
        size: data.size,
        wm_size: data.wm_size,
        hd_size: data.hd_size
      };
      result.data.music_url = `https://tikwm.com${data.music}`;
    } else if (contentType === "slide") {
      result.data.images = data.images.map(img => {
        if (img.startsWith('http')) {
          return img;
        }
        return `https://tikwm.com${img}`;
      });
      result.data.music_url = `https://tikwm.com${data.music}`;
    }

    return result;

  } catch (error) {
    return {
      author: "Saturia",
      status: 500,
      message: "Error occurred while scraping",
      error: error.message
    };
  }
}

async function instaDL(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.post(
        "https://api.zoraahub.com/fetch.php",
        { url },
        {
          headers: {
            "content-type": "application/json",
            accept: "*/*",
            Referer: "https://downreels.com/",
          },
          timeout: 15000,
        }
      );

      const data = res.data;
      if (data.status !== "ok" || !Array.isArray(data.videos)) {
        return [];
      }

      return data.videos.map((item) =>
        item.isVideo ? { video: { url: item.url } } : { image: { url: item.url } }
      );
    } catch (err) {
      const status = err.response?.status;
      const retryable = [502, 503, 504].includes(status) || err.code === "ECONNABORTED";

      console.error(`[instaDL] Attempt ${attempt} gagal:`, status || err.code || err.message);

      if (!retryable || attempt === retries) {
        return [];
      }

      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }

  return [];
}

async function instagram(url) {
  const response = await fetch("https://api.downloadgram.org/media", {
    method: "POST",
    headers: {
      accept: "*/*",
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://downloadgram.org",
      referer: "https://downloadgram.org/"
    },
    body: new URLSearchParams({ url })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  let body = await response.text();
  body = body.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );

  const results = [];

  const blockRegex =
    /<div class="download-items__thumb">[\s\S]*?<i class="icon-sprite icon-i(photo|video)"><\/i>[\s\S]*?<\/div>\s*<div class="download-items__btn"><a\s+href="([^"]+)"/g;

  let match;
  while ((match = blockRegex.exec(body)) !== null) {
    const [, iconType, mediaUrl] = match;
    const key = iconType === "video" ? "video" : "image";

    results.push({
      [key]: { url: mediaUrl }
    });
  }

  return results;
}



module.exports = {
  instagram,
  ttsave,
  instaDL,
  ytmp3,
};
