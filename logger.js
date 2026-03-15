// logger.js — Lightweight logger for standalone usage
// When used inside OpenClaw, the app's logger.js is used instead

const COLORS = { reset: '\x1b[0m', cyan: '\x1b[36m', red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', magenta: '\x1b[35m', dim: '\x1b[2m' };

function ts() { return new Date().toLocaleTimeString('en-GB', { hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0'); }

module.exports = {
  info:  (cat, ...a) => console.log(`${COLORS.dim}${ts()}${COLORS.reset} ${COLORS.cyan}INFO${COLORS.reset} [${COLORS.green}${(cat||'').toUpperCase()}${COLORS.reset}]`, ...a),
  warn:  (cat, ...a) => console.warn(`${COLORS.dim}${ts()}${COLORS.reset} ${COLORS.yellow}WARN${COLORS.reset} [${COLORS.yellow}${(cat||'').toUpperCase()}${COLORS.reset}]`, ...a),
  error: (cat, ...a) => console.error(`${COLORS.dim}${ts()}${COLORS.reset} ${COLORS.red}ERR${COLORS.reset}  [${COLORS.red}${(cat||'').toUpperCase()}${COLORS.reset}]`, ...a),
  debug: (cat, ...a) => { if (process.env.DEBUG) console.log(`${COLORS.dim}${ts()} DBG  [${(cat||'').toUpperCase()}]${COLORS.reset}`, ...a); },
};
