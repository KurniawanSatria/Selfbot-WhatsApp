// lib/serialize.js
const { getContentType, proto } = require("@innovatorssoft/baileys");
const { THUMBNAIL } = require("../config");

// ─── JID Helpers ──────────────────────────────────────────────────────────────
function cleanJid(conn, jid, altJid) {
    const target = altJid || jid;
    if (!target) return "";
    try {
        const cleaned = conn.getJid(target);
        return cleaned && !cleaned.includes("@lid") ? cleaned : "";
    } catch {
        return "";
    }
}

function sanitizeText(conn, text) {
    if (!text) return "";
    return text.replace(/\d+@lid/g, (match) => {
        try {
            const proper = conn.getJid(match);
            return proper && !proper.includes("@lid") ? proper : match;
        } catch {
            return match;
        }
    });
}

// ─── Extract body ─────────────────────────────────────────────────────────────
function getBody(msg) {
    if (!msg) return "";
    let interactiveId = "";
    try {
        const paramsJson = msg.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
        if (paramsJson) interactiveId = JSON.parse(paramsJson)?.id ?? "";
    } catch { }

    return (
        msg.conversation ||
        msg.extendedTextMessage?.text ||
        msg.imageMessage?.caption ||
        msg.videoMessage?.caption ||
        msg.buttonsResponseMessage?.selectedButtonId ||
        msg.listResponseMessage?.singleSelectReply?.selectedRowId ||
        interactiveId ||
        ""
    );
}

