/**
 * Minimal In-Memory Store polyfill
 * Replaces makeInMemoryStore from baileys (removed in @neoxr/baileys v8+)
 */
class InMemoryStore {
  constructor() {
    this.chats = {};
    this.contacts = {};
    this.messages = {};
    this.messagesByJid = {};
  }

  /**
   * Bind to connection events to auto-populate store
   */
  bind(ev) {
    ev.on("chats.upsert", (chats) => {
      for (const chat of chats) {
        const jid = chat.id;
        this.chats[jid] = { ...(this.chats[jid] || {}), ...chat };
      }
    });

    ev.on("contacts.upsert", (contacts) => {
      for (const contact of contacts) {
        this.contacts[contact.id] = {
          ...(this.contacts[contact.id] || {}),
          ...contact,
        };
      }
    });

    ev.on("messages.upsert", ({ messages }) => {
      for (const msg of messages) {
        const jid = msg.key.remoteJid;
        if (!jid) continue;
        if (!this.messagesByJid[jid]) this.messagesByJid[jid] = {};
        this.messagesByJid[jid][msg.key.id] = msg;
        this.messages[msg.key.id] = msg;
      }
    });

    ev.on("chats.update", (chats) => {
      for (const chat of chats) {
        const jid = chat.id;
        if (this.chats[jid]) {
          Object.assign(this.chats[jid], chat);
        }
      }
    });

    ev.on("contacts.update", (contacts) => {
      for (const contact of contacts) {
        const id = contact.id;
        if (this.contacts[id]) {
          Object.assign(this.contacts[id], contact);
        }
      }
    });
  }

  /**
   * Load a message by JID and message ID
   */
  loadMessage(jid, id) {
    if (jid) {
      return this.messagesByJid[jid]?.[id] || null;
    }
    return this.messages[id] || null;
  }
}

/**
 * Create a new in-memory store instance
 * @param {object} options
 * @returns {InMemoryStore}
 */
function makeInMemoryStore(options = {}) {
  return new InMemoryStore();
}

const exported = { makeInMemoryStore, InMemoryStore };
module.exports = exported;
module.exports.default = exported;
