import { createLocalModelChannels, LOCAL_TEXT_MODEL } from "@/constant/local-model-presets";
import { CONFIG_STORE_KEY, modelOptionsFromChannels, useConfigStore } from "@/stores/use-config-store";

// Seed only a new browser profile. Saved channels, deletions and model choices remain authoritative.
export function initializeLocalModelConfig() {
    if (localStorage.getItem(CONFIG_STORE_KEY) !== null) return;
    const { config } = useConfigStore.getState();
    const channels = createLocalModelChannels(import.meta.env);
    useConfigStore.setState({
        config: {
            ...config, channels, models: modelOptionsFromChannels(channels),
            model: "", imageModel: "", videoModel: "", audioModel: "", textModel: LOCAL_TEXT_MODEL,
        },
    });
}
