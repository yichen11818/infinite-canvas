import type { CanvasNodeData, CanvasConnection } from "@/types/canvas";

type PromptFanout = { analysis: string; prompts: string[] };
type NodeUpdater = (update: (nodes: CanvasNodeData[]) => CanvasNodeData[]) => void;
type FanoutInput = {
    source: CanvasNodeData;
    nodes: readonly CanvasNodeData[];
    connections: readonly CanvasConnection[];
    signal: AbortSignal;
};
type FanoutDependencies = {
    request: (onText: (text: string) => void) => Promise<string>;
    setNodes: NodeUpdater;
};

export function parsePromptFanout(answer: string, count: number): PromptFanout {
    const json = answer.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, "$1");
    const value: unknown = JSON.parse(json);
    if (!value || typeof value !== "object") throw new Error("提示词拆分失败：模型必须返回 JSON 对象。");
    const { analysis, prompts } = value as Partial<PromptFanout>;
    if (typeof analysis !== "string" || !analysis.trim()) throw new Error("提示词拆分失败：缺少产品图片分析。");
    if (!Array.isArray(prompts) || prompts.length !== count) throw new Error(`提示词拆分失败：需要 ${count} 条提示词。`);
    if (prompts.some((prompt) => typeof prompt !== "string" || !prompt.trim())) throw new Error("提示词拆分失败：存在空白或非文本提示词。");
    const normalized = prompts.map((prompt) => prompt.trim());
    if (new Set(normalized).size !== count) throw new Error("提示词拆分失败：模型返回了重复提示词。");
    return { analysis: analysis.trim(), prompts: normalized };
}

export function assertWorkflowInputs(source: CanvasNodeData, nodes: readonly CanvasNodeData[]) {
    const imageId = source.metadata?.requiredImageNodeId;
    const promptId = source.metadata?.requiredPromptNodeId;
    if (!imageId && !promptId) return;
    const byId = new Map(nodes.map((node) => [node.id, node]));
    if (imageId) {
        const image = byId.get(imageId);
        if (image?.type !== "image" || !image.metadata?.content) throw new Error("请先在「产品图片」节点上传图片。");
    }
    if (promptId) {
        const prompt = byId.get(promptId);
        if (prompt?.type !== "text" || !prompt.metadata?.content?.trim() || prompt.metadata.status === "loading" || prompt.metadata.status === "error") {
            throw new Error("请先生成该视频对应的独立提示词，再生成视频。");
        }
    }
}

export function validatePromptTargets(input: Pick<FanoutInput, "source" | "nodes" | "connections">) {
    const ids = input.source.metadata?.promptOutputNodeIds;
    if (!ids?.length || new Set(ids).size !== ids.length) throw new Error("提示词拆分配置无效：输出节点缺失或重复。");
    const nodes = new Map(input.nodes.map((node) => [node.id, node]));
    const targets = new Set(input.connections.filter((edge) => edge.fromNodeId === input.source.id).map((edge) => edge.toNodeId));
    for (const id of ids) {
        if (id === input.source.id || nodes.get(id)?.type !== "text" || !targets.has(id)) {
            throw new Error(`提示词输出节点不存在、类型错误或连线缺失：${id}`);
        }
    }
    return ids;
}

export function applyPromptFanout(nodes: CanvasNodeData[], source: CanvasNodeData, result: PromptFanout) {
    const ids = source.metadata?.promptOutputNodeIds || [];
    if (ids.length !== result.prompts.length) throw new Error("提示词数量与输出节点数量不一致。");
    const outputs = new Map(ids.map((id, index) => [id, result.prompts[index]]));
    return nodes.map((node) => {
        if (node.id === source.id) return { ...node, metadata: { ...node.metadata, content: result.analysis, status: "success" as const, errorDetails: undefined } };
        const content = outputs.get(node.id);
        if (content === undefined) return node;
        return { ...node, metadata: { ...node.metadata, content, prompt: "", texts: undefined, primaryTextId: undefined, status: "success" as const, errorDetails: undefined } };
    });
}

export async function runPromptFanout(input: FanoutInput, dependencies: FanoutDependencies) {
    const ids = validatePromptTargets(input);
    const outputs = new Set(ids);
    let streamed = "";
    dependencies.setNodes((nodes) => nodes.map((node) => outputs.has(node.id)
        ? { ...node, metadata: { ...node.metadata, status: "loading", errorDetails: undefined } } : node));
    try {
        const answer = await dependencies.request((text) => { streamed = text; });
        input.signal.throwIfAborted();
        const result = parsePromptFanout(answer || streamed, ids.length);
        dependencies.setNodes((nodes) => applyPromptFanout(nodes, input.source, result));
    } catch (error) {
        const errorDetails = error instanceof Error ? error.message : String(error);
        dependencies.setNodes((nodes) => nodes.map((node) => outputs.has(node.id)
            ? { ...node, metadata: { ...node.metadata, status: "error", errorDetails } } : node));
        throw error;
    }
}
