import { afterAll, expect, test } from "bun:test";
import { createLocalVideoChannels, LOCAL_VIDEO_MODEL } from "../src/constant/local-video-presets";
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const values = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
} });
afterAll(() => {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
});
const { defaultConfig, modelOptionsFromChannels, normalizeModelOptionValue, resolveModelRequestConfig, resolveModelScript, selectableModelsByCapability, useConfigStore } = await import("../src/stores/use-config-store");
const { createVideoGenerationTask, pollVideoGenerationTask } = await import("../src/services/api/video");
const channels = createLocalVideoChannels({ VITE_XIAOK_VIDEO_1_API_KEY: "test-first-key", VITE_XIAOK_VIDEO_2_API_KEY: "test-second-key", VITE_XIAOK_VIDEO_3_API_KEY: "test-third-key" }).reverse();
const config = { ...defaultConfig, channels, models: modelOptionsFromChannels(channels), videoModel: LOCAL_VIDEO_MODEL };
const duplicates = ["MiniMax-H3", "viduq3-pro", "viduq3-turbo"];

test("duplicate names prefer video 1 even when video 3 is listed first", () => {
    for (const model of duplicates) {
        expect(normalizeModelOptionValue(model, channels)).toBe(`xiaok-video-1::${model}`);
        expect(resolveModelRequestConfig(config, model).apiKey).toBe("test-first-key");
    }
});

test("ordinary choices hide only the three secondary duplicates, preserving all stored models", () => {
    const options = selectableModelsByCapability(config, "video");
    expect(options).toHaveLength(15);
    for (const model of duplicates) {
        expect(options).toContain(`xiaok-video-1::${model}`);
        expect(options).not.toContain(`xiaok-video-3::${model}`);
    }
    expect(config.models).toHaveLength(18);
    expect(options).toContain("xiaok-video-3::minimax h3");
    expect(options).toContain("xiaok-video-2::doubao-seedance-2-0-mini-260615");
    expect(config.videoModel).toBe(LOCAL_VIDEO_MODEL);
});

test("explicit secondary selections keep their own credentials and remain ready", () => {
    for (const model of duplicates) {
        const selected = `xiaok-video-3::${model}`;
        expect(normalizeModelOptionValue(selected, channels)).toBe(selected);
        expect(resolveModelRequestConfig(config, selected).apiKey).toBe("test-third-key");
        expect(useConfigStore.getState().isAiConfigReady(config, selected)).toBe(true);
    }
});

test("an empty preferred key does not silently switch credentials", () => {
    const changed = { ...config, channels: channels.map((channel) => channel.id === "xiaok-video-1" ? { ...channel, apiKey: "" } : channel) };
    expect(resolveModelRequestConfig(changed, "MiniMax-H3").apiKey).toBe("");
    expect(useConfigStore.getState().isAiConfigReady(changed, "MiniMax-H3")).toBe(false);
});

test("other providers and non-video models are not deduplicated", () => {
    const other = { ...channels[0], id: "another-provider", baseUrl: "https://other.example", models: [{ name: "MiniMax-H3", capability: "video" as const }] };
    const changed = { ...config, channels: [...channels, other] };
    expect(selectableModelsByCapability(changed, "video")).toContain("another-provider::MiniMax-H3");
    expect(resolveModelRequestConfig(changed, "another-provider::MiniMax-H3").baseUrl).toBe(other.baseUrl);
});

test("raw-name script resolution uses the preferred channel too", () => {
    const scripted = { ...config, channels: channels.map((channel) => ({ ...channel, models: channel.models.map((model) => ({ ...model, script: channel.id })) })) };
    expect(resolveModelScript(scripted, "MiniMax-H3")).toBe("xiaok-video-1");
    expect(resolveModelScript(scripted, "xiaok-video-3::MiniMax-H3")).toBe("xiaok-video-3");
});

test("new tasks pin the preferred channel, while old tasks query their original channel", async () => {
    const originalFetch = globalThis.fetch;
    const headers: unknown[] = [];
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
        headers.push(init?.headers);
        return Response.json({ id: "task-original", status: "in_progress" });
    }) as typeof fetch;
    try {
        const task = await createVideoGenerationTask({ ...config, model: "MiniMax-H3" }, "test prompt");
        expect(task.model).toBe("xiaok-video-1::MiniMax-H3");
        expect(headers[0]).toHaveProperty("Authorization", "Bearer test-first-key");
        await pollVideoGenerationTask(config, { ...task, model: "xiaok-video-3::MiniMax-H3" });
        expect(headers[1]).toHaveProperty("Authorization", "Bearer test-third-key");
        const removed = { ...config, channels: channels.filter((channel) => channel.id !== "xiaok-video-1") };
        await expect(pollVideoGenerationTask(removed, task)).rejects.toThrow("所属模型或渠道已不可用");
        expect(headers).toHaveLength(2);
    } finally { globalThis.fetch = originalFetch; }
});
