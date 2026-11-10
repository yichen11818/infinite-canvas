import { z } from "zod";

const capability = z.enum(["text", "image", "video", "audio"]);
const identifier = z.string().trim().min(1);
const baseUrl = z.string().url().refine((value) => {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
}, "Base URL 必须是无凭据、查询参数或片段的 HTTP(S) 地址");

export const configToolSchemas = {
    app_config_get: z.object({}).strict(),
    app_config_upsert_channel: z.object({
        id: identifier,
        name: identifier,
        baseUrl,
        apiFormat: z.enum(["openai", "gemini"]),
        apiKeyEnv: z.string().regex(/^VITE_[A-Z0-9_]+$/).optional(),
        models: z.array(z.object({ name: identifier, capability }).strict()),
    }).strict(),
    app_config_remove_channel: z.object({ id: identifier }).strict(),
    app_config_set_default_model: z.object({ capability, model: identifier }).strict(),
};

export const configToolDescriptions = {
    app_config_get: "读取渠道、模型及默认模型；仅返回 hasApiKey，不返回密钥或调用脚本。",
    app_config_upsert_channel: "按 id 新增或更新渠道及完整模型清单。apiKeyEnv 指向前端 .env.local 的 VITE_ 环境变量，不传密钥明文；省略时保留现有密钥。更换服务地址或协议时必须显式提供对应 apiKeyEnv。",
    app_config_remove_channel: "按 id 删除渠道；保留已选模型标识，使相关生成明确提示配置缺失，不自动切换供应商。",
    app_config_set_default_model: "设置指定能力的默认模型，model 使用 app_config_get 返回的 channelId::model 格式，必须存在、能力匹配且已配置密钥。",
};
