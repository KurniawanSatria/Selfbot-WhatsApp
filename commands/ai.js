const fs = require("fs");
const path = require("path");
const { exec } = require("node:child_process");
const { promisify } = require("node:util");
const OpenAI = require("openai");
const util = require("node:util");
const https = require("https");
const http = require("http");
const { downloadContentFromMessage } = require("baileys");
const { Button } = require("../lib/helper");

const APIKEY = process.env.APIKEY;
const execAsync = promisify(exec);
const ROOT = path.resolve(__dirname, "..");

// ── System prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Saturiaaa, a WhatsApp assistant with full access to the project's source code. Be direct and to the point — no filler, no small talk. Base answers on facts. Correct the user if they're wrong. No excessive emojis or forced enthusiasm.

Available tools:
- list_files: list files/folders in a directory
- read_file: read file content
- write_file: create or overwrite a file
- delete_file: delete a file or directory
- rename_file: rename or move a file
- get_file_info: get file metadata (size, date, type)
- search_in_files: search text/regex across files
- find_function: find where a function is defined
- syntax_check: validate JS syntax without running
- get_dependencies: list dependencies from package.json
- summarize_file: summarize what a file does
- explain_error: parse error and suggest fixes
- http_request: make HTTP GET/POST requests
- execute_command: run shell commands (npm, git, node, etc.)
- send_response: send a custom formatted reply (text, button, react, image, video, document, sticker, image_button)

Workflow for code changes:
1. Read relevant files first
2. Apply changes via write_file
3. Run syntax_check after writing
4. Use execute_command if installs or tests needed
5. Use send_response for your final reply — choose the format that fits best

