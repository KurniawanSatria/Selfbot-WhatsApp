const FISH_APIKEY = process.env.FISH_APIKEY;

const VOICES = {
  default: {
    id: "685eef8b26ba4567bfadbf63af5463de",
    aliases: ["default"],
  },
  super_smash_bros: {
    id: "20092b51be1043a8ad91a674315aca98",
    aliases: ["smash", "super-smash", "super_smash_bros"],
  },
  prabowo: {
    id: "b8d594e696694b499aa12e32d0c1b618",
    aliases: ["prabowo"],
  },
  jokowi: {
    id: "c0c83f00b8f34f1b9bc2e644c3cf90be",
    aliases: ["jokowi"],
  },
};

const VOICE_ALIASES = Object.entries(VOICES).reduce((map, [name, voice]) => {
  for (const alias of voice.aliases) {
    map[alias.toLowerCase()] = name;
  }

  return map;
}, {});

module.exports = {
  name: "tts",
  aliases: ["say", "speak"],
  description: "Convert text to speech",
  category: "ai",
  cooldown: 5000,

  async run(sock, m, args, reply) {
    if (!args.length) {
      return reply(
        "Usage:\n" +
          ".tts <text>\n" +
          ".tts <voice> <text>\n\n" +
          "Voices: " +
          Object.keys(VOICES).join(", "),
      );
    }

    let voice = "default";
    let text = args.join(" ");

    const requestedVoice = args[0]?.toLowerCase();
    const matchedVoice = VOICE_ALIASES[requestedVoice];

    if (matchedVoice) {
      voice = matchedVoice;
      text = args.slice(1).join(" ");
    }

    if (!text.trim()) {
      return reply("Text-nya mana, wok 😹");
    }

    try {
      const response = await fetch("https://api.fish.audio/v1/tts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FISH_APIKEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          reference_id: VOICES[voice].id,
          format: "opus",
          model: "s2.1-pro-free",
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }

      const audio = Buffer.from(await response.arrayBuffer());

      await sock.sendMessage(
        m.chat,
        {
          audio,
          mimetype: "audio/ogg; codecs=opus",
          ptt: true,
        },
        {
          quoted: m,
        },
      );
    } catch (error) {
      console.error("TTS Error:", error);
      await reply(`❌ TTS gagal: ${error.message}`);
    }
  },
};
