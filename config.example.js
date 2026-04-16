const fs = require("fs");

// ─── CONFIG ──────────────────────────────────────────────────────────────────
module.exports = {
  // Bot Settings
  PREFIX: "/", // Command prefix
  NUMBER: "", // Your Bot number
  AUTHORIZED_NUMBERS: [""], // List of authorized numbers
  FOOTER: '© Saturia.',
  // Directory Settings
  AUTH_DIR: "./session", // Directory to store authentication files
  TMP_DIR: "./tmp", // Directory for temporary files
  ASSETS_DIR: "./assets", // Directory for assets like thumbnails
  
  // Media Settings
  THUMBNAIL: fs.readFileSync("./assets/thumb.png"), // Default thumbnail for media messages
  CHANNEL: "", // Your channel ID for newsletter (e.g. "120363406548905635@newsletter")
  
  // Cooldown Settings (in milliseconds)
  COOLDOWN: {
    DEFAULT: 5000, // 5 seconds
    DOWNLOADER: 10000, // 10 seconds
    AI: 3000, // 3 seconds
    STICKER: 2000, // 2 seconds
  },
  
  // Feature Flags
  FEATURES: {
    AUTO_DOWNLOAD: true, // Automatically download media messages
    AUTO_READ: false, // Automatically mark messages as read
    ALWAYS_ONLINE: true, // Keep the bot always online
    TYPING_INDICATOR: true, // Show typing indicator when processing commands
  },
  
  // Logging
  LOG: {
    ENABLED: true,
    LEVEL: "debug", // debug, info, warn, error
    SAVE_TO_FILE: false, 
    LOG_FILE: "./logs/bot.log",
  }
};