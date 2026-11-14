import { expect, test } from "bun:test";
import type { AiConfig } from "../src/stores/use-config-store";
import { createXiaokVideoClient, isXiaokVideoUrl } from "../src/services/api/xiaok-video";

const config = { baseUrl: "https://video.xiaok.lol/v1", apiKey: "test-only-token", model: "actual-model-id", videoSeconds: "5", vquality: "720", size: "16:9", videoMode: "frames", videoGenerateAudio: "true", videoWatermark: "false" } as AiConfig;
const task = { id: "task_original", provider: "openai" as const, model: "channel::actual-model-id" };
const json = (value: unknown, status = 200, headers = {}) => Response.json(value, { status, headers });
const mp4 = () => new Response(new Blob(["test-video"], { type: "video/mp4" }));

function harness(responses: Array<Response | Error>) {
    const calls: Array<{ url: string; options?: RequestInit }> = [];
    const request = (async (url: string, options?: RequestInit) => {
        calls.push({ url, options });
        const response = responses[calls.length - 1];
        if (response instanceof Error) throw response;
        if (!response) throw new Error("Unexpected request in test");
        return response;
    }) as typeof fetch;
    const client = createXiaokVideoClient({
        request, apiUrl: (base, path) => `${base.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1${path}`,
        downloadUrl: (url) => url,
        readImage: async () => new File(["image"], "first.png", { type: "image/png" }),
        readMediaBlob: async (key) => key === "video:existing" ? new Blob(["media"], { type: "video/mp4" }) : null,
    });
    return { client, calls };
}

test("adapter selection uses the exact video host, never model names or lookalike domains", () => {
    expect(isXiaokVideoUrl(config.baseUrl)).toBe(true);
    expect(isXiaokVideoUrl("https://xiaok.lol")).toBe(false);
    expect(isXiaokVideoUrl("https://video.xiaok.lol.example/v1")).toBe(false);
});

test("create returns the original task ID and channel-qualified model immediately", async () => {
    const { client, calls } = harness([json({ id: task.id, status: "queued" })]);
    expect(await client.create({ config, model: task.model, prompt: "日出", images: [] })).toEqual(task);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://video.xiaok.lol/v1/videos");
    expect(calls[0].options?.headers).toEqual({ Authorization: "Bearer test-only-token", "Content-Type": "application/json" });
});

test("uncertain create never retries POST", async () => {
    const { client, calls } = harness([new TypeError("Network failure")]);
    await expect(client.create({ config, model: task.model, prompt: "日出", images: [] })).rejects.toThrow("Network failure");
    expect(calls).toHaveLength(1);
});

test("upload omits Content-Type and resolves storage keys to actual file bytes", async () => {
    const { client, calls } = harness([json({ id: task.id })]);
    await client.create({ config, model: task.model, prompt: "日出", images: [{ id: "i", name: "image.png", type: "image/png", dataUrl: "data:image/png;base64,aQ==" }], videos: [{ id: "v", name: "v.mp4", type: "video/mp4", url: "blob:local", storageKey: "video:existing" }] });
    expect(calls[0].options?.headers).toEqual({ Authorization: "Bearer test-only-token" });
    const form = calls[0].options?.body as FormData;
    expect(form.get("first_frame")).toBeInstanceOf(File);
    expect(await (form.get("input_reference[]") as File).text()).toBe("media");
});

test("missing local media fails before creating a paid task", async () => {
    const { client, calls } = harness([]);
    await expect(client.create({ config, model: task.model, prompt: "日出", images: [], videos: [{ id: "v", name: "v.mp4", type: "video/mp4", url: "blob:local", storageKey: "video:missing" }] })).rejects.toThrow("不存在");
    expect(calls).toHaveLength(0);
});

