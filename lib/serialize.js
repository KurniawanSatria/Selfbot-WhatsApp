const { getContentType, proto } = require("baileys");
const { THUMBNAIL } = require("../config");

function cleanJid(conn, jid, altJid) {
    return altJid || jid || "";
}

function getBody(msg) {
    if (!msg) return "";
    let iid = "";
    try { const pj = msg.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson; if (pj) iid = JSON.parse(pj)?.id ?? ""; } catch { }
    return msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption || msg.videoMessage?.caption ||
        msg.buttonsResponseMessage?.selectedButtonId || msg.templateButtonReplyMessage?.selectedId ||
        msg.listResponseMessage?.singleSelectReply?.selectedRowId || iid || "";
}

function serialize(sock, m) {
    if (!m || !sock) return m;
    const M = proto.WebMessageInfo;
    try { m = M.create(m); } catch { }
    if (!m.key) return m;

    m.id = m.key.id;
    m.isBaileys = m.id?.startsWith("BAE5") && m.id.length === 16;
    m.fromMe = m.key.fromMe;
    m.pushName = m.pushName ?? "";
    m.chat = cleanJid(sock, m.key.remoteJid, m.key.remoteJidAlt);
    m.isGroup = m.chat?.endsWith("@g.us") ?? false;
    m.isPrivate = !m.isGroup;
    m.sender = m.isGroup ? cleanJid(sock, m.key.participant, m.key.participantAlt) : cleanJid(sock, m.key.remoteJid, m.key.remoteJidAlt);
    m.participant = m.sender;

    if (!m.message) return m;

    m.mtype = getContentType(m.message);
    m.msg = m.message[m.mtype];
    m.type = m.mtype;
    m.body = getBody(m.message) || m.msg?.text || m.msg?.caption || m.msg?.contentText || m.msg?.selectedDisplayText || m.msg?.title || "";
    m.text = m.body;
    m.mentionedJid = m.msg?.contextInfo?.mentionedJid || [];

    if (m.chat === "status@broadcast" && ["protocolMessage", "senderKeyDistributionMessage"].includes(m.mtype)) {
        const fixed = cleanJid(sock, m.key.remoteJid, m.key.remoteJidAlt);
        m.chat = fixed !== "status@broadcast" ? fixed : m.sender;
    }

    if (m.mtype === "protocolMessage" && m.msg?.key) {
        const rjid = cleanJid(sock, m.msg.key.remoteJid, m.msg.key.remoteJidAlt);
        m.msg.key.remoteJid = rjid === "status@broadcast" ? m.chat : rjid;
        m.msg.key.participant = cleanJid(sock, m.msg.key.participant, m.msg.key.participantAlt) || "status_me";
        m.msg.key.fromMe = m.msg.key.participant === sock.user?.id;
        if (!m.msg.key.fromMe && m.msg.key.remoteJid === sock.user?.id) m.msg.key.remoteJid = m.sender;
    }

    const rawQuoted = m.msg?.contextInfo?.quotedMessage ?? null;
    if (rawQuoted) {
        let qtype = Object.keys(rawQuoted)[0];
        let qmsg = rawQuoted[qtype];
        if (qtype === "productMessage") { qtype = Object.keys(qmsg)[0]; qmsg = qmsg[qtype]; }
        if (typeof qmsg === "string") qmsg = { text: qmsg };
        const qParticipant = cleanJid(sock, m.msg.contextInfo?.participant, m.msg.contextInfo?.participantAlt) || m.sender;
        const qChat = cleanJid(sock, m.msg.contextInfo?.remoteJid, m.msg.contextInfo?.remoteJidAlt) || m.chat;
        const rawQText = qmsg?.text || qmsg?.caption || qmsg?.conversation || qmsg?.contentText || qmsg?.selectedDisplayText || qmsg?.title || "";
        const qFakeObj = M.fromObject({ key: { remoteJid: qChat, fromMe: qParticipant === sock.user?.id, id: m.msg.contextInfo?.stanzaId }, message: rawQuoted, ...(m.isGroup ? { participant: qParticipant } : {}) });
        m.quoted = {
            ...qmsg, mtype: qtype, id: m.msg.contextInfo?.stanzaId, chat: qChat, sender: qParticipant,
            fromMe: qParticipant === sock.user?.id,
            isBaileys: m.msg.contextInfo?.stanzaId?.startsWith("BAE5") && m.msg.contextInfo?.stanzaId?.length === 16,
            text: rawQText, body: rawQText,
            mentionedJid: m.msg.contextInfo?.mentionedJid || [],
            fakeObj: qFakeObj,
            delete: () => sock.sendMessage(qChat, { delete: qFakeObj.key }),
            download: () => sock.downloadMediaMessage(qmsg),
            copyNForward: (jid, force = false, opts = {}) => sock.copyNForward(jid, qFakeObj, force, opts),
        };
    } else m.quoted = null;

    m.isQuoted = !!m.quoted;
    m.quotedBody = m.quoted?.body ?? "";
    m.quotedType = m.quoted?.mtype ?? "";
    if (m.msg?.url) m.download = () => sock.downloadMediaMessage(m.msg);
    m.reply = (text, options = {}) => sock.sendMessage(m.chat, { text, secureMetaServiceLabel: true, ...options }, { quoted: m });
    m.react = (emoji) => sock.sendMessage(m.chat, { react: { text: emoji, key: m.key } });
    m.delete = () => sock.sendMessage(m.chat, { delete: m.key });
    m.copy = () => serialize(sock, M.fromObject(M.toObject(m)));
    m.copyNForward = (jid = m.chat, force = false, opts = {}) => sock.copyNForward(jid, m, force, opts);
    return m;
}

module.exports = { serialize };