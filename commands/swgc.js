const { generateMessageID } = require("baileys");

function injectGroupStatusContextInfo(rawMsg, audienceType) {
  const traverseAndSet = (node) => {
    if (!node) return;

    const supportedTypes = [
      "extendedTextMessage",
      "conversation",
      "imageMessage",
      "videoMessage",
      "audioMessage",
      "documentMessage"
    ];

    for (const type of supportedTypes) {
      const target = node[type];
      if (target && typeof target === "object") {
        if (!target.contextInfo) target.contextInfo = {};
        target.contextInfo.isGroupStatus = true;
        target.contextInfo.forwardingScore = 0;
        target.contextInfo.statusAttributions = audienceType ? [] : [{ type: 4 }];
        target.contextInfo.featureEligibilities = {
          cannotBeRanked: false,
          canBeReshared: true,
          canReceiveMultiReact: true
        };
        target.contextInfo.statusSourceType = 4;
        target.contextInfo.statusAudienceMetadata = { audienceType };
        if (type === "extendedTextMessage" || type === "conversation") {
          target.textArgb = 4294967295;
          target.backgroundArgb = 4286484643;
          target.font = 0;
          target.previewType = 0;
        }
        break;
      }
    }
  };

  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    traverseAndSet(node);
    for (const key of Object.keys(node)) {
      const val = node[key];
      if (val && typeof val === "object") {
        if (val.message) walk(val.message);
        if (Array.isArray(val)) val.forEach(walk);
      }
    }
  };

  walk(rawMsg);
}

function wrapGroupStatus(content) {
  let wrapped = { groupStatusMessageV2: { message: content } };
  for (let i = 0; i < 5; i++) {
    wrapped = { groupStatusMessageV2: { message: wrapped } };
  }
  return wrapped;
}

module.exports = {
  name: "swgc",
  aliases: ["statusgc", "upgc", "storygc"],
  category: "owner",
  cooldown: 3000,
  owner: true,
  description: "Kirim status grup (story ke grup)",
  async run(sock, m, args, reply, chat) {
    const text = args.join(" ").trim();
    let quotedRaw = m.quoted?.fakeObj?.message || m.quoted?.msg || m.raw?.message;
    if (!quotedRaw && !text) return reply("Reply media dengan .swgc <caption>\natau ketik .swgc <text>");
    let content = quotedRaw || { extendedTextMessage: { text, contextInfo: {}, textArgb: 4294967295, backgroundArgb: 4286484643, font: 0, previewType: 0 } };
    if (text && quotedRaw) {
      if (content.extendedTextMessage) content.extendedTextMessage.text = text;
      if (content.imageMessage) content.imageMessage.caption = text;
      if (content.videoMessage) content.videoMessage.caption = text;
      if (content.conversation) content.conversation = text;
    }
    injectGroupStatusContextInfo(content, 1);
    const wrapped = wrapGroupStatus(content);
    try {
      await sock.relayMessage("120363140569875100@g.us", wrapped, { messageId: generateMessageID() });
      await m.react("✅");
      reply("✅ Group status sent!");
    } catch (error) {
      console.error("[SWGC ERROR]", error.message);
      reply("❌ Failed: " + error.message);
    }
  },
};