const { PREFIX } = require("../config");
const path = require("path");
const fs = require("fs");
const { sendAudio, getBuffer } = require("../lib/helper");

module.exports = {
  name: "help",
  aliases: ["menu", "?"],
  description: "Tampilkan daftar command",
  cooldown:    5000,

  async run(sock, m, args, reply) {
    const jid = m.key.remoteJid; // ← dari m, bukan parameter
    const cmdDir = path.join(__dirname);

    const lines = fs
      .readdirSync(cmdDir)
      .filter((f) => f.endsWith(".js"))
      .map((f) => {
        const mod = require(path.join(cmdDir, f));
        const aliases = mod.aliases?.length ? ` (${mod.aliases.join(", ")})` : "";
        return `- ${PREFIX}${mod.name.padEnd(8)}${aliases} — ${mod.description || ""}`;
      })
      .join("\n");

    await sock.sendMessage(jid, {
      product: {
        productImage: {
          url: 'https://i.pinimg.com/736x/8d/96/81/8d9681919aeb93322479c0b44cc6249e.jpg'
        },
        productId: '836xxx',
        title: 'Saturia.',
        description: lines,
        currencyCode: 'IDR',
        priceAmount1000: 12121212,
        retailerId: 'innovatorssoftn',
        url: 'https://example.com',
        productImageCount: 1
      },
      businessOwnerJid: '6282170988479@s.whatsapp.net',
      caption: lines,
      title: "",
      footer: "Saturia.",
      interactiveButtons: [
        {
          name: 'cta_copy',
          buttonParamsJson: JSON.stringify({
            display_text: '🥀',
            copy_code: 'Saturia.'
          })
        },
        {
          name: 'open_webview',
          buttonParamsJson: JSON.stringify({
            title: 'Do not click me',
            link: {
              in_app_webview: true, // or false
              url: 'https://kurniawansatria.github.io/Links'
            }
          })
        },
        {
          name: 'galaxy_message',
          buttonParamsJson: JSON.stringify({
            mode: 'published',
            flow_message_version: '3',
            flow_token: '1:1307913409923914:293680f87029f5a13d1ec5e35e718af3',
            flow_id: '1307913409923914',
            flow_cta: 'Saturia.',
            flow_action: 'navigate',
            flow_action_payload: {"screens":[{"data":{},"id":"RECOMMEND","layout":{"children":[{"children":[{"type":"TextSubheading","text":"Would you recommend us to a friend?"},{"type":"RadioButtonsGroup","label":"Choose one","name":"Choose_one","data-source":[{"id":"0_Yes","title":"Yes"},{"id":"1_No","title":"No"}],"required":true},{"label":"Continue","on-click-action":{"name":"complete","payload":{"screen_0_Choose_0":"${form.Choose_one}"}},"type":"Footer"}],"name":"flow_path","type":"Form"}],"type":"SingleColumnLayout"},"terminal":true,"title":"Saturia."}],"version":"7.3"},
            flow_metadata: {
              flow_json_version: '201',
              data_api_protocol: 'v2',
              flow_name: 'Lead Qualification [en]',
              data_api_version: 'v2',
              categories: ['Lead Generation', 'Sales']
            }
          })
        },
      ],
      hasMediaAttachment: false,
      viewOnce: true
    }, { quoted: m });

    const num = Math.floor(Math.random() * 43) + 1;
    const url = `https://raw.githubusercontent.com/KurniawanSatria/audio/main/galau/audio_0${num}.mp3`;

    await sock.sendAudio(jid, await getBuffer(url),{ptt:true});
  },
};