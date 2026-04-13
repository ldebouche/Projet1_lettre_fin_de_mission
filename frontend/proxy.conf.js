const appMode = (process.env.APP_MODE || 'dev').toLowerCase();
const defaultTarget = appMode === 'prod' ? 'https://outils-avenia.fr' : 'http://localhost:4000';
const target = process.env.API_PROXY_TARGET || defaultTarget;

module.exports = {
  '/api': {
    target,
    secure: false,
    changeOrigin: true,
    logLevel: 'debug'
  }
};
