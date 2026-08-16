const fs = require("fs");
const search = require("yt-search");
const { Button, getBuffer } = require("../lib/helper");
const { Toolkit } = require("../lib/helper");

module.exports = {
    name: "play",
    aliases: ["ytplay", "song"],
    category: "tools",
    cooldown: 15000,
    owner: true,
    description: "Search YouTube & send audio via api.nasirxml.dev. .play <title>",
    async run(sock, m, args, reply, chat) {
        const query = args.join(" ").trim();
        if (!query) return reply("❌ Usage: `.play <song title>`");
        const res = await search(query);
        if (!res.videos?.length) return reply("❌ Video not found.");
        const video = res.videos[0];
        await new Button(sock).setImage(await getBuffer(video.thumbnail)).setTitle(video.title).setFooter(video.author.name).addUrl("YouTube", video.url).send(m.chat, { quoted: m });
        try {
            const encoded = encodeURIComponent(video.url.trim());
            const fetchRes = await fetch(`https://api.nasirxml.dev/download/ytmp3?url=${encoded}`,{headers: { accept: "application/json" },method: "GET",signal: AbortSignal.timeout(45000)},);
            if (!fetchRes.ok) throw new Error(`API returned ${fetchRes.status}`);
            const data = await fetchRes.json();
            if (!data.downloadUrl) throw new Error("Download URL not found in API response");
            await sock.sendMessage(chat, { audio: { url: data.downloadUrl }, mimetype: "audio/mpeg", ptt: false, fileName: `${video.title.replace(/[^\w\s-]/g, "")}.mp3` }, { quoted: m });
        } catch (error) {
            console.error("[PLAY ERROR]", error.message);
            reply(`❌ Download failed: ${error.message}`);
        }
    },
};
