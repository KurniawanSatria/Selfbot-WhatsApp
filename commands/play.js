const fs = require("fs");
const path = require("path");
const search = require("yt-search");
const { exec } = require("child_process");
const { promisify } = require("util");
const { Button, getBuffer } = require("../lib/helper");

const execAsync = promisify(exec);

const TMP_DIR = "/home/container/tmp";
const CACHE_DIR = "/home/container/tmp/play-cache";
const YTDLP = "/home/container/yt-dlp_linux";
const DENO = "/home/container/.deno/bin/deno";
const COOKIES = "/home/container/cookies.txt";

fs.mkdirSync(CACHE_DIR, { recursive: true });

module.exports = {
  name: "play",
  aliases: ["ytplay", "song"],
  category: "Utility",
  cooldown: 15000,
  owner: true,
  description:
    "Search YouTube and download audio using yt-dlp. .play <song title>",

  async run(sock, m, args, reply, chat) {
    const query = args.join(" ").trim();

    if (!query) {
      return reply("⌬ Usage  ›  .play <song title>");
    }

    try {
      const res = await search(query);

      if (!res.videos?.length) {
        return reply("╰─ No matching video found.");
      }

      const video = res.videos[0];
      const videoId = video.videoId;

      const safeTitle = video.title
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, " ")
        .trim();

      const audioFile = path.join(CACHE_DIR, `${videoId}.mp3`);

      const output = path.join(CACHE_DIR, `${videoId}.%(ext)s`);

      await new Button(sock)
        .setImage(await getBuffer(video.thumbnail))
        .setTitle(video.title)
        .setBody(`Artist › ${video.author.name}`)
        .setFooter("⌁ Downloading audio...")
        .addUrl("YouTube", video.url)
        .send(m.chat, { quoted: m });

      if (!fs.existsSync(audioFile)) {
        await execAsync(
          `TMPDIR=${TMP_DIR} "${YTDLP}" ` +
            `--js-runtimes deno:"${DENO}" ` +
            `--cookies "${COOKIES}" ` +
            `-f "ba/b" ` +
            `-x --audio-format mp3 ` +
            `--no-playlist ` +
            `--no-part ` +
            `-o "${output}" ` +
            `"${video.url}"`,
        );
      }

      if (!fs.existsSync(audioFile)) {
        throw new Error("Audio file was not generated after download.");
      }

      await sock.sendMessage(
        chat,
        {
          audio: {
            stream: fs.createReadStream(audioFile),
          },
          mimetype: "audio/mpeg",
          ptt: false,
          fileName: `${safeTitle}.mp3`,
        },
        { quoted: m },
      );
    } catch (error) {
      console.error("[PLAY ERROR]", error);
      await reply(`╰─ Download failed: ${error.message}`);
    }
  },
};
