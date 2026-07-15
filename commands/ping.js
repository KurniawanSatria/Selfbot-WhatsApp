const os = require("os");
const { exec } = require("child_process");
const util = require("util");
const { FOOTER } = require("../config");
const execPromise = util.promisify(exec);
const { Button } = require("../lib/helper");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");




module.exports = {
  name: "ping",
  aliases: ["p", "test", "status", "info"],
  description: "Check bot's latency and system status",
  category: "utility",
  cooldown: 5000,

  async run(sock, m, args, reply, jid) {
    const chatJid = jid || m.key.remoteJid;
    try {
      const start = Date.now();
      const uptime = process.uptime();
      const memoryUsage = process.memoryUsage();
      const cpuInfo = os.cpus();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const days = Math.floor(uptime / 86400);
      const hours = Math.floor((uptime % 86400) / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = Math.floor(uptime % 60);
      const uptimeFormatted = `${days}⛅ ${hours}🌙 ${minutes}⏰`;
      const usedMem = totalMem - freeMem;
      const memoryUsagePercent = ((usedMem / totalMem) * 100).toFixed(2);
      let cpuUsage = "N/A";
      try {
        const { stdout } = await execPromise(`ps -p ${process.pid} -o %cpu`);
        cpuUsage = stdout.split("\n")[1].trim() + "%";
      } catch (error) {
        cpuUsage = `${cpuInfo.length}✨ cores @ ${(cpuInfo[0].speed / 1000).toFixed(1)}GHz`;
      }
      const latency = Date.now() - start;
      const statusMessage = `
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
`.trim();
      const thumbPath = path.join(process.cwd(), "assets", "thumb.png");
      let thumbBuffer = await sharp(fs.readFileSync(thumbPath))
        .resize(150, 150, { fit: "cover" })
        .jpeg({ quality: 80 })
        .toBuffer();

      await new Button(sock)
        .setDocument(thumbBuffer, {
          fileName: "Saturia Self Bot.",
          mimetype: "image/jpeg",
          jpegThumbnail: thumbBuffer,
        })
        .setBody("")
        .setFooter(statusMessage)
        .addButton()
        .addReply("\0", ".menu")
        .addCall("\0", "911")
        .addUrl("\0", "https://saturia.codes", true)
        .addCopy("\0", "Saturiaaa.")
        .send(m.chat, { quoted: m });
    } catch (error) {
      console.error("🌌 Cosmic error:", error);
      await reply("❌ *Cosmic disturbance detected!* Please try again.");
    }
  },
};
