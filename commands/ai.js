const fs = require("fs");
const path = require("path");
const { exec } = require("node:child_process");
const { promisify } = require("node:util");
const OpenAI = require("openai");
const util = require("node:util");
const { downloadContentFromMessage } = require("baileys");
const APIKEY = process.env.APIKEY;
const execAsync = promisify(exec);
const https = require("https");
const http = require("http");

// Project root (one level up from commands/)
const ROOT = path.resolve(__dirname, "..");

const SYSTEM_PROMPT = `You are Saturiaaa, a WhatsApp assistant with full access to the project's source code. Be direct and to the point — no filler, no small talk, no unnecessary preamble. Base answers on facts; if you don't know something or aren't sure, say so instead of guessing. Prioritize being useful over being agreeable — correct the user if they're wrong. Keep a professional tone: no excessive emojis, no forced enthusiasm, no personality theatrics.

You have tools to read, modify, analyze, and execute in the project:
- list_files: list files/folders inside a directory
- read_file: read the content of a file
- write_file: write (create or overwrite) a file
- delete_file: delete a file or directory
- rename_file: rename or move a file
- get_file_info: get file size, modified date, and type
- search_in_files: search for text/regex across files (like grep)
- find_function: find where a function is defined in the project
- syntax_check: validate JavaScript syntax without execution
- get_dependencies: read package.json and list dependencies
- summarize_file: generate a concise summary of a file's purpose
- explain_error: parse error messages and suggest fixes
- http_request: make HTTP GET/POST requests to external APIs
- execute_command: run shell commands (npm, git, node, etc.)

When the user asks you to fix, improve, or modify something:
1. Read/search files to understand the current state
2. Check syntax if modifying code
3. Apply changes by writing files
4. Execute commands if needed (tests, installs, etc.)
5. Report what changed, clearly and concisely

After completing all tool calls, respond with a plain text summary. Do NOT wrap your final reply in JSON.`;

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
  {
    type: "function",
    function: {
      name: "execute_command",
      description:
        "Execute a shell command in the project root directory. Returns stdout and stderr.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description:
              "Shell command to execute, e.g. 'npm install axios', 'git status', 'node --version'.",
          },
        },
        required: ["command"],
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
          path: {
            type: "string",
            description: "Path to file/directory to delete, e.g. 'tmp/cache.json'.",
          },
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
          oldPath: {
            type: "string",
            description: "Current file path, e.g. 'commands/old.js'.",
          },
          newPath: {
            type: "string",
            description: "New file path, e.g. 'commands/new.js'.",
          },
        },
        required: ["oldPath", "newPath"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_file_info",
      description: "Get metadata about a file (size, modified date, type).",
      parameters: {
        type: "object",
        properties: {
          file: {
            type: "string",
            description: "File path relative to project root.",
          },
        },
        required: ["file"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_in_files",
      description: "Search for text/regex pattern across files in the project (like grep).",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Text or regex pattern to search for.",
          },
          includePattern: {
            type: "string",
            description: "Glob pattern for files to include, e.g. '**/*.js'. Default: all files.",
          },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_function",
      description: "Find where a function is defined in the project by name.",
      parameters: {
        type: "object",
        properties: {
          functionName: {
            type: "string",
            description: "Name of the function to find, e.g. 'toolExecuteCommand'.",
          },
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
          file: {
            type: "string",
            description: "JS file path to check, e.g. 'commands/ai.js'.",
          },
        },
        required: ["file"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_dependencies",
      description: "Read package.json and list all dependencies and devDependencies.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "summarize_file",
      description: "Generate a concise summary of what a file does (for large files).",
      parameters: {
        type: "object",
        properties: {
          file: {
            type: "string",
            description: "File path to summarize.",
          },
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
          error: {
            type: "string",
            description: "Full error message or stack trace.",
          },
        },
        required: ["error"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "http_request",
      description: "Make HTTP GET or POST request to an external API.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "Full URL to request.",
          },
          method: {
            type: "string",
            description: "HTTP method: GET or POST. Default: GET.",
          },
          body: {
            type: "string",
            description: "JSON string body for POST requests.",
          },
        },
        required: ["url"],
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

async function toolExecuteCommand(command) {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: ROOT,
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });
    let output = "";
    if (stdout) output += `stdout:\n${stdout.trim()}\n`;
    if (stderr) output += `stderr:\n${stderr.trim()}`;
    return output.trim() || "✓ Command executed successfully (no output)";
  } catch (err) {
    return `Error: ${err.message}\nstdout: ${err.stdout || ""}\nstderr: ${err.stderr || ""}`;
  }
}

function toolDeleteFile(filePath) {
  const abs = safePath(filePath);
  if (!fs.existsSync(abs)) throw new Error(`Path not found: "${filePath}"`);
  const stat = fs.statSync(abs);
  if (stat.isDirectory()) {
    fs.rmSync(abs, { recursive: true, force: true });
    return `✓ Deleted directory: ${filePath}`;
  } else {
    fs.unlinkSync(abs);
    return `✓ Deleted file: ${filePath}`;
  }
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
  if (!fs.existsSync(abs)) throw new Error(`File not found: "${file}"`);
  const stat = fs.statSync(abs);
  return JSON.stringify({
    path: file,
    size: `${(stat.size / 1024).toFixed(2)} KB`,
    modified: stat.mtime.toISOString(),
    type: stat.isDirectory() ? "directory" : "file",
  }, null, 2);
}

async function toolSearchInFiles(pattern, includePattern = "**/*.js") {
  try {
    // Use ripgrep if available, fallback to findstr on Windows
    const isWindows = process.platform === "win32";
    let cmd;
    if (isWindows) {
      cmd = `findstr /s /i /n "${pattern}" ${includePattern.replace("**", "*")}`;
    } else {
      cmd = `grep -rn "${pattern}" --include="${includePattern}" .`;
    }
    const { stdout } = await execAsync(cmd, { cwd: ROOT, maxBuffer: 2 * 1024 * 1024 });
    return stdout.trim() || `No matches found for: "${pattern}"`;
  } catch (err) {
    if (err.code === 1) return `No matches found for: "${pattern}"`;
    return `Error searching: ${err.message}`;
  }
}

async function toolFindFunction(functionName) {
  try {
    const pattern = `(function\\s+${functionName}|const\\s+${functionName}\\s*=|${functionName}\\s*:\\s*function|${functionName}\\s*\\()`;
    const result = await toolSearchInFiles(pattern, "**/*.js");
    return result;
  } catch (err) {
    return `Error: ${err.message}`;
  }
}

async function toolSyntaxCheck(file) {
  const abs = safePath(file);
  if (!fs.existsSync(abs)) throw new Error(`File not found: "${file}"`);
  try {
    await execAsync(`node --check "${abs}"`, { cwd: ROOT });
    return `✓ Syntax valid: ${file}`;
  } catch (err) {
    return `✗ Syntax error in ${file}:\n${err.stderr || err.message}`;
  }
}

function toolGetDependencies() {
  const pkgPath = path.join(ROOT, "package.json");
  if (!fs.existsSync(pkgPath)) throw new Error("package.json not found");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  return JSON.stringify({
    dependencies: pkg.dependencies || {},
    devDependencies: pkg.devDependencies || {},
  }, null, 2);
}

function toolSummarizeFile(file) {
  const abs = safePath(file);
  if (!fs.existsSync(abs)) throw new Error(`File not found: "${file}"`);
  const content = fs.readFileSync(abs, "utf8");
  const lines = content.split("\n");
  const functions = [];
  const exports = [];
  
  lines.forEach((line, i) => {
    if (/(?:function|const|let|var)\s+\w+/.test(line)) {
      functions.push(`Line ${i + 1}: ${line.trim().substring(0, 60)}`);
    }
    if (/module\.exports|export/.test(line)) {
      exports.push(`Line ${i + 1}: ${line.trim().substring(0, 60)}`);
    }
  });
  
  return `File: ${file}\nLines: ${lines.length}\nFunctions/vars: ${functions.length}\nExports: ${exports.length}\n\nKey functions:\n${functions.slice(0, 5).join("\n")}\n\nExports:\n${exports.slice(0, 3).join("\n")}`;
}

function toolExplainError(error) {
  const suggestions = [];
  
  if (/cannot find module/i.test(error)) {
    suggestions.push("Missing dependency. Run: npm install <module-name>");
  }
  if (/unexpected token/i.test(error)) {
    suggestions.push("Syntax error. Check for missing brackets, quotes, or semicolons.");
  }
  if (/is not defined/i.test(error)) {
    suggestions.push("Variable not declared. Check if it's imported or defined.");
  }
  if (/permission denied|eacces/i.test(error)) {
    suggestions.push("Permission error. Try running with elevated privileges or check file permissions.");
  }
  if (/port.*already in use/i.test(error)) {
    suggestions.push("Port conflict. Stop the other process or use a different port.");
  }
  if (/timeout|etimedout/i.test(error)) {
    suggestions.push("Network timeout. Check internet connection or increase timeout value.");
  }
  
  return `Error Analysis:\n${error.substring(0, 500)}\n\nSuggestions:\n${suggestions.length ? suggestions.join("\n") : "No specific fix identified. Check stack trace for more details."}`;
}

async function toolHttpRequest(url, method = "GET", body = null) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const options = {
      method,
      headers: method === "POST" ? { "Content-Type": "application/json" } : {},
    };
    
    const req = lib.request(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        resolve(`Status: ${res.statusCode}\n\n${data.substring(0, 2000)}`);
      });
    });
    
    req.on("error", (err) => resolve(`Request failed: ${err.message}`));
    if (body && method === "POST") req.write(body);
    req.end();
  });
}

