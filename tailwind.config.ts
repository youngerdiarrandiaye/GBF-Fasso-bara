import type { Config } from "tailwindcss";

// Fragment de thème produit par l'agent designer-ui-ux — source de vérité
// unique pour la palette/tokens, ne jamais dupliquer ni modifier localement.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const gfbTokens = require("./design-system/tailwind.tokens.js");

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: gfbTokens,
  },
  plugins: [],
};

export default config;
