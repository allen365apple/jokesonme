// 最後更新：2026-11-19 14:22
// 誰幫忙的：Claude Code（Claude Opus 5.5）
// 修改摘要：lint 略過從 jokes-on-me 複製進來的現場投票靜態檔（public/live-vote、public/love-improv）
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 建置產物與 Cloudflare 本機暫存
    ".open-next/**",
    ".wrangler/**",
    // 從 jokes-on-me 原樣複製的現場投票靜態檔（change live-vote-hosting），不套平台的 lint 規則
    "public/live-vote/**",
    "public/love-improv/**",
  ]),
]);

export default eslintConfig;
