const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
    js.configs.recommended,
    {
        // 1. Node.js 환경 (백엔드 및 설정 파일)
        files: ["src/**/*.js", "master.js", "server.js", "eslint.config.js", "test/**/*.js"],
        languageOptions: {
            ecmaVersion: 2021,
            sourceType: "commonjs",
            globals: {
                ...globals.node,
                ...globals.commonjs
            }
        }
    },
    {
        // 2. 브라우저 환경 (프론트엔드)
        files: ["public/**/*.js"],
        ignores: ["public/assets/**"],
        languageOptions: {
            ecmaVersion: 2021,
            sourceType: "module",
            globals: {
                ...globals.browser,
                io: "readonly",
                Terminal: "readonly",
                FitAddon: "readonly",
                WebLinksAddon: "readonly",
                marked: "readonly",
                hljs: "readonly",
                mermaid: "readonly",
                socketClient: "readonly",
                fileManager: "readonly",
                tmuxManager: "readonly",
                ViewerFactory: "readonly",
                atob: "readonly",
                TextDecoder: "readonly",
                Uint8Array: "readonly",
                crypto: "readonly"
            }
        }
    },
    {
        // 3. 글로벌 룰 및 무시 설정
        rules: {
            "no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
            "no-console": "off",
            "no-empty": "warn",
            "no-undef": "error"
        }
    },
    {
        ignores: ["node_modules/**", "dist/**", "public/assets/**"]
    }
];