// ─── Serialize ────────────────────────────────────────────────────────────────
function serialize(sock, m) {
    if (!m || !sock) return m;

    const M = proto.WebMessageInfo;

    // Normalize via proto
    try { m = M.create(m); } catch { }

    if (!m.key) return m;

    // ── ID & flags ──────────────────────────────────────────────────────────────
    m.id = m.key.id;
    m.isBaileys = m.id?.startsWith("BAE5") && m.id.length === 16;
    m.fromMe = m.key.fromMe;
    m.pushName = m.pushName ?? "";

    // ── Chat (remoteJid, handle @lid) ───────────────────────────────────────────
    m.chat = m.key.remoteJid?.endsWith("@lid")
        ? (m.key.remoteJidAlt || m.key.remoteJid)
        : m.key.remoteJid;

    m.isGroup = m.chat?.endsWith("@g.us") ?? false;
    m.isPrivate = !m.isGroup;

    // ── Sender ──────────────────────────────────────────────────────────────────
    if (m.isGroup) {
        m.sender = m.key.participantAlt || m.key.participant || "";
        m.participant = m.sender;
    } else {
        m.sender = m.key.remoteJidAlt || m.key.remoteJid;
        m.participant = m.sender;
    }

    if (!m.message) return m;

    // ── Message type & content ──────────────────────────────────────────────────
    m.mtype = getContentType(m.message);
    m.msg = m.message[m.mtype];

    m.type = m.mtype;
    m.isImage = m.type === "imageMessage";
    m.isVideo = m.type === "videoMessage";
    m.isAudio = m.type === "audioMessage";
    m.isSticker = m.type === "stickerMessage";
    m.isDocument = m.type === "documentMessage";
    m.isText = m.type === "conversation" || m.type === "extendedTextMessage";

    // ── Body (semua tipe pesan) ─────────────────────────────────────────────────
    const rawBody = getBody(m.message) ||
        m.msg?.text || m.msg?.caption || m.msg?.contentText ||
        m.msg?.selectedDisplayText || m.msg?.title || "";
    m.body = sanitizeText(sock, rawBody);
    m.text = m.body; // alias

    // ── Mentions ────────────────────────────────────────────────────────────────
    m.mentionedJid = (m.msg?.contextInfo?.mentionedJid || [])
        .map((jid) => cleanJid(sock, jid))
        .filter((jid) => jid && !jid.includes("@lid"));

    // ── Fix status broadcast ────────────────────────────────────────────────────
    if (
        m.chat === "status@broadcast" &&
        ["protocolMessage", "senderKeyDistributionMessage"].includes(m.mtype)
    ) {
        const fixed = cleanJid(sock, m.key.remoteJid, m.key.remoteJidAlt);
        m.chat = fixed !== "status@broadcast" ? fixed : m.sender;
    }

    // ── Protocol message ────────────────────────────────────────────────────────
    if (m.mtype === "protocolMessage" && m.msg?.key) {
        const rjid = cleanJid(sock, m.msg.key.remoteJid, m.msg.key.remoteJidAlt);
        m.msg.key.remoteJid = rjid === "status@broadcast" ? m.chat : rjid;
        m.msg.key.participant = cleanJid(sock, m.msg.key.participant, m.msg.key.participantAlt) || "status_me";
        m.msg.key.fromMe = m.msg.key.participant === cleanJid(sock, sock.user?.id);
        if (!m.msg.key.fromMe && cleanJid(sock, m.msg.key.remoteJid) === cleanJid(sock, sock.user?.id)) {
            m.msg.key.remoteJid = m.sender;
        }
    }

    // ── Quoted message ──────────────────────────────────────────────────────────
    const rawQuoted = m.msg?.contextInfo?.quotedMessage ?? null;
    if (rawQuoted) {
        let qtype = Object.keys(rawQuoted)[0];
        let qmsg = rawQuoted[qtype];

        if (qtype === "productMessage") {
            qtype = Object.keys(qmsg)[0];
            qmsg = qmsg[qtype];
        }

        if (typeof qmsg === "string") qmsg = { text: qmsg };

        const quotedParticipant = cleanJid(sock,
            m.msg.contextInfo?.participant,
            m.msg.contextInfo?.participantAlt
        ) || m.sender;

        const quotedChat = cleanJid(sock,
            m.msg.contextInfo?.remoteJid,
            m.msg.contextInfo?.remoteJidAlt
        ) || m.chat;

        const rawQText = qmsg?.text || qmsg?.caption || qmsg?.conversation ||
            qmsg?.contentText || qmsg?.selectedDisplayText || qmsg?.title || "";

        const quotedFakeObj = M.fromObject({
            key: {
                remoteJid: quotedChat,
                fromMe: quotedParticipant === cleanJid(sock, sock.user?.id),
                id: m.msg.contextInfo?.stanzaId,
            },
            message: rawQuoted,
            ...(m.isGroup ? { participant: quotedParticipant } : {}),
        });

        m.quoted = {
            ...qmsg,
            mtype: qtype,
            id: m.msg.contextInfo?.stanzaId,
            chat: quotedChat,
            sender: quotedParticipant,
            fromMe: quotedParticipant === cleanJid(sock, sock.user?.id),
            isBaileys: m.msg.contextInfo?.stanzaId?.startsWith("BAE5") && m.msg.contextInfo?.stanzaId?.length === 16,
            text: sanitizeText(sock, rawQText),
            body: sanitizeText(sock, rawQText), // alias
            mentionedJid: (m.msg.contextInfo?.mentionedJid || [])
                .map((jid) => cleanJid(sock, jid))
                .filter((jid) => jid && !jid.includes("@lid")),
            fakeObj: quotedFakeObj,
            delete: () => sock.sendMessage(quotedChat, { delete: quotedFakeObj.key }),
            download: () => sock.downloadMediaMessage(qmsg),
            copyNForward: (jid, force = false, opts = {}) =>
                sock.copyNForward(jid, quotedFakeObj, force, opts),
        };
    } else {
        m.quoted = null;
    }

    m.isQuoted = !!m.quoted;
    m.quotedBody = m.quoted?.body ?? "";
    m.quotedType = m.quoted?.mtype ?? "";

    // ── Download media ──────────────────────────────────────────────────────────
    if (m.msg?.url) {
        m.download = () => sock.downloadMediaMessage(m.msg);
    }

    // ── Reply helpers ───────────────────────────────────────────────────────────
    m.reply = (text, options = {}) =>
        sock.sendMessage(
            m.chat,
            {
                text,
                contextInfo: {
                    externalAdReply: {
                        title: "Saturia",
                        body: "Saturia.",
                        previewType: "PHOTO",
                        mediaType: 1,
                        thumbnail: THUMBNAIL,
                    },
                },
                ...options,
            },
            { quoted: m }
        );

    m.react = (emoji) => sock.sendMessage(m.chat, { react: { text: emoji, key: m.key } });
    m.delete = () => sock.sendMessage(m.chat, { delete: m.key });
    m.copy = () => serialize(sock, M.fromObject(M.toObject(m)));
    m.copyNForward = (jid = m.chat, force = false, opts = {}) =>
        sock.copyNForward(jid, m, force, opts);

    return m;
}

module.exports = { serialize };