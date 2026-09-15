module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      2,
      "always",
      [
        "DOZO-App",
        "dozo-app",
        "app",
        "DOZO-Server",
        "dozo-server",
        "server",
        "DOZO-Dashboard",
        "dozo-dashboard",
        "dashboard",
        "root",
      ],
    ],
    "scope-empty": [2, "never"],
    "header-max-length": [2, "always", 72],
    "body-leading-blank": [2, "always"],
    "footer-leading-blank": [2, "always"],
    "subject-case": [0],
  },
};
