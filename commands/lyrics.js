const { getBuffer, fetchJson, Button } = require("../lib/helper");

module.exports = {
  name: "lyrics",
  aliases: ["lirik", "lrc"],
  category: "Utility",
  description: "Search and retrieve song lyrics",
  async run(sock, m, args, reply) {
    const text = args.join(" ");

    if (!text) {
      return reply("⌬ Usage  ›  .lyrics <song title>");
    }

    if (/^\d+$/.test(text)) {
      try {
        const data = await fetchJson(`https://lrclib.net/api/get/${text}`);

        if (!data) {
          return reply("╰─ Lyrics not found.");
        }

        const lyrics = data.plainLyrics || data.syncedLyrics;

        if (!lyrics) {
          return reply("╰─ Lyrics are not available.");
        }

        return reply(
          `「 ${data.trackName || "Unknown Title"} 」\n` +
            `Artist › ${data.artistName || "Unknown"}\n\n` +
            `\`\`\`${lyrics}\`\`\``,
        );
      } catch {
        return reply("╰─ Failed to retrieve lyrics.");
      }
    }

    const res = await fetchJson(
      `https://lrclib.net/api/search?q=${encodeURIComponent(text)}`,
    );

    if (!res?.length) {
      return reply("╰─ No matching songs found.");
    }

    const btn = new Button(sock)
      .setImage(
        await getBuffer(
          "https://www.flamingtext.com/net-fu/proxy_form.cgi?imageoutput=true&script=since-1999-svg&text=Lyrics&backgroundRadio=0",
        ),
      )
      .setBody(
        `「 LYRIC SEARCH 」\n` +
          `Query › ${text}\n\n` +
          `▸ Select a track to retrieve its lyrics.`,
      )
      .setFooter("LRCLIB · Lyrics Database")
      .addSelection("Select Track")
      .makeSection("Source › LRCLIB");

    res.slice(0, 10).forEach((r) => {
      btn.makeRow(
        r.artistName || "Unknown Artist",
        r.name || "Unknown Title",
        "",
        `.lyrics ${r.id}`,
      );
    });

    return btn.send(m.chat, { quoted: m });
  },
};
