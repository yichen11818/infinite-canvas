import type { ModelChannel } from "@/stores/use-config-store";

// Queried per token from /v1/models; only entries marked openai-video are included.
export const localVideoPresets = [
    {
        id: "xiaok-video-1", name: "小K · 视频 1", envKey: "VITE_XIAOK_VIDEO_1_API_KEY",
        models: ["MiniMax-H3", "viduq3-pro", "viduq3-turbo"],
    },
    {
        id: "xiaok-video-2", name: "小K · 视频 2", envKey: "VITE_XIAOK_VIDEO_2_API_KEY",
        models: ["doubao-seedance-2-0-mini-260615"],
    },
    {
        id: "xiaok-video-3", name: "小K · 视频 3", envKey: "VITE_XIAOK_VIDEO_3_API_KEY",
        models: [
            "wan3.0-video-prime-720", "xc8-sd-2", "seedance2.5-a", "xc4-sd-2-fast", "MiniMax-H3",
            "viduq3-pro", "xc7-sd-2-fast", "wan3.0-video-prime-1080", "viduq3-turbo", "wan3.0-video-1080",
            "minimax h3", "xc5-sd-2-fast", "seedance2.0-a", "xc8-sd-2-fast",
        ],
    },
] as const;

export const LOCAL_VIDEO_MODEL = "xiaok-video-2::doubao-seedance-2-0-mini-260615";

export function createLocalVideoChannels(env: Readonly<Record<string, unknown>>): ModelChannel[] {
    return localVideoPresets.map(({ id, name, envKey, models }) => ({
        id, name, baseUrl: "https://video.xiaok.lol", apiFormat: "openai",
        apiKey: typeof env[envKey] === "string" ? env[envKey].trim() : "",
        models: models.map((name) => ({ name, capability: "video" })),
    }));
}
