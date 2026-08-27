const os = require("os");
const { exec } = require("child_process");
const util = require("util");
const { Button } = require("../lib/helper");

const execPromise = util.promisify(exec);

module.exports = {
  name: "ping",
  aliases: ["p", "test", "status", "info"],
  description: "Check bot latency and system status",
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

      const uptimeFormatted = `${days}d ${hours}h ${minutes}m`;

      const usedMem = totalMem - freeMem;
      const memoryUsagePercent = ((usedMem / totalMem) * 100).toFixed(2);

      let cpuUsage = "N/A";

      try {
        const { stdout } = await execPromise(`ps -p ${process.pid} -o %cpu`);

        cpuUsage = stdout.split("\n")[1].trim() + "%";
      } catch (error) {
        cpuUsage = `${cpuInfo.length} cores @ ${(cpuInfo[0].speed / 1000).toFixed(1)}GHz`;
      }

      const latency = Date.now() - start;

      const statusMessage = `
「 SYSTEM STATUS 」

├ CPU      › ${cpuUsage}
├ RAM      › ${(usedMem / 1024 / 1024 / 1024).toFixed(2)}GB / ${(totalMem / 1024 / 1024 / 1024).toFixed(2)}GB
├ Usage    › ${memoryUsagePercent}%
├ Node     › ${process.version}
├ OS       › ${os.platform()} ${os.arch()}
├ Uptime   › ${uptimeFormatted}
╰ Latency  › ${latency}ms

「 BOT RUNTIME 」

├ Heap     › ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB
├ Total    › ${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)}MB
├ RSS      › ${(memoryUsage.rss / 1024 / 1024).toFixed(2)}MB
╰ Threads  › ${cpuInfo.length}
`.trim();

      await new Button(sock)
        .setBody("")
        .setFooter(statusMessage)
        .addButton()
        .addReply("\0", "")
        .addCall("\0", "911")
        .addUrl("\0", "https://saturia.codes", true)
        .send(m.chat, { quoted: m });
    } catch (error) {
      console.error("System status error:", error);
      await reply("╰─ System status check failed. Please try again.");
    }
  },
};
