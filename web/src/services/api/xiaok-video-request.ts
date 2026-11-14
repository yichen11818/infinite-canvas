import type { AiConfig } from "@/stores/use-config-store";
import { inferVideoRatio } from "@/lib/media-size";

export type VideoReference = {
    type: "image" | "video" | "audio";
    role: "reference" | "first_frame" | "last_frame";
    source: string | File;
};

type VideoParameters = Pick<AiConfig, "model" | "videoSeconds" | "vquality" | "size" | "videoGenerateAudio" | "videoWatermark">;

function optionalBoolean(value: string, label: string) {
    if (!value) return undefined;
    if (value === "true") return true;
    if (value === "false") return false;
    throw new Error(`${label} 必须是 true 或 false`);
}

function seconds(value: string) {
    if (!value.trim()) return undefined;
    const result = Number(value);
    if (!Number.isInteger(result) || result <= 0) throw new Error("视频时长必须为正整数秒");
    return result;
}

function resolution(value: string) {
    const result = value.trim().toLowerCase();
    if (!result || result === "auto") return undefined;
    if (/^\d+$/.test(result)) return `${result}p`;
    if (/^\d+p$/.test(result) || result === "4k") return result;
    throw new Error("请填写模型支持的实际分辨率，如 720p、768p、1080p 或 4k");
}

function aspectRatio(value: string) {
    if (!value || value === "auto") return undefined;
    const parts = value.match(/^(\d+)(?:x|:)(\d+)$/);
    if (!parts || !Number(parts[1]) || !Number(parts[2])) throw new Error("视频画幅格式无效");
    return inferVideoRatio(value);
}

function parameters(config: VideoParameters, prompt: string) {
    if (!prompt.trim()) throw new Error("视频描述不能为空");
    return {
        model: config.model,
        prompt: prompt.trim(),
        seconds: seconds(config.videoSeconds),
        resolution: resolution(config.vquality),
        aspect_ratio: aspectRatio(config.size),
        generate_audio: optionalBoolean(config.videoGenerateAudio, "generate_audio"),
        watermark: optionalBoolean(config.videoWatermark, "watermark"),
    };
}

export function buildXiaokVideoBody(options: { config: VideoParameters; prompt: string; references: VideoReference[] }) {
    const values = parameters(options.config, options.prompt);
    const references = options.references;
    if (!references.some((item) => item.source instanceof File)) {
        return JSON.stringify({ ...values, ...(references.length ? { references } : {}) });
    }
    const form = new FormData();
    const aliases: Record<string, string> = { resolution: "resolution_name", aspect_ratio: "size" };
    Object.entries(values).forEach(([key, value]) => {
        if (value !== undefined) form.append(aliases[key] || key, String(value));
    });
    const remote = references.filter((item) => typeof item.source === "string");
    if (remote.length) form.append("references", JSON.stringify(remote));
    references.forEach(({ role, source }) => {
        if (source instanceof File) form.append(role === "reference" ? "input_reference[]" : role, source);
    });
    return form;
}
