const { DisconnectReason } = require("@innovatorssoft/baileys");
const { Boom } = require("@hapi/boom");
const { NUMBER } = require("../config");
const { sleep } = require("../lib/helper");

module.exports = {
    register(sock, { saveCreds, restartFn }) {
        sock.ev.on("creds.update", saveCreds);

        sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
            if (connection === "connecting" && !sock.authState?.creds?.registered) {
                try {
                    await sleep(3000);
                    const phoneNumber = NUMBER.replace(/[^0-9]/g, "");
                    const code = await sock.requestPairingCode(phoneNumber);
                    const chalk = require("chalk");
                    console.log("\n" + chalk.bgMagenta.bold(` 📲 PAIRING CODE: ${code} `) + "\n");
                } catch {
                    // QR mode
                }
            }

            if (connection === "open") {
                global.startTime = Date.now();
                global.log?.success("Connected to WhatsApp!");
            }

            if (connection === "close") {
                const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
                if (code !== DisconnectReason.loggedOut) {
                    global.log?.warn(`Disconnected (code ${code}), reconnecting...`);
                    restartFn();
                } else {
                    global.log?.error("Logged out.");
                }
            }
        });
    },
};