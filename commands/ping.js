module.exports = {
  name: "ping",
  aliases: ["p", "test"],
  description: "Cek koneksi bot",
  cooldown:    5000,

  async run(sock, m, args, reply, jid) {
    const start = Date.now();
    const latency = Date.now() - start;
    await sock.sendMessage(jid, {
      text: `Ping: ${latency}ms`, title: '🏓 Pong', footer: 'Saturia.',
      interactiveButtons: [{
        name: 'galaxy_message', buttonParamsJson: JSON.stringify({
          mode: 'published', flow_message_version: '3', flow_token: '1:1307913409923914:293680f87029f5a13d1ec5e35e718af3', flow_id: '1307913409923914', flow_cta: 'Saturia.', flow_action: 'navigate', flow_action_payload: { screen: 'QUESTION_ONE', params: { user_id: '123456789', referral: 'campaign_xyz' } }, flow_metadata: { flow_json_version: '201', data_api_protocol: 'v2', flow_name: 'Lead Qualification [en]', data_api_version: 'v2', categories: ['Lead Generation', 'Sales'] }
        })
      }]
    }, { quoted: m })
    console.log(`Ping: ${latency}ms`);
  },
};