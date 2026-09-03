const { defineConfig } = require("playwright/test");
module.exports = defineConfig({
  testDir: ".",
  use: { baseURL: "http://127.0.0.1:8901" },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        launchOptions: { executablePath: "/usr/bin/chromium" },
      },
    },
  ],
  webServer: {
    command: "python3 -m http.server 8901 --directory ..",
    port: 8901,
    reuseExistingServer: true,
  },
});
