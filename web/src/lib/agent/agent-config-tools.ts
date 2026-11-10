import { useConfigStore } from "@/stores/use-config-store";
import { describeConfig, removeConfigChannel, setConfigDefaultModel, upsertConfigChannel, type ConfigToolName } from "./config-operations";

export function runConfigTool(name: ConfigToolName, input: Record<string, unknown>) {
    const { config } = useConfigStore.getState();
    if (name === "app_config_get") return describeConfig(config);
    const next = name === "app_config_upsert_channel"
        ? upsertConfigChannel({ config, input, env: import.meta.env })
        : name === "app_config_remove_channel"
          ? removeConfigChannel(config, input)
          : setConfigDefaultModel(config, input);
    useConfigStore.setState({ config: next });
    return describeConfig(next);
}
