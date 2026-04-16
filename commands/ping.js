const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const { FOOTER } = require("../config");
const execPromise = util.promisify(exec);

module.exports = {
  name: "ping",
  aliases: ["p", "test", "status", "info"],
  description: "Check bot's latency and system status",
  category: "utility",
  cooldown: 5000,

  async run(sock, m, args, reply, jid) {
    try {
      const start = Date.now();
      
      // Get system information
      const uptime = process.uptime();
      const memoryUsage = process.memoryUsage();
      const cpuInfo = os.cpus();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      
      // Format uptime
      const days = Math.floor(uptime / 86400);
      const hours = Math.floor((uptime % 86400) / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = Math.floor(uptime % 60);
      
      const uptimeFormatted = `${days}⛅ ${hours}🌙 ${minutes}⏰`;
      
      // Calculate memory usage
      const usedMem = totalMem - freeMem;
      const memoryUsagePercent = ((usedMem / totalMem) * 100).toFixed(2);
      
      // Get CPU usage (approximate)
      let cpuUsage = "N/A";
      try {
        const { stdout } = await execPromise('ps -p ${process.pid} -o %cpu');
        cpuUsage = stdout.split('\n')[1].trim() + '%';
      } catch (error) {
        // Fallback to static CPU info
        cpuUsage = `${cpuInfo.length}✨ cores @ ${(cpuInfo[0].speed / 1000).toFixed(1)}GHz`;
      }
      
      // Calculate latency
      const latency = Date.now() - start;
      
      // Create aesthetic status message
      const statusMessage = `
\`*・✦  S A T U R I A  ✦・*\`

┌────────────────────────
│  🏓 *P I N G*   ⇨  ${latency}ms
│  ⏳ *U P T I M E*  ⇨  ${uptimeFormatted}
└────────────────────────

🖥️  *S Y S T E M*
├・💫 CPU ⇨ ${cpuUsage}
├・🎯 RAM ⇨ ${(usedMem / 1024 / 1024 / 1024).toFixed(2)}GB / ${(totalMem / 1024 / 1024 / 1024).toFixed(2)}GB
├・📊 Usage ⇨ ${memoryUsagePercent}%
├・⚡ Node ⇨ ${process.version}
└・🌐 OS ⇨ ${os.platform()} ${os.arch()}

🤖 *B O T  S T A T S*
├・📨 Heap ⇨ ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB
├・🗄️ Total ⇨ ${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)}MB  
├・🔄 RSS ⇨ ${(memoryUsage.rss / 1024 / 1024).toFixed(2)}MB
└・🎭 Threads ⇨ ${cpuInfo.length}

🎮 *Q U I C K  M E N U*
├・❓ !help ⇨ Show commands
├・🚀 !speedtest ⇨ Test speed
├・🔄 !restart ⇨ Restart bot
└・🌟 !info ⇨ Bot information

      `.trim();

      // Send aesthetic status message
      await sock.sendMessage(jid, {
        text: statusMessage,
        footer: FOOTER,
        interactiveButtons: [{
          name: 'cosmic_refresh',
          buttonParamsJson: JSON.stringify({
            mode: 'published',
            flow_message_version: '3',
            flow_token: '1:1307913409923914:293680f87029f5a13d1ec5e35e718af3',
            flow_id: '1307913409923914',
            flow_cta: '🌠 Refresh Cosmic Status',
            flow_action: 'navigate',
            flow_action_payload: {
              screen: 'COSMIC_REFRESH',
              params: {
                timestamp: Date.now(),
                user_id: m.sender.split('@')[0],
                cosmic_energy: Math.random().toString(36).substr(2, 9)
              }
            },
            flow_metadata: {
              flow_json_version: '201',
              data_api_protocol: 'v2',
              flow_name: 'Cosmic Status Monitor',
              data_api_version: 'v2',
              categories: ['Cosmic', 'Monitoring', 'System']
            }
          })
        }]
      }, { quoted: m });

//
    } catch (error) {
      console.error('🌌 Cosmic error:', error);
      await reply('❌ *Cosmic disturbance detected!* Please try again.');
    }
  },
};