Always use send_response as the last step. Never end with plain text.`;

// ── Tool definitions ────────────────────────────────────────────────────────

const TOOLS = [
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List files and folders inside a directory relative to the project root.",
      parameters: {
        type: "object",
        properties: {
          dir: { type: "string", description: "Directory path relative to project root. Use '.' for root." },
        },
        required: ["dir"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the full content of a file relative to the project root.",
      parameters: {
        type: "object",
        properties: {
          file: { type: "string", description: "File path relative to project root, e.g. 'commands/ai.js'." },
        },
        required: ["file"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create or overwrite a file relative to the project root.",
      parameters: {
        type: "object",
        properties: {
          file: { type: "string", description: "File path relative to project root." },
          content: { type: "string", description: "Full content to write." },
        },
        required: ["file", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description: "Delete a file or directory relative to project root.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to delete, e.g. 'tmp/cache.json'." },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rename_file",
      description: "Rename or move a file relative to project root.",
      parameters: {
        type: "object",
        properties: {
          oldPath: { type: "string", description: "Current file path." },
          newPath: { type: "string", description: "New file path." },
        },
        required: ["oldPath", "newPath"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_file_info",
      description: "Get metadata about a file: size, modified date, type.",
      parameters: {
        type: "object",
        properties: {
          file: { type: "string", description: "File path relative to project root." },
        },
        required: ["file"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_in_files",
      description: "Search for a text or regex pattern across project files.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Text or regex to search for." },
          includePattern: { type: "string", description: "Glob pattern for files, e.g. '**/*.js'." },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_function",
      description: "Find where a function is defined across the project.",
      parameters: {
        type: "object",
        properties: {
          functionName: { type: "string", description: "Function name to find." },
        },
        required: ["functionName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "syntax_check",
      description: "Validate JavaScript syntax of a file without executing it.",
      parameters: {
        type: "object",
        properties: {
          file: { type: "string", description: "JS file path to check." },
        },
        required: ["file"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_dependencies",
      description: "Read package.json and list all dependencies.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "summarize_file",
      description: "Generate a concise summary of what a file does.",
      parameters: {
        type: "object",
        properties: {
          file: { type: "string", description: "File path to summarize." },
        },
        required: ["file"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "explain_error",
      description: "Parse an error message and suggest potential fixes.",
      parameters: {
        type: "object",
        properties: {
          error: { type: "string", description: "Full error message or stack trace." },
        },
        required: ["error"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "http_request",
      description: "Make an HTTP GET or POST request to an external URL.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Full URL to request." },
          method: { type: "string", description: "HTTP method: GET or POST. Default: GET." },
          body: { type: "string", description: "JSON string body for POST requests." },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_command",
      description: "Execute a shell command in the project root. Returns stdout and stderr.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Command to run, e.g. 'npm install axios'." },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_response",
      description: "Send the final response to the user. Always use this as the last step — never end with plain text. Choose the format that best fits the reply.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["text", "button", "react", "image", "video", "document", "sticker", "image_button"],
            description: "Response type: 'text', 'button', 'react', 'image', 'video', 'document', 'sticker', or 'image_button' (image with buttons below).",
          },
          text: { type: "string", description: "Message text/caption. Required for 'text', 'button', 'image', 'video', 'document', 'image_button'." },
          footer: { type: "string", description: "Footer text for 'button' or 'image_button'." },
          buttons: {
            type: "array",
            description: "Buttons for 'button' or 'image_button'. Each: { label: string, id: string }",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                id: { type: "string" },
              },
            },
          },
          emoji: { type: "string", description: "Emoji for 'react' type, e.g. '✓', '❌'." },
          url: { type: "string", description: "URL for 'image', 'video', 'document', 'sticker', or 'image_button'. Can be http URL or file path." },
          filename: { type: "string", description: "Filename for 'document' type, e.g. 'report.pdf'." },
          mimetype: { type: "string", description: "MIME type for 'document', e.g. 'application/pdf'." },
        },
        required: ["type"],
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

// ── Status messages ─────────────────────────────────────────────────────────

function getStatusMessage(name, args) {
  switch (name) {
    case "list_files":       return `⌁ Listing files in ${args.dir || "project root"}…`;
    case "read_file":        return `⌁ Reading ${args.file}…`;
    case "write_file":       return `⌁ Writing ${args.file}…`;
    case "delete_file":      return `⌁ Deleting ${args.path}…`;
    case "rename_file":      return `⌁ Renaming ${args.oldPath} to ${args.newPath}…`;
    case "get_file_info":    return `⌁ Getting info for ${args.file}…`;
    case "search_in_files":  return `⌁ Searching files for "${args.pattern}"…`;
    case "find_function":    return `⌁ Finding function ${args.functionName}…`;
    case "syntax_check":     return `⌁ Checking syntax of ${args.file}…`;
    case "get_dependencies": return `⌁ Checking project dependencies…`;
    case "summarize_file":   return `⌁ Summarizing ${args.file}…`;
    case "explain_error":    return `⌁ Analyzing error…`;
    case "execute_command":  return `⌁ Running ${args.command}…`;
    case "http_request": {
      const method = args.method || "GET";
      const domain = args.url.match(/https?:\/\/([^/]+)/)?.[1] || args.url;
      return `⌁ ${method === "POST" ? "Posting to" : "Fetching"} ${domain}…`;
    }
    case "send_response":    return null; // silent — it IS the response
    default:                 return `⌁ Processing…`;
  }
}

// ── Tool implementations ────────────────────────────────────────────────────

function toolListFiles(dir) {
  const abs = safePath(dir);
  const entries = fs.readdirSync(abs, { withFileTypes: true });
  return entries.map(e => (e.isDirectory() ? `[dir]  ${e.name}` : `[file] ${e.name}`)).join("\n") || "(empty)";
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

function toolDeleteFile(filePath) {
  const abs = safePath(filePath);
  if (!fs.existsSync(abs)) throw new Error(`Not found: "${filePath}"`);
  fs.statSync(abs).isDirectory()
    ? fs.rmSync(abs, { recursive: true, force: true })
    : fs.unlinkSync(abs);
  return `✓ Deleted: ${filePath}`;
}

function toolRenameFile(oldPath, newPath) {
  const absOld = safePath(oldPath);
  const absNew = safePath(newPath);
  if (!fs.existsSync(absOld)) throw new Error(`Source not found: "${oldPath}"`);
  fs.mkdirSync(path.dirname(absNew), { recursive: true });
  fs.renameSync(absOld, absNew);
  return `✓ Renamed: ${oldPath} → ${newPath}`;
}

function toolGetFileInfo(file) {
  const abs = safePath(file);
  if (!fs.existsSync(abs)) throw new Error(`Not found: "${file}"`);
  const s = fs.statSync(abs);
  return JSON.stringify({ path: file, size: `${(s.size / 1024).toFixed(2)} KB`, modified: s.mtime.toISOString(), type: s.isDirectory() ? "directory" : "file" }, null, 2);
}

async function toolSearchInFiles(pattern, includePattern = "**/*.js") {
  try {
    const cmd = process.platform === "win32"
      ? `findstr /s /i /n "${pattern}" ${includePattern.replace("**", "*")}`
      : `grep -rn "${pattern}" --include="${includePattern}" .`;
    const { stdout } = await execAsync(cmd, { cwd: ROOT, maxBuffer: 2 * 1024 * 1024 });
    return stdout.trim() || `No matches for: "${pattern}"`;
  } catch (err) {
    return err.code === 1 ? `No matches for: "${pattern}"` : `Error: ${err.message}`;
  }
}

async function toolFindFunction(functionName) {
  const pattern = `(function\\s+${functionName}|const\\s+${functionName}\\s*=|${functionName}\\s*:\\s*function|${functionName}\\s*\\()`;
  return toolSearchInFiles(pattern, "**/*.js");
}

async function toolSyntaxCheck(file) {
  const abs = safePath(file);
  if (!fs.existsSync(abs)) throw new Error(`Not found: "${file}"`);
  try {
    await execAsync(`node --check "${abs}"`, { cwd: ROOT });
    return `✓ Syntax valid: ${file}`;
  } catch (err) {
    return `✗ Syntax error in ${file}:\n${err.stderr || err.message}`;
  }
}

function toolGetDependencies() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  return JSON.stringify({ dependencies: pkg.dependencies || {}, devDependencies: pkg.devDependencies || {} }, null, 2);
}

function toolSummarizeFile(file) {
  const abs = safePath(file);
  if (!fs.existsSync(abs)) throw new Error(`Not found: "${file}"`);
  const lines = fs.readFileSync(abs, "utf8").split("\n");
  const fns = [], exps = [];
  lines.forEach((l, i) => {
    if (/(?:async\s+)?function\s+\w+|const\s+\w+\s*=\s*(?:async\s+)?\(/.test(l)) fns.push(`L${i + 1}: ${l.trim().slice(0, 70)}`);
    if (/module\.exports|^export/.test(l)) exps.push(`L${i + 1}: ${l.trim().slice(0, 70)}`);
  });
  return `${file} — ${lines.length} lines\n\nFunctions (${fns.length}):\n${fns.slice(0, 8).join("\n")}\n\nExports (${exps.length}):\n${exps.slice(0, 4).join("\n")}`;
}

function toolExplainError(error) {
  const fixes = [];
  if (/cannot find module/i.test(error))       fixes.push("Missing module → npm install <name>");
  if (/unexpected token/i.test(error))          fixes.push("Syntax error → check brackets/quotes/semicolons");
  if (/is not defined/i.test(error))            fixes.push("Undeclared variable → check imports/declarations");
  if (/permission denied|eacces/i.test(error))  fixes.push("Permission error → check file permissions");
  if (/port.*in use/i.test(error))              fixes.push("Port conflict → stop other process or change port");
  if (/timeout|etimedout/i.test(error))         fixes.push("Timeout → check connection or increase timeout");
  return `Error:\n${error.slice(0, 500)}\n\nSuggestions:\n${fixes.length ? fixes.join("\n") : "No specific fix — check the stack trace."}`;
}

async function toolHttpRequest(url, method = "GET", body = null) {
  return new Promise((resolve) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.request(url, { method, headers: method === "POST" ? { "Content-Type": "application/json" } : {} }, (res) => {
      let data = "";
      res.on("data", c => (data += c));
      res.on("end", () => resolve(`Status: ${res.statusCode}\n\n${data.slice(0, 2000)}`));
    });
    req.on("error", err => resolve(`Request failed: ${err.message}`));
    if (body && method === "POST") req.write(body);
    req.end();
  });
}

async function toolExecuteCommand(command) {
  try {
    const { stdout, stderr } = await execAsync(command, { cwd: ROOT, timeout: 30000, maxBuffer: 1024 * 1024 });
    let out = "";
    if (stdout) out += `stdout:\n${stdout.trim()}\n`;
    if (stderr) out += `stderr:\n${stderr.trim()}`;
    return out.trim() || "✓ Done (no output)";
  } catch (err) {
    return `Error: ${err.message}\n${err.stdout || ""}${err.stderr || ""}`;
  }
}

async function toolSendResponse(sock, m, args) {
  const { type, text, footer, buttons, emoji, url, filename, mimetype } = args;

  try {
    // React only
    if (type === "react") {
      await m.react(emoji || "✓");
      return "✓ Reacted";
    }

    // Plain text button
    if (type === "button" && Array.isArray(buttons) && buttons.length > 0) {
      const btn = new Button(sock).setBody(text || "").setFooter(footer || "");
      for (const b of buttons) btn.addReply(b.label, b.id);
      await btn.send(m.chat, { quoted: m });
      return "✓ Sent button message";
    }

    // Image
    if (type === "image" && url) {
      await sock.sendMessage(m.chat, { image: { url }, caption: text || "" }, { quoted: m });
      return "✓ Sent image";
    }

    // Image with buttons
    if (type === "image_button" && url && Array.isArray(buttons) && buttons.length > 0) {
      const btn = new Button(sock).setBody(text || "").setFooter(footer || "").setImage(url);
      for (const b of buttons) btn.addReply(b.label, b.id);
      await btn.send(m.chat, { quoted: m });
      return "✓ Sent image with buttons";
    }

    // Video
    if (type === "video" && url) {
      await sock.sendMessage(m.chat, { video: { url }, caption: text || "" }, { quoted: m });
      return "✓ Sent video";
    }

    // Document
    if (type === "document" && url) {
      await sock.sendMessage(m.chat, {
        document: { url },
        fileName: filename || "document",
        mimetype: mimetype || "application/octet-stream",
        caption: text || "",
      }, { quoted: m });
      return "✓ Sent document";
    }

    // Sticker
    if (type === "sticker" && url) {
      await sock.sendMessage(m.chat, { sticker: { url } }, { quoted: m });
      return "✓ Sent sticker";
    }

    // Default: plain text
    await m.reply(text || "Done.");
    return "✓ Sent text";
  } catch (err) {
    return `Error sending response: ${err.message}`;
  }
}

// ── Tool dispatcher ─────────────────────────────────────────────────────────

async function executeTool(name, args, sock, m) {
  switch (name) {
    case "list_files":       return toolListFiles(args.dir);
    case "read_file":        return toolReadFile(args.file);
    case "write_file":       return toolWriteFile(args.file, args.content);
    case "delete_file":      return toolDeleteFile(args.path);
    case "rename_file":      return toolRenameFile(args.oldPath, args.newPath);
    case "get_file_info":    return toolGetFileInfo(args.file);
    case "search_in_files":  return toolSearchInFiles(args.pattern, args.includePattern);
    case "find_function":    return toolFindFunction(args.functionName);
    case "syntax_check":     return toolSyntaxCheck(args.file);
    case "get_dependencies": return toolGetDependencies();
    case "summarize_file":   return toolSummarizeFile(args.file);
    case "explain_error":    return toolExplainError(args.error);
    case "http_request":     return toolHttpRequest(args.url, args.method, args.body);
    case "execute_command":  return toolExecuteCommand(args.command);
    case "send_response":    return toolSendResponse(sock, m, args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Command entry point ─────────────────────────────────────────────────────

module.exports = {
  name: "ai",
  aliases: ["ask"],
  description: "AI-powered assistant with full project access",
  category: "ai",
  cooldown: 5000,

  async run(sock, m, args) {
    const prompt = args?.length > 0 ? args.join(" ") : "";
    const directImage = m.message?.imageMessage;
    const quotedImage = m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
    const imageMessage = directImage || quotedImage;

    if (!prompt && !imageMessage) return m.reply("⌁ Enter a prompt to continue.");

    await sock.sendPresenceUpdate("composing", m.key.remoteJid);

    const client = new OpenAI({ apiKey: APIKEY, baseURL: "https://9router.saturia.codes/v1" });

    try {
      let userContent;
      if (imageMessage) {
        const stream = await downloadContentFromMessage(imageMessage, "image");
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
        const base64 = buffer.toString("base64");
        const mimeType = imageMessage.mimetype || "image/jpeg";
        userContent = [
          { type: "text", text: prompt || "Describe this image." },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
        ];
      } else {
        userContent = prompt;
      }

      const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ];

      const MAX_ITERATIONS = 20;
      let finalSent = false;

      for (let i = 0; i < MAX_ITERATIONS; i++) {
        await sock.sendPresenceUpdate("composing", m.key.remoteJid);

        const res = await client.chat.completions.create({
          model: "kr/claude-sonnet-4.5",
          messages,
          tools: TOOLS,
          tool_choice: "auto",
        });

        const choice = res.choices[0];
        messages.push(choice.message);

        // No more tool calls — fallback reply if AI forgot to use send_response
        if (choice.finish_reason === "stop" || !choice.message.tool_calls?.length) {
          if (!finalSent) await m.reply(choice.message.content?.trim() || "Done.");
          return;
        }

        for (const call of choice.message.tool_calls) {
          const toolArgs = JSON.parse(call.function.arguments);

          // Show status (skip for send_response — it speaks for itself)
          const status = getStatusMessage(call.function.name, toolArgs);
          if (status) await m.reply(status);

          let result;
          try {
            result = await executeTool(call.function.name, toolArgs, sock, m);
            if (call.function.name === "send_response") finalSent = true;
          } catch (err) {
            result = `Error: ${err.message}`;
          }

          messages.push({ role: "tool", tool_call_id: call.id, content: String(result) });
        }

        if (finalSent) return;
      }

      if (!finalSent) await m.reply("⌁ Reached max iterations.");
    } catch (e) {
      console.error(util.format(e));
      await m.reply("╰─ Request failed unexpectedly.");
    }
  },
};
