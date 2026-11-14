import { afterAll, expect, spyOn, test } from "bun:test";
import axios from "axios";
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
const { defaultConfig } = await import("../src/stores/use-config-store");
const { createVideoGenerationTask, pollVideoGenerationTask } = await import("../src/services/api/video");

function configuration(baseUrl: string) {
    return { ...defaultConfig, model: "video::actual-id", channels: [{ id: "video", name: "Video", baseUrl, apiFormat: "openai" as const, apiKey: "test-only-token", models: [{ name: "actual-id", capability: "video" as const }] }] };
}

test("shared generation entry point dispatches Xiaok creation and polling through its adapter", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; body: unknown }> = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
        calls.push({ url, body: init?.body });
        return Response.json({ id: "saved-id", status: calls.length === 1 ? "queued" : "in_progress", progress: 99 });
    }) as typeof fetch;
    try {
        const config = configuration("https://video.xiaok.lol");
        const task = await createVideoGenerationTask(config, "sunrise");
        expect(task).toEqual({ id: "saved-id", provider: "openai", model: "video::actual-id" });
        expect(JSON.parse(calls[0].body as string).model).toBe("actual-id");
        expect(await pollVideoGenerationTask(config, task)).toEqual({ status: "pending" });
        expect(calls[1].url).toBe("https://video.xiaok.lol/v1/videos/saved-id");
    } finally { globalThis.fetch = originalFetch; }
});

test("other OpenAI video providers retain their existing multipart adapter", async () => {
    const post = spyOn(axios, "post").mockResolvedValue({ data: { id: "legacy-id" } });
    try {
        const task = await createVideoGenerationTask(configuration("https://legacy.example/v1"), "sunrise");
        expect(task.id).toBe("legacy-id");
        expect(post).toHaveBeenCalledTimes(1);
        expect(post.mock.calls[0][0]).toBe("https://legacy.example/v1/videos");
        expect(post.mock.calls[0][1]).toBeInstanceOf(FormData);
    } finally { post.mockRestore(); }
});
