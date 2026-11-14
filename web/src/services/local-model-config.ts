import { createLocalModelChannels, LOCAL_TEXT_MODEL } from "@/constant/local-model-presets";
import { createLocalVideoChannels, LOCAL_VIDEO_MODEL } from "@/constant/local-video-presets";
import { CONFIG_STORE_KEY, modelOptionsFromChannels, useConfigStore } from "@/stores/use-config-store";
import type { AiConfig, ModelChannel } from "@/stores/use-config-store";

const VIDEO_IMPORT_KEY = "infinite-canvas:xiaok-video-presets-imported";

export function addLocalVideoChannels(config: AiConfig, presets: ModelChannel[]): AiConfig {
    const additions = presets.filter((preset) => preset.apiKey && !config.channels.some((channel) => channel.id === preset.id));
    const channels = [...config.channels, ...additions];
    const videoModel = config.videoModel || (channels.some((channel) => channel.id === "xiaok-video-2") ? LOCAL_VIDEO_MODEL : "");
    return { ...config, channels, models: modelOptionsFromChannels(channels), videoModel };
}

// Explicit one-time source import; later user edits/deletions remain authoritative.
export function initializeLocalModelConfig() {
    const { config } = useConfigStore.getState();
    const videoChannels = createLocalVideoChannels(import.meta.env);
    if (localStorage.getItem(CONFIG_STORE_KEY) !== null) {
        if (localStorage.getItem(VIDEO_IMPORT_KEY) || !videoChannels.some((channel) => channel.apiKey)) return;
        useConfigStore.setState({ config: addLocalVideoChannels(config, videoChannels) });
        localStorage.setItem(VIDEO_IMPORT_KEY, "true");
        return;
    }
    const channels = [...createLocalModelChannels(import.meta.env), ...videoChannels];
    useConfigStore.setState({
        config: {
            ...config, channels, models: modelOptionsFromChannels(channels),
            model: "", imageModel: "", videoModel: LOCAL_VIDEO_MODEL, audioModel: "", textModel: LOCAL_TEXT_MODEL,
        },
    });
    if (videoChannels.some((channel) => channel.apiKey)) localStorage.setItem(VIDEO_IMPORT_KEY, "true");
}
