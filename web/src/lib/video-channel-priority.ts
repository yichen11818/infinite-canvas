import type { ModelChannel } from "@/stores/use-config-store";

const PREFERRED_CHANNEL = "xiaok-video-1";
const SECONDARY_CHANNEL = "xiaok-video-3";
const DUPLICATE_VIDEO_MODELS = ["MiniMax-H3", "viduq3-pro", "viduq3-turbo"] as const;
const VIDEO_SITE = /^https:\/\/video\.xiaok\.lol(?:\/v1)?\/?$/i;

export function preferredVideoChannel(channels: ModelChannel[], model: string) {
    if (!DUPLICATE_VIDEO_MODELS.some((name) => name === model)) return undefined;
    return channels.find((channel) => channel.id === PREFERRED_CHANNEL
        && VIDEO_SITE.test(channel.baseUrl.trim())
        && channel.models.some((entry) => entry.name === model && entry.capability === "video"));
}

// Keep both channels stored for explicit selections and existing task recovery.
export function preferredVideoOptions(channels: ModelChannel[], values: string[]) {
    const secondary = channels.find((channel) => channel.id === SECONDARY_CHANNEL && VIDEO_SITE.test(channel.baseUrl.trim()));
    if (!secondary) return values;
    const prefix = `${SECONDARY_CHANNEL}::`;
    return values.filter((value) => {
        if (!value.startsWith(prefix)) return true;
        const model = value.slice(prefix.length);
        const isVideo = secondary.models.some((entry) => entry.name === model && entry.capability === "video");
        return !isVideo || !preferredVideoChannel(channels, model);
    });
}
