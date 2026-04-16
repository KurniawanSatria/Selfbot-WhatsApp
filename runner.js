'use strict';

const { spawn } = require('child_process');
const { join } = require('path');
const chalk = require('chalk');
const moment = require('moment-timezone');

// ─── Logger ───────────────────────────────────────────────────────────────────
const timestamp = () => chalk.dim(`[${moment.tz('Asia/Jakarta').format('HH:mm')}]`);

const log = {
  info:    (...a) => console.log(timestamp(), chalk.cyan('◆'),    ...a),
  success: (...a) => console.log(timestamp(), chalk.green('✔'),   ...a),
  warn:    (...a) => console.log(timestamp(), chalk.yellow('⚠'),  ...a),
  error:   (...a) => console.log(timestamp(), chalk.red('✖'),     ...a),
  cmd:     (...a) => console.log(timestamp(), chalk.magenta('►'), ...a),
  reload:  (...a) => console.log(timestamp(), chalk.blue('↻'),    ...a),
};

// ─── Process Error Handlers ───────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  log.error('Unhandled Rejection:', reason instanceof Error ? reason.message : reason);
});

process.on('uncaughtException', (error) => {
  log.error('Uncaught Exception:', error.message);
});

// ─── Nodemon Spawner ──────────────────────────────────────────────────────────
let nodemonProc = null;
let isRunning = false;

function spawnNodemon(file) {
  if (isRunning) return;
  isRunning = true;

  const filePath = join(__dirname, file);
  console.clear();

  log.info(`Spawning nodemon for ${chalk.cyan(file)}...`);

  const args = [
    require.resolve('nodemon/bin/nodemon.js'), // Path to nodemon CLI
    '--config', 'nodemon.json', // Use your config
    filePath
  ];

  nodemonProc = spawn('node', args, { 
    stdio: 'inherit', // Pipe stdout/stderr to parent
    detached: true 
  });

  nodemonProc.on('close', (code) => {
    isRunning = false;
    if (code !== 0) {
      log.warn(`Nodemon exited with code ${code}. Restarting...`);
      setTimeout(() => spawnNodemon(file), 1000);
    } else {
      log.success('Nodemon exited cleanly.');
    }
  });

  nodemonProc.on('error', (err) => {
    isRunning = false;
    log.error('Failed to spawn nodemon:', err.message);
  });

  return nodemonProc;
}

// Create nodemon.json first (or ensure it exists)
const nodemonConfig = `{
  "watch": ["."],
  "ext": "js",
  "ignore": ["session/**","node_modules/**"],
  "delay": 500,
  "exec": "node index.js"
}`;

require('fs').writeFileSync('nodemon.json', nodemonConfig, 'utf8');

spawnNodemon('index.js');
