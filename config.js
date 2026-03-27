const fs = require("fs");

// ─── CONFIG ──────────────────────────────────────────────────────────────────
module.exports = {
  PREFIX: "!",
  NUMBER: "6282170988479", 
  AUTH_DIR: "./session",
  TMP_DIR: "./tmp",
  THUMBNAIL: fs.readFileSync("./assets/thumb.jpg"), 
  CHANNEL: "120363406548905635@newsletter"
};