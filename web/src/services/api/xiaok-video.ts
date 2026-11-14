import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import type { VideoGenerationTask, VideoGenerationTaskState } from "./video";
import { buildXiaokVideoBody, type VideoReference } from "./xiaok-video-request";

type Dependencies = {
    request: typeof fetch;
    apiUrl: (base: string, path: string) => string;
    downloadUrl: (url: string) => string;
    readImage: (image: ReferenceImage) => Promise<File>;
    readMediaBlob: (key: string) => Promise<Blob | null>;
};
type RequestOptions = { signal?: AbortSignal };
type CreateOptions = RequestOptions & { config: AiConfig; model: string; prompt: string; images: ReferenceImage[]; videos?: ReferenceVideo[]; audios?: ReferenceAudio[] };
type PollOptions = RequestOptions & { config: AiConfig; task: VideoGenerationTask };
type ApiPayload = { id?: string; status?: string; metadata?: { url?: string }; error?: { message?: string; code?: string }; message?: string; code?: string };
const MILLISECONDS_PER_SECOND = 1000;

export function isXiaokVideoUrl(baseUrl: string) {
    return new URL(baseUrl).hostname === "video.xiaok.lol";
}

function errorMessage(payload: ApiPayload) {
    return payload.error?.message || payload.message || "视频接口请求失败";
}

async function readJson(response: Response): Promise<ApiPayload> {
    if (!response.headers.get("content-type")?.includes("json")) throw new Error(`HTTP ${response.status}：视频接口返回非 JSON 内容`);
    const payload = await response.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("视频接口返回无效对象");
    return payload;
}

async function readTask(response: Response) {
    const payload = await readJson(response);
    if (!response.ok || (!payload.id && (payload.error || payload.code))) throw new Error(`HTTP ${response.status}：${errorMessage(payload)}`);
    return payload;
}

function remoteSource(source: string) {
    return /^https?:\/\//i.test(source);
}

function referenceRole(mode: string, index: number): VideoReference["role"] {
    if (mode === "reference") return "reference";
    return index === 0 ? "first_frame" : "last_frame";
}

async function readMediaFile(options: { item: ReferenceVideo | ReferenceAudio; signal?: AbortSignal }, deps: Dependencies) {
    const { item, signal } = options;
    let blob = item.storageKey ? await deps.readMediaBlob(item.storageKey) : null;
    if (item.storageKey && !blob) throw new Error("参考素材的本地文件已不存在");
    if (!blob) {
        if (!/^(https?:|blob:|data:)/i.test(item.url)) throw new Error("参考素材地址无效");
        const response = await deps.request(deps.downloadUrl(item.url), { signal });
        if (!response.ok) throw new Error(`参考素材读取失败（HTTP ${response.status}）`);
        blob = await response.blob();
    }
    if (!blob.size || !/^(video|audio)\//i.test(blob.type)) throw new Error("参考素材不是有效的视频或音频文件");
    return new File([blob], item.name, { type: blob.type });
}

async function prepareReferences(options: CreateOptions, deps: Dependencies): Promise<VideoReference[]> {
    const mode = options.config.videoMode === "reference" || options.images.length > 2 ? "reference" : "frames";
    const images = await Promise.all(options.images.map(async (image, index): Promise<VideoReference> => {
        const source = image.url || image.dataUrl;
        return { type: "image", role: referenceRole(mode, index), source: !image.storageKey && remoteSource(source) ? source : await deps.readImage(image) };
    }));
    const media = [...(options.videos || []).map((item) => ({ item, type: "video" as const })), ...(options.audios || []).map((item) => ({ item, type: "audio" as const }))];
    const references = await Promise.all(media.map(async ({ item, type }): Promise<VideoReference> => ({
        type, role: "reference", source: !item.storageKey && remoteSource(item.url) ? item.url : await readMediaFile({ item, signal: options.signal }, deps),
    })));
    return [...images, ...references];
}

function headers(config: AiConfig) {
    return { Authorization: `Bearer ${config.apiKey}` };
}

async function createTask(options: CreateOptions, deps: Dependencies): Promise<VideoGenerationTask> {
    options.signal?.throwIfAborted();
    const references = await prepareReferences(options, deps);
    const body = buildXiaokVideoBody({ config: options.config, prompt: options.prompt, references });
    const requestHeaders = { ...headers(options.config), ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}) };
    // A create request is not idempotent. Never retry it after a transport failure.
    const response = await deps.request(deps.apiUrl(options.config.baseUrl, "/videos"), { method: "POST", headers: requestHeaders, body, signal: options.signal });
    const created = await readTask(response);
    if (typeof created.id !== "string" || !created.id.trim()) throw new Error("视频接口未返回任务 ID，请在控制台确认任务状态后再创建");
    return { id: created.id, provider: "openai", model: options.model };
}

function retryAfter(response: Response) {
    const value = response.headers.get("retry-after");
    if (!value) throw new Error("视频正在保存，但服务端未返回 Retry-After；请稍后继续查询同一任务");
    const numeric = Number(value);
    const milliseconds = Number.isFinite(numeric) ? numeric * MILLISECONDS_PER_SECOND : Date.parse(value) - Date.now();
    if (!Number.isFinite(milliseconds)) throw new Error("服务端返回了无效的 Retry-After");
    return Math.max(0, milliseconds);
}

async function videoContent(response: Response): Promise<VideoGenerationTaskState> {
    if (!response.ok) {
        const payload = await readJson(response);
        if (response.status === 409 && (payload.error?.code || payload.code) === "artifact_not_ready") {
            return { status: "pending", retryAfterMs: retryAfter(response) };
        }
        throw new Error(`视频下载失败（HTTP ${response.status}）：${errorMessage(payload)}`);
    }
    const blob = await response.blob();
    if (!blob.size) throw new Error("视频下载结果为空，请继续查询同一任务");
    if (!/^video\//i.test(blob.type) && blob.type !== "application/octet-stream") throw new Error("视频下载返回非视频内容，请检查 HTTP 响应和 Content-Type");
    return { status: "completed", result: { blob, mimeType: blob.type } };
}

async function downloadVideo(options: PollOptions, video: ApiPayload, deps: Dependencies) {
    const url = video.metadata?.url;
    if (url && (typeof url !== "string" || !remoteSource(url))) throw new Error("视频下载地址无效");
    const path = `/videos/${encodeURIComponent(options.task.id)}/content`;
    // Signed URLs are credentials themselves: preserve the full URL and omit the provider token.
    const response = await deps.request(url ? deps.downloadUrl(url) : deps.apiUrl(options.config.baseUrl, path), {
        signal: options.signal, ...(url ? {} : { headers: headers(options.config) }),
    });
    return videoContent(response);
}

async function pollTask(options: PollOptions, deps: Dependencies): Promise<VideoGenerationTaskState> {
    options.signal?.throwIfAborted();
    const response = await deps.request(deps.apiUrl(options.config.baseUrl, `/videos/${encodeURIComponent(options.task.id)}`), { headers: headers(options.config), signal: options.signal });
    const video = await readTask(response);
    if (video.status === "failed") return { status: "failed", error: errorMessage(video) };
    if (video.status === "completed") return downloadVideo(options, video, deps);
    if (["queued", "in_progress", "unknown"].includes(video.status || "")) return { status: "pending" };
    throw new Error("视频接口返回无法识别的任务状态");
}

export function createXiaokVideoClient(deps: Dependencies) {
    return {
        create: (options: CreateOptions) => createTask(options, deps),
        poll: (options: PollOptions) => pollTask(options, deps),
    };
}
