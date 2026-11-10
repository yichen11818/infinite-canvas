import { expect, test } from "bun:test";
import type { AiConfig } from "../src/stores/use-config-store";
import { describeConfig, isConfigWriteTool, removeConfigChannel, setConfigDefaultModel, upsertConfigChannel } from "../src/lib/agent/config-operations";
import { createLocalModelChannels } from "../src/constant/local-model-presets";

const config = {
    channels: [{ id: "original", name: "Original", baseUrl: "https://example.com", apiFormat: "openai", apiKey: "private-value", models: [{ name: "text-a", capability: "text", script: "private-script" }] }],
    models: ["original::text-a"], textModel: "original::text-a", imageModel: "", videoModel: "", audioModel: "",
} as AiConfig;
const input = { id: "new", name: "New", baseUrl: "https://xiaok.lol", apiFormat: "openai", apiKeyEnv: "VITE_TEST_KEY", models: [{ name: "text-b", capability: "text" }] };
const env = { VITE_TEST_KEY: "new-private-value" };
const addChannel = () => upsertConfigChannel({ config, input, env });

test("configuration output omits secrets and scripts, exposing readiness only", () => {
    const result = describeConfig(config);
    expect(result.channels[0].hasApiKey).toBe(true);
    expect(JSON.stringify(result)).not.toContain("private");
    expect(result.channels[0].models[0].value).toBe("original::text-a");
});

test("channel creation resolves an environment reference without mutating prior config", () => {
    const next = addChannel();
    expect(next.channels[1].apiKey).toBe(env.VITE_TEST_KEY);
    expect(next.models).toEqual(["original::text-a", "new::text-b"]);
    expect(config.channels).toHaveLength(1);
});

test("same-channel edits preserve credentials and model scripts", () => {
    const { apiKey, ...existing } = config.channels[0];
    const next = upsertConfigChannel({ config, input: { ...existing, name: "Renamed" }, env });
    expect(next.channels[0].apiKey).toBe(apiKey);
    expect(next.channels[0].models[0].script).toBe("private-script");
    expect(next.channels[0].name).toBe("Renamed");
});

test("moving a channel to another service cannot silently reuse its credential", () => {
    const { apiKey, ...existing } = config.channels[0];
    expect(() => upsertConfigChannel({ config, input: { ...existing, baseUrl: "https://other.example" }, env })).toThrow("更换服务地址");
});

test("missing environment variables and raw keys are rejected before applying", () => {
    expect(() => upsertConfigChannel({ config, input, env: {} })).toThrow("环境变量");
    expect(() => upsertConfigChannel({ config, input: { ...input, apiKey: "do-not-log" }, env })).toThrow("apiKeyEnv");
});

test("invalid URLs, capabilities, duplicate models and ambiguous IDs are rejected", () => {
    const invalid = [
        { baseUrl: "https://user:password@example.com" }, { baseUrl: "https://example.com?key=value" },
        { models: [{ name: "x", capability: "other" }] }, { models: [input.models[0], input.models[0]] }, { id: "bad::id" },
    ];
    for (const patch of invalid) expect(() => upsertConfigChannel({ config, input: { ...input, ...patch }, env })).toThrow();
});

test("default model requires a configured channel and matching capability", () => {
    expect(setConfigDefaultModel(addChannel(), { capability: "text", model: "new::text-b" }).textModel).toBe("new::text-b");
    expect(() => setConfigDefaultModel(config, { capability: "video", model: "original::text-a" })).toThrow();
    expect(() => setConfigDefaultModel(config, { capability: "text", model: "unknown::text-a" })).toThrow();
    const unready = { ...config, channels: [{ ...config.channels[0], apiKey: "" }] };
    expect(() => setConfigDefaultModel(unready, { capability: "text", model: "original::text-a" })).toThrow("密钥");
});

test("deletion preserves unavailable selections and prevents removing the last channel", () => {
    const next = removeConfigChannel(addChannel(), { id: "original" });
    expect(next.textModel).toBe("original::text-a");
    expect(next.models).toEqual(["new::text-b"]);
    expect(() => removeConfigChannel(config, { id: "original" })).toThrow("至少保留");
    expect(() => removeConfigChannel(config, { id: "missing" })).toThrow("不存在");
});

test("only configuration mutations enter the existing manual confirmation path", () => {
    expect(isConfigWriteTool("app_config_get")).toBe(false);
    for (const name of ["app_config_upsert_channel", "app_config_remove_channel", "app_config_set_default_model"]) expect(isConfigWriteTool(name)).toBe(true);
});

test("source presets contain 28 text models with four separate key bindings", () => {
    const keys = { VITE_XIAOK_CLAUDE_API_KEY: "a", VITE_XIAOK_GEMINI_API_KEY: "b", VITE_XIAOK_GENERAL_API_KEY: "c", VITE_XIAOK_GPT_API_KEY: "d" };
    const channels = createLocalModelChannels(keys);
    expect(channels.map((channel) => channel.models.length)).toEqual([8, 4, 12, 4]);
    expect(channels.map((channel) => channel.apiKey)).toEqual(["a", "b", "c", "d"]);
    expect(channels.every((channel) => channel.apiFormat === "openai" && channel.models.every((model) => model.capability === "text"))).toBe(true);
    expect(createLocalModelChannels({}).every((channel) => channel.apiKey === "")).toBe(true);
});
