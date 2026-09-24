// Public runtime config for the Mini App.
window.APP_CONFIG = {
  // Base URL of your bot's public API (see api.py in the deployment docs).
  // Leave empty if you don't expose the API and only use deep links.
  API_BASE: "https://YOUR_FPSMS_APP.fps.ms",

  // Bot username (no @) so we can build t.me deep links.
  BOT_USERNAME: "YourBotUsername",

  // Page size for the grid.
  PAGE_SIZE: 24
};