test("queued, unknown and 99% in_progress never download even when metadata contains a URL", async () => {
    for (const status of ["queued", "unknown", "in_progress"]) {
        const { client, calls } = harness([json({ id: task.id, status, progress: 99, metadata: { url: "https://media.example/video.mp4" } })]);
        expect(await client.poll({ config, task })).toEqual({ status: "pending" });
        expect(calls).toHaveLength(1);
    }
});

test("completed prioritizes metadata URL with its entire signature and no bearer token", async () => {
    const url = "https://media.example/video.mp4?access=test-signature&expires=123";
    const { client, calls } = harness([json({ id: task.id, status: "completed", metadata: { url } }), mp4()]);
    const state = await client.poll({ config, task });
    expect(state.status).toBe("completed");
    expect(calls[1].url).toBe(url);
    expect(calls[1].options?.headers).toBeUndefined();
});

test("without metadata, content endpoint uses the task's bearer token", async () => {
    const { client, calls } = harness([json({ id: task.id, status: "completed" }), mp4()]);
    expect((await client.poll({ config, task })).status).toBe("completed");
    expect(calls[1].url).toEndWith(`/videos/${task.id}/content`);
    expect(calls[1].options?.headers).toEqual({ Authorization: "Bearer test-only-token" });
});

test("content endpoint can serve a binary octet-stream attachment", async () => {
    const { client } = harness([json({ id: task.id, status: "completed" }), new Response(new Blob(["binary-video"], { type: "application/octet-stream" }))]);
    expect((await client.poll({ config, task })).status).toBe("completed");
});

test("409 artifact_not_ready returns the server Retry-After without creating a new task", async () => {
    const { client, calls } = harness([json({ id: task.id, status: "completed" }), json({ code: "artifact_not_ready", message: "保存中" }, 409, { "Retry-After": "7" })]);
    expect(await client.poll({ config, task })).toEqual({ status: "pending", retryAfterMs: 7000 });
    expect(calls.every((call) => call.options?.method !== "POST")).toBe(true);
});

test("HTTP errors prefer nested error.message over the top-level message", async () => {
    const { client } = harness([json({ error: { message: "具体原因" }, message: "通用错误" }, 400)]);
    await expect(client.poll({ config, task })).rejects.toThrow("具体原因");
    const other = harness([json({ code: "video_request_failed", message: "额度不足", data: null }, 403)]);
    await expect(other.client.poll({ config, task })).rejects.toThrow("额度不足");
});

test("terminal failed status remains failed despite a download URL", async () => {
    const { client, calls } = harness([json({ id: task.id, status: "failed", error: { message: "生成失败" }, metadata: { url: "https://media.example/video.mp4" } })]);
    expect(await client.poll({ config, task })).toEqual({ status: "failed", error: "生成失败" });
    expect(calls).toHaveLength(1);
});

test("HTML, JSON, empty video, HTTP 410 and network failures are never saved as success", async () => {
    for (const response of [new Response("<html>error</html>", { headers: { "content-type": "text/html" } }), json({ error: { message: "error" } }), new Response(new Blob([], { type: "video/mp4" })), json({ message: "已过期" }, 410), new TypeError("Network failure")]) {
        const { client } = harness([json({ id: task.id, status: "completed", metadata: { url: "https://media.example/video.mp4" } }), response]);
        await expect(client.poll({ config, task })).rejects.toThrow();
    }
});

test("query rejects HTML and unknown statuses explicitly", async () => {
    for (const response of [new Response("<html>error</html>", { headers: { "content-type": "text/html" } }), json({ id: task.id, status: "broken" })]) {
        const { client } = harness([response]);
        await expect(client.poll({ config, task })).rejects.toThrow();
    }
});

test("cancellation sends no new request and remains an AbortError", async () => {
    const { client, calls } = harness([]);
    const signal = AbortSignal.abort();
    await expect(client.create({ config, model: task.model, prompt: "日出", images: [], signal })).rejects.toHaveProperty("name", "AbortError");
    await expect(client.poll({ config, task, signal })).rejects.toHaveProperty("name", "AbortError");
    expect(calls).toHaveLength(0);
});
