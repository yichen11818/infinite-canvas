import type { ModelChannel } from "@/stores/use-config-store";

export const LOCAL_TEXT_MODEL = "xiaok-gpt::gpt-6.1-sol";

// Model IDs are the provider catalogue; all four channels use its OpenAI-compatible endpoint.
const presets = [
    {
        "id": "xiaok-claude",
        "name": "小K · Claude",
        "envKey": "VITE_XIAOK_CLAUDE_API_KEY",
        "models": [
            "claude-opus-4-6",
            "claude-opus-4-7",
            "claude-opus-4-8",
            "claude-opus-5",
            "claude-opus-5-5",
            "claude-sonnet-4-6",
            "claude-sonnet-5",
            "claude-sonnet-5-5"
        ]
    },
    {
        "id": "xiaok-gemini",
        "name": "小K · Gemini",
        "envKey": "VITE_XIAOK_GEMINI_API_KEY",
        "models": [
            "gemini-3.8-flash",
            "gemini-3.8-flash-high",
            "gemini-4-argon",
            "gemini-4-argon-high"
        ]
    },
    {
        "id": "xiaok-general",
        "name": "小K · 综合文字",
        "envKey": "VITE_XIAOK_GENERAL_API_KEY",
        "models": [
            "deepseek-v4.1-flash",
            "glm-5.3",
            "glm-5.3-flash",
            "glm-5.3-flashx",
            "hy3",
            "hy4-preview",
            "kimi-k3",
            "kimi-k3.1-pro",
            "mimo-v2.6-flash",
            "mimo-v2.6-pro",
            "qwen3.8-flash",
            "qwen3.8-max"
        ]
    },
    {
        "id": "xiaok-gpt",
        "name": "小K · GPT",
        "envKey": "VITE_XIAOK_GPT_API_KEY",
        "models": [
            "gpt-5.6-sol",
            "gpt-6-astra",
            "gpt-6-sol",
            "gpt-6.1-sol"
        ]
    }
] as const;

export function createLocalModelChannels(env: Readonly<Record<string, unknown>>): ModelChannel[] {
    return presets.map(({ id, name, envKey, models }) => ({
        id, name, baseUrl: "https://xiaok.lol", apiFormat: "openai",
        apiKey: typeof env[envKey] === "string" ? env[envKey].trim() : "",
        models: models.map((name) => ({ name, capability: "text" })),
    }));
}