function executeTool(name, args) {
  switch (name) {
    case "list_files":
      return toolListFiles(args.dir);
    case "read_file":
      return toolReadFile(args.file);
    case "write_file":
      return toolWriteFile(args.file, args.content);
    case "delete_file":
      return toolDeleteFile(args.path);
    case "rename_file":
      return toolRenameFile(args.oldPath, args.newPath);
    case "get_file_info":
      return toolGetFileInfo(args.file);
    case "search_in_files":
      return toolSearchInFiles(args.pattern, args.includePattern);
    case "find_function":
      return toolFindFunction(args.functionName);
    case "syntax_check":
      return toolSyntaxCheck(args.file);
    case "get_dependencies":
      return toolGetDependencies();
    case "summarize_file":
      return toolSummarizeFile(args.file);
    case "explain_error":
      return toolExplainError(args.error);
    case "http_request":
      return toolHttpRequest(args.url, args.method, args.body);
    case "execute_command":
      return toolExecuteCommand(args.command);
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
            // Async tools
            const asyncTools = ["execute_command", "search_in_files", "find_function", "syntax_check", "http_request"];
            if (asyncTools.includes(call.function.name)) {
              result = await executeTool(call.function.name, toolArgs);
            } else {
              result = executeTool(call.function.name, toolArgs);
            }
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
