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
const { addLocalVideoChannels } = await import("../src/services/local-model-config");
const { defaultConfig } = await import("../src/stores/use-config-store");
const channels = createLocalVideoChannels({ VITE_XIAOK_VIDEO_1_API_KEY: "test-1", VITE_XIAOK_VIDEO_2_API_KEY: "test-2", VITE_XIAOK_VIDEO_3_API_KEY: "test-3" });

test("three token-scoped presets contain only 18 confirmed video entries (15 unique)", () => {
    expect(channels.map((channel) => channel.models.length)).toEqual([3, 1, 14]);
    const models = channels.flatMap((channel) => channel.models);
    expect(models.every((model) => model.capability === "video")).toBe(true);
    expect(new Set(models.map((model) => model.name)).size).toBe(15);
    expect(channels.map((channel) => channel.apiKey)).toEqual(["test-1", "test-2", "test-3"]);
});

test("source import retains existing channels and text selection, only fills an empty video default", () => {
    const config = { ...defaultConfig, textModel: "original-text", videoModel: "" };
    const merged = addLocalVideoChannels(config, channels);
    expect(merged.channels.slice(0, config.channels.length)).toEqual(config.channels);
    expect(merged.textModel).toBe(config.textModel);
    expect(merged.videoModel).toBe(LOCAL_VIDEO_MODEL);
    expect(config.videoModel).toBe("");
});

test("import is additive and does not overwrite an existing token, script or default", () => {
    const existing = { ...channels[0], apiKey: "custom-key", name: "用户名称", models: [{ name: "custom", capability: "video" as const, script: "custom-script" }] };
    const config = { ...defaultConfig, channels: [existing], videoModel: "xiaok-video-1::custom" };
    const merged = addLocalVideoChannels(config, channels);
    expect(merged.channels[0]).toEqual(existing);
    expect(merged.videoModel).toBe(config.videoModel);
    expect(addLocalVideoChannels(merged, channels)).toEqual(merged);
});
