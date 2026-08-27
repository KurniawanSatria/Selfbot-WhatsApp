const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");
const util = require("node:util");
const { downloadContentFromMessage } = require("baileys");
const APIKEY = process.env.APIKEY

// Project root (one level up from commands/)
const ROOT = path.resolve(__dirname, "..");

const SYSTEM_PROMPT = `You are Saturiaaa, a WhatsApp assistant with full access to the project's source code. Be direct and to the point — no filler, no small talk, no unnecessary preamble. Base answers on facts; if you don't know something or aren't sure, say so instead of guessing. Prioritize being useful over being agreeable — correct the user if they're wrong. Keep a professional tone: no excessive emojis, no forced enthusiasm, no personality theatrics.

You have tools to read and modify the project files:
- list_files: list files/folders inside a directory
- read_file: read the content of a file
- write_file: write (create or overwrite) a file

When the user asks you to fix, improve, or modify something in the project, use these tools to:
1. Read the relevant file(s) first to understand the current code.
2. Apply the fix by writing the updated content back.
3. Report what you changed, clearly and concisely.

After completing all tool calls, respond with a plain text summary of what was done. Do NOT wrap your final reply in JSON.`;

// ── Tool definitions for the OpenAI tools API ──────────────────────────────

const TOOLS = [
  {
    type: "function",
    function: {
      name: "list_files",
      description:
        "List files and folders inside a directory relative to the project root.",
      parameters: {
        type: "object",
        properties: {
          dir: {
            type: "string",
            description:
              "Directory path relative to project root. Use '.' for root.",
          },
        },
        required: ["dir"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read the full content of a file relative to the project root.",
      parameters: {
        type: "object",
        properties: {
          file: {
            type: "string",
            description:
              "File path relative to project root, e.g. 'commands/ai.js'.",
          },
        },
        required: ["file"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Create or overwrite a file relative to the project root with the given content.",
      parameters: {
        type: "object",
        properties: {
          file: {
            type: "string",
            description:
              "File path relative to project root, e.g. 'commands/ai.js'.",
          },
          content: {
            type: "string",
            description: "Full content to write to the file.",
          },
        },
        required: ["file", "content"],
      },
    },
  },
];

// ── Path safety guard ───────────────────────────────────────────────────────

function safePath(relPath) {
  const abs = path.resolve(ROOT, relPath);
  if (!abs.startsWith(ROOT + path.sep) && abs !== ROOT) {
    throw new Error(`Path traversal blocked: "${relPath}"`);
  }
  return abs;
}

// ── Tool executors ──────────────────────────────────────────────────────────

function toolListFiles(dir) {
  const abs = safePath(dir);
  const entries = fs.readdirSync(abs, { withFileTypes: true });
  return (
    entries
      .map((e) => (e.isDirectory() ? `[dir]  ${e.name}` : `[file] ${e.name}`))
      .join("\n") || "(empty directory)"
  );
}

function toolReadFile(file) {
  const abs = safePath(file);
  if (!fs.existsSync(abs)) throw new Error(`File not found: "${file}"`);
  return fs.readFileSync(abs, "utf8");
}

function toolWriteFile(file, content) {
  const abs = safePath(file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
  return `✓ Written: ${file}`;
}

function executeTool(name, args) {
  switch (name) {
    case "list_files":
      return toolListFiles(args.dir);
    case "read_file":
      return toolReadFile(args.file);
    case "write_file":
      return toolWriteFile(args.file, args.content);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Main agentic loop ───────────────────────────────────────────────────────

module.exports = {
  name: "ai",
  aliases: ["ask"],
  description: "AI-powered assistant with project file access",
  category: "ai",
  cooldown: 5000,

  async run(sock, m, args) {
    const prompt = args && args.length > 0 ? args.join(" ") : "";
    const directImage = m.message?.imageMessage;
    const quotedImage =
      m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
    const imageMessage = directImage || quotedImage;

    if (!prompt && !imageMessage)
      return m.reply("⌁ Enter a prompt to continue.");

    await sock.sendPresenceUpdate("composing", m.key.remoteJid);

    const client = new OpenAI({
      apiKey: APIKEY,
      baseURL: "https://9router.saturia.codes/v1",
    });

    try {
      // Build initial user content (supports vision)
      let userContent;
      if (imageMessage) {
        const stream = await downloadContentFromMessage(imageMessage, "image");
        let buffer = Buffer.from([]);
        for await (const chunk of stream)
          buffer = Buffer.concat([buffer, chunk]);
        const base64 = buffer.toString("base64");
        const mimeType = imageMessage.mimetype || "image/jpeg";
        userContent = [
          { type: "text", text: prompt || "Describe this image." },
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${base64}` },
          },
        ];
      } else {
        userContent = prompt;
      }

      const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ];

      // Agentic loop — keep going until the model stops calling tools
      const MAX_ITERATIONS = 10;
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        await sock.sendPresenceUpdate("composing", m.key.remoteJid);

        const res = await client.chat.completions.create({
          model: "Agent",
          messages,
          tools: TOOLS,
          tool_choice: "auto",
        });

        const choice = res.choices[0];
        messages.push(choice.message);

        // Model is done — send final reply
        if (
          choice.finish_reason === "stop" ||
          !choice.message.tool_calls?.length
        ) {
          const finalText = choice.message.content?.trim() || "Done.";
          await m.reply(finalText);
          return;
        }

        // Model wants to call tools
        const callNames = choice.message.tool_calls
          .map((c) => c.function.name)
          .join(", ");
        await m.reply(`⌁ Using: ${callNames}…`);

        for (const call of choice.message.tool_calls) {
          let result;
          try {
            const toolArgs = JSON.parse(call.function.arguments);
            result = executeTool(call.function.name, toolArgs);
          } catch (err) {
            result = `Error: ${err.message}`;
          }

          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: String(result),
          });
        }
      }

      // Exceeded max iterations
      await m.reply("⌁ Reached maximum tool iterations. Try a more specific request.");
    } catch (e) {
      console.error(util.format(e));
      await m.reply("╰─ Request failed unexpectedly.");
    }
  },
};
