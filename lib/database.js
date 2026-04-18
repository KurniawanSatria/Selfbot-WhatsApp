const fs = require("fs");
const path = require("path");

const dbPath = path.join(__dirname, "..", "data", "allowed.json");

function createDefaultData() {
  return {
    allowedNumbers: [],
    allowedChats: [],
    settings: {
      autoAllowGroups: false,
      autoAllowContacts: false,
    },
    sessions: {},
  };
}

function cloneDefaultData() {
  return JSON.parse(JSON.stringify(createDefaultData()));
}

class Database {
  constructor() {
    this.db = null;
    this.initPromise = null;
  }

  async loadLowdb() {
    const { JSONFilePreset } = await import("lowdb/node");
    return JSONFilePreset;
  }

  normalizeNumber(number) {
    return String(number || "").replace(/[^0-9]/g, "");
  }

  ensureDataShape() {
    const defaults = createDefaultData();

    this.db.data ||= cloneDefaultData();
    this.db.data.allowedNumbers = Array.isArray(this.db.data.allowedNumbers)
      ? this.db.data.allowedNumbers
      : [];
    this.db.data.allowedChats = Array.isArray(this.db.data.allowedChats)
      ? this.db.data.allowedChats
      : [];
    this.db.data.settings = {
      ...defaults.settings,
      ...(this.db.data.settings || {}),
    };
    this.db.data.sessions = this.db.data.sessions || {};
  }

  getStoreChatEntries(store) {
    const chats = store?.chats;
    if (!chats) return [];

    if (typeof chats.entries === "function") {
      return Array.from(chats.entries());
    }

    if (Array.isArray(chats)) {
      return chats;
    }

    if (typeof chats === "object") {
      return Object.entries(chats);
    }

    return [];
  }

  getChatName(chat) {
    if (!chat || typeof chat !== "object") return "";
    return chat.name || chat.subject || chat.pushName || chat.notify || "";
  }

  async init() {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });

      const JSONFilePreset = await this.loadLowdb();
      this.db = await JSONFilePreset(dbPath, cloneDefaultData());
      this.ensureDataShape();
      await this.db.write();
      return this.db;
    })();

    try {
      return await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  async write() {
    await this.init();
    this.ensureDataShape();
    await this.db.write();
  }

  async addAllowedNumber(number) {
    await this.init();

    const normalized = this.normalizeNumber(number);
    if (!normalized) return this.db.data.allowedNumbers;

    if (!this.db.data.allowedNumbers.includes(normalized)) {
      this.db.data.allowedNumbers.push(normalized);
      await this.write();
    }

    return this.db.data.allowedNumbers;
  }

  async removeAllowedNumber(number) {
    await this.init();

    const normalized = this.normalizeNumber(number);
    this.db.data.allowedNumbers = this.db.data.allowedNumbers.filter(
      (item) => item !== normalized
    );
    await this.write();

    return this.db.data.allowedNumbers;
  }

  async getAllowedNumbers() {
    await this.init();
    return this.db.data.allowedNumbers;
  }

  async isNumberAllowed(number) {
    await this.init();
    const normalized = this.normalizeNumber(number);
    return this.db.data.allowedNumbers.includes(normalized);
  }

  async addAllowedChat(chatId, chatName = "", chatType = "individual", enabled = true) {
    await this.init();

    const existing = this.db.data.allowedChats.find((chat) => chat.chatId === chatId);
    if (existing) {
      if (chatName && existing.chatName !== chatName) existing.chatName = chatName;
      if (chatType && existing.chatType !== chatType) existing.chatType = chatType;
      if (typeof enabled === "boolean") existing.enabled = enabled;
      await this.write();
      return this.db.data.allowedChats;
    }

    this.db.data.allowedChats.push({
      chatId,
      chatName,
      chatType,
      enabled: Boolean(enabled),
      addedAt: new Date().toISOString(),
    });
    await this.write();

    return this.db.data.allowedChats;
  }

  async removeAllowedChat(chatId) {
    await this.init();

    this.db.data.allowedChats = this.db.data.allowedChats.filter(
      (chat) => chat.chatId !== chatId
    );
    await this.write();

    return this.db.data.allowedChats;
  }

  async toggleAllowedChat(chatId, enabled) {
    await this.init();

    const chat = this.db.data.allowedChats.find((item) => item.chatId === chatId);
    if (!chat) return null;

    chat.enabled = Boolean(enabled);
    await this.write();
    return chat;
  }

  async getAllowedChats() {
    await this.init();
    return this.db.data.allowedChats;
  }

  async getEnabledChats() {
    await this.init();
    return this.db.data.allowedChats.filter((chat) => chat.enabled);
  }

  async isChatAllowed(chatId) {
    await this.init();
    const chat = this.db.data.allowedChats.find((item) => item.chatId === chatId);
    return chat ? chat.enabled : false;
  }

  async updateSetting(key, value) {
    await this.init();
    this.db.data.settings[key] = value;
    await this.write();
    return this.db.data.settings;
  }

  async getSettings() {
    await this.init();
    return this.db.data.settings;
  }

  async loadAllChatsFromStore(store) {
    await this.init();

    const entries = this.getStoreChatEntries(store);
    if (!entries.length) return this.db.data.allowedChats;

    for (const [jid, chat] of entries) {
      if (!jid || !chat) continue;

      const chatType = jid.endsWith("@g.us") ? "group" : "individual";
      const chatName = this.getChatName(chat);
      const existing = this.db.data.allowedChats.find((item) => item.chatId === jid);

      if (existing) {
        if (chatName && existing.chatName !== chatName) existing.chatName = chatName;
        if (existing.chatType !== chatType) existing.chatType = chatType;
        continue;
      }

      this.db.data.allowedChats.push({
        chatId: jid,
        chatName,
        chatType,
        enabled: false,
        addedAt: new Date().toISOString(),
      });
    }

    await this.write();
    return this.db.data.allowedChats;
  }

  // Session Management
  async createSession(userId, botInstance) {
    await this.init();
    const sessionId = this.generateSessionId(userId);
    const now = new Date().toISOString();

    this.db.data.sessions[userId] = {
      sessionId,
      botInstance,
      createdAt: now,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      status: "ACTIVE",
    };

    await this.write();
    return sessionId;
  }

  async getActiveSession(userId) {
    await this.init();
    const session = this.db.data.sessions[userId];
    if (!session || session.status !== "ACTIVE" || new Date(session.expiresAt) < new Date()) {
      return null;
    }
    return session;
  }

  async updateSessionStatus(userId, status) {
    await this.init();
    const session = this.db.data.sessions[userId];
    if (session) {
      session.status = status;
      await this.write();
      return session;
    }
    return null;
  }

  async removeSession(userId) {
    await this.init();
    const session = this.db.data.sessions[userId];
    if (session) {
      delete this.db.data.sessions[userId];
      await this.write();
      return true;
    }
    return false;
  }

  async cleanupExpiredSessions() {
    await this.init();
    const now = new Date();
    let cleaned = 0;

    for (const [userId, session] of Object.entries(this.db.data.sessions)) {
      if (new Date(session.expiresAt) < now) {
        delete this.db.data.sessions[userId];
        cleaned++;
      }
    }

    if (cleaned > 0) {
      await this.write();
    }
    return cleaned;
  }

  generateSessionId(userId) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    return `session_${userId}_${timestamp}_${random}`;
  }
}

module.exports = new Database();
