import type { AiConfig, ModelCapability, ModelChannel } from "@/stores/use-config-store";

const capabilities = ["text", "image", "video", "audio"] as const;
const defaultKeys = { text: "textModel", image: "imageModel", video: "videoModel", audio: "audioModel" } as const;

export const CONFIG_TOOL_LABELS = {
    app_config_get: "读取模型配置",
    app_config_upsert_channel: "保存模型渠道",
    app_config_remove_channel: "删除模型渠道",
    app_config_set_default_model: "设置默认模型",
};

export type ConfigToolName = keyof typeof CONFIG_TOOL_LABELS;

export function isConfigTool(name: string): name is ConfigToolName {
    return Object.hasOwn(CONFIG_TOOL_LABELS, name);
}

export function isConfigWriteTool(name: string) {
    return isConfigTool(name) && name !== "app_config_get";
}

export function describeConfig(config: AiConfig) {
    return {
        channels: config.channels.map(({ id, name, baseUrl, apiFormat, apiKey, models }) => ({
            id, name, baseUrl, apiFormat, hasApiKey: Boolean(apiKey.trim()),
            models: models.map(({ name, capability }) => ({ name, capability, value: `${id}::${name}` })),
        })),
        defaults: Object.fromEntries(capabilities.map((capability) => [capability, config[defaultKeys[capability]]])),
    };
}

function requiredString(value: unknown, label: string) {
    if (typeof value !== "string" || !value.trim()) throw new Error(`${label} 不能为空`);
    return value.trim();
}

function readCapability(value: unknown): ModelCapability {
    if (!capabilities.includes(value as ModelCapability)) throw new Error("模型能力无效");
    return value as ModelCapability;
}

function readBaseUrl(value: unknown) {
    const url = new URL(requiredString(value, "Base URL"));
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        throw new Error("Base URL 必须是无凭据、查询参数或片段的 HTTP(S) 地址");
    }
    return url.href.replace(/\/+$/, "");
}

function readModels(value: unknown) {
    if (!Array.isArray(value)) throw new Error("models 必须是数组");
    const models = value.map((model) => {
        if (!model || typeof model !== "object") throw new Error("模型格式无效");
        return { name: requiredString(model.name, "模型名称"), capability: readCapability(model.capability) };
    });
    if (new Set(models.map((model) => model.name)).size !== models.length) throw new Error("同一渠道不能包含重复模型");
    return models;
}

function readApiKey(options: { input: Record<string, unknown>; existing?: ModelChannel; env: Readonly<Record<string, unknown>> }) {
    const { input, existing, env } = options;
    if (input.apiKeyEnv !== undefined) {
        const name = requiredString(input.apiKeyEnv, "apiKeyEnv");
        if (!/^VITE_[A-Z0-9_]+$/.test(name)) throw new Error("apiKeyEnv 必须是 VITE_ 环境变量名");
        return requiredString(env[name], `环境变量 ${name}`);
    }
    if (!existing) throw new Error("新增渠道必须提供 apiKeyEnv");
    if (readBaseUrl(input.baseUrl) !== readBaseUrl(existing.baseUrl) || input.apiFormat !== existing.apiFormat) {
        throw new Error("更换服务地址或协议必须提供 apiKeyEnv");
    }
    return existing.apiKey;
}

function withChannels(config: AiConfig, channels: ModelChannel[]): AiConfig {
    return { ...config, channels, models: channels.flatMap((channel) => channel.models.map((model) => `${channel.id}::${model.name}`)) };
}

export function upsertConfigChannel(options: { config: AiConfig; input: Record<string, unknown>; env: Readonly<Record<string, unknown>> }): AiConfig {
    const { config, input, env } = options;
    if (Object.hasOwn(input, "apiKey")) throw new Error("请使用 apiKeyEnv 引用本地密钥");
    const id = requiredString(input.id, "渠道 ID");
    if (id.includes("::")) throw new Error("渠道 ID 不能包含 ::");
    const existing = config.channels.find((channel) => channel.id === id);
    if (input.apiFormat !== "openai" && input.apiFormat !== "gemini") throw new Error("渠道协议无效");
    const channel: ModelChannel = {
        id, name: requiredString(input.name, "渠道名称"), baseUrl: readBaseUrl(input.baseUrl), apiFormat: input.apiFormat,
        apiKey: readApiKey({ input, existing, env }),
        models: readModels(input.models).map((model) => ({ ...model, script: existing?.models.find((item) => item.name === model.name)?.script })),
    };
    const channels = existing ? config.channels.map((item) => item.id === id ? channel : item) : [...config.channels, channel];
    return withChannels(config, channels);
}

export function removeConfigChannel(config: AiConfig, input: Record<string, unknown>) {
    const id = requiredString(input.id, "渠道 ID");
    if (!config.channels.some((channel) => channel.id === id)) throw new Error("渠道不存在");
    if (config.channels.length === 1) throw new Error("至少保留一个渠道");
    return withChannels(config, config.channels.filter((channel) => channel.id !== id));
}

export function setConfigDefaultModel(config: AiConfig, input: Record<string, unknown>): AiConfig {
    const capability = readCapability(input.capability);
    const model = requiredString(input.model, "模型");
    const channel = config.channels.find((item) => item.models.some((entry) => `${item.id}::${entry.name}` === model && entry.capability === capability));
    if (!channel) throw new Error("模型不存在或能力不匹配");
    if (!channel.apiKey.trim()) throw new Error("渠道尚未配置密钥");
    return { ...config, [defaultKeys[capability]]: model };
}
