const config = require('./config');

// The subject forbids any log line in the console. These print only when
// DEBUG=1 is in .env, so we can still see errors while developing.
function info(...args) { if (config.debug) console.log(...args); }
function warn(...args) { if (config.debug) console.warn(...args); }
function error(...args) { if (config.debug) console.error(...args); }

module.exports = { info, warn, error };
