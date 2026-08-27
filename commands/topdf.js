const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts } = require("pdf-lib");
const fontkit = require("fontkit");

const BOT_ROOT = path.join(__dirname, "..");
const FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";

module.exports = {
  name: "topdf",
  aliases: ["text2pdf", "pdf"],
  cooldown: 5000,
  description: "Convert text to PDF. Reply to text, or use '.topdf <text>'.",
  async run(sock, m, args, reply, chat) {
    let text = "";
    if (m.quotedBody && m.quotedBody.trim()) {
      text = m.quotedBody;
    } else if (args && args.length) {
      text = args.join(" ");
    }
    if (!text || !text.trim())
      return reply(
        "❌ Reply to a text message, or type:\n`.topdf <text to convert to PDF>`",
      );
    text = text.trim();
    try {
      const doc = await PDFDocument.create();
      doc.registerFontkit(fontkit);
      doc.setTitle("WhatsApp Text Export");
      doc.setProducer("Saturia Selfbot");
      let font;
      try {
        const fontBytes = fs.readFileSync(FONT_PATH);
        font = await doc.embedFont(fontBytes);
      } catch {
        font = await doc.embedFont(StandardFonts.Helvetica);
      }
      const pageSize = { w: 595.28, h: 841.89 };
      const margin = 50;
      const maxWidth = pageSize.w - margin * 2;
      const fontSize = 12;
      const lineHeight = fontSize * 1.5;
      const paragraphs = text.split(/\n+/);
      let page = doc.addPage([pageSize.w, pageSize.h]);
      let cursorY = pageSize.h - margin;
      const wrapLine = (line) => {
        const words = line.split(/\s+/);
        const lines = [];
        let current = "";
        for (const word of words) {
          const test = current ? current + " " + word : word;
          if (font.widthOfTextAtSize(test, fontSize) > maxWidth && current) {
            lines.push(current);
            current = word;
          } else {
            current = test;
          }
        }
        if (current) lines.push(current);
        return lines.length ? lines : [""];
      };

      for (const para of paragraphs) {
        const wrapped = wrapLine(para || "");
        for (const line of wrapped) {
          if (cursorY - lineHeight < margin) {
            page = doc.addPage([pageSize.w, pageSize.h]);
            cursorY = pageSize.h - margin;
          }
          page.drawText(line, {
            x: margin,
            y: cursorY,
            size: fontSize,
            font,
            color: { type: "RGB", red: 0.1, green: 0.1, blue: 0.1 },
          });
          cursorY -= lineHeight;
        }
        cursorY -= lineHeight * 0.5;
      }
      const pdfBytes = await doc.save();
      const outFile = path.join(BOT_ROOT, "tmp", `text-${Date.now()}.pdf`);
      fs.mkdirSync(path.join(BOT_ROOT, "tmp"), { recursive: true });
      fs.writeFileSync(outFile, pdfBytes);
      const sizeKB = (pdfBytes.length / 1024).toFixed(1);
      await sock.sendMessage(
        chat,
        {
          document: { url: outFile },
          fileName: path.basename(outFile),
          mimetype: "application/pdf",
          caption: "Here is your PDF",
        },
        { quoted: m },
      );
      fs.unlink(outFile, () => {});
    } catch (err) {
      console.error("topdf error:", err);
      reply("❌ Failed to create PDF: " + err.message);
    }
  },
};
