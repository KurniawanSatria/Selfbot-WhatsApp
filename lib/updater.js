const { exec } = require("node:child_process");
const { promisify } = require("node:util");
const https = require("https");
const fs = require("fs");
const path = require("path");

const execAsync = promisify(exec);

const REPO_ROOT = path.join(__dirname, "..");

function getLocalVersion() {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
    );
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": "selfbot-wa-updater",
          Accept: "application/vnd.github+json",
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`GitHub API status ${res.statusCode}`));
        }
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(15000, () => req.destroy(new Error("request timeout")));
  });
}

function compareVersions(a, b) {
  const pa = String(a)
    .replace(/^v/, "")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  const pb = String(b)
    .replace(/^v/, "")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

async function getLatestVersion(repo) {
  try {
    const data = await fetchJson(
      `https://api.github.com/repos/${repo}/releases/latest`,
    );
    if (data && data.tag_name) return data.tag_name.replace(/^v/, "");
  } catch (e) {
    global.log?.info(
      `Auto-update: tidak ada rilis GitHub (${e.message}) — pakai cek commit`,
    );
  }
  try {
    const data = await fetchJson(
      `https://api.github.com/repos/${repo}/commits?per_page=1`,
    );
    if (Array.isArray(data) && data[0] && data[0].sha) {
      return `commit:${data[0].sha.slice(0, 7)}`;
    }
  } catch (e) {
    global.log?.warn(`Auto-update: gagal cek commit (${e.message})`);
  }
  return null;
}

async function checkUpdate(cfg) {
  const local = getLocalVersion();
  const latest = await getLatestVersion(cfg.REPO);
  if (!latest) return { hasUpdate: false, local, latest: local };
  if (latest.startsWith("commit:")) {
    try {
      const { stdout: head } = await execAsync("git rev-parse HEAD", {
        cwd: REPO_ROOT,
      });
      const localShort = head.trim().slice(0, 7);
      const remoteShort = latest.split(":")[1];
      return {
        hasUpdate: localShort !== remoteShort,
        local,
        latest,
        isCommit: true,
      };
    } catch {
      return { hasUpdate: false, local, latest };
    }
  }
  return { hasUpdate: compareVersions(latest, local) > 0, local, latest };
}

async function pullUpdate(branch) {
  try {
    const { stdout } = await execAsync(
      `git pull origin ${branch} --ff-only`,
      { cwd: REPO_ROOT },
    );
    return /Already up to date/i.test(stdout) ? false : true;
  } catch (e) {
    global.log?.error(`Auto-update: git pull gagal (${e.message})`);
    return false;
  }
}

function restart() {
  if (typeof process.send === "function") {
    process.send("reset");
  } else {
    process.exit(0);
  }
}

async function runUpdate(cfg) {
  if (!cfg || !cfg.ENABLED) return false;
  const result = await checkUpdate(cfg);
  if (!result.hasUpdate) {
    global.log?.info(`Auto-update: sudah versi terbaru (v${result.local})`);
    return false;
  }
  global.log?.warn(
    `Auto-update: versi baru tersedia (${result.latest}) — memperbarui...`,
  );
  const pulled = await pullUpdate(cfg.BRANCH || "main");
  if (pulled) {
    global.log?.success("Auto-update: perubahan di-pull, memulai ulang...");
    setTimeout(restart, 1000);
  }
  return pulled;
}

module.exports = { checkUpdate, runUpdate, getLocalVersion, compareVersions };
