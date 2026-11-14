import { expect, test } from "bun:test";
import { applyPromptFanout, assertWorkflowInputs, parsePromptFanout, runPromptFanout, validatePromptTargets } from "../src/lib/canvas/canvas-prompt-fanout";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const node = (id: string, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id, type: CanvasNodeType.Text, title: id, position: { x: 0, y: 0 }, width: 480, height: 320, metadata,
});
const prompts = Array.from({ length: 10 }, (_, index) => `独立视频提示词 ${index + 1}`);
const result = { analysis: "产品图可见特征", prompts };
function fixture() {
    const outputs = prompts.map((_, index) => node(`prompt-${index}`, { content: "", fontSize: 22 }));
    const source = node("analysis", { model: "channel::model", prompt: "固定指令", promptOutputNodeIds: outputs.map(n => n.id) });
    const untouched = node("other", { content: "无关内容" });
    return { source, nodes: [source, ...outputs, untouched], connections: outputs.map(n => ({ id: n.id, fromNodeId: source.id, toNodeId: n.id })), signal: new AbortController().signal };
}

test("parses exactly ten distinct prompts and a product analysis", () => {
    expect(parsePromptFanout(JSON.stringify(result), 10)).toEqual(result);
    expect(parsePromptFanout('```json\n' + JSON.stringify(result) + '\n```', 10)).toEqual(result);
});

test("rejects malformed JSON, missing analysis, wrong count, nontext, blank and duplicates", () => {
    for (const value of ["invalid", "null", "[]", '{}', JSON.stringify({ ...result, prompts: prompts.slice(1) }),
        JSON.stringify({ ...result, prompts: [...prompts.slice(1), 1] }), JSON.stringify({ ...result, prompts: [...prompts.slice(1), " "] }),
        JSON.stringify({ ...result, prompts: [...prompts.slice(1), prompts[1]] })]) {
        expect(() => parsePromptFanout(value, 10)).toThrow();
    }
});

test("writes ten separate fixed outputs without changing IDs, titles, models, layout or instructions", () => {
    const input = fixture();
    const after = applyPromptFanout(input.nodes, input.source, result);
    expect(after.map(n => n.id)).toEqual(input.nodes.map(n => n.id));
    expect(after.slice(1, 11).map(n => n.metadata?.content)).toEqual(prompts);
    expect(after[0].metadata).toMatchObject({ content: result.analysis, prompt: "固定指令", model: "channel::model" });
    expect(after[1].metadata?.fontSize).toBe(22);
    expect(after[11]).toBe(input.nodes[11]);
    expect(input.nodes[1].metadata?.content).toBe("");
});

test("a second run updates the same output nodes with the new prompts", () => {
    const input = fixture();
    const first = applyPromptFanout(input.nodes, input.source, result);
    const secondPrompts = prompts.map(p => `新产品 ${p}`);
    const second = applyPromptFanout(first, input.source, { ...result, prompts: secondPrompts });
    expect(second.length).toBe(input.nodes.length);
    expect(second.slice(1, 11).map(n => n.metadata?.content)).toEqual(secondPrompts);
});

test("requires all ten existing text targets with real connections", () => {
    const input = fixture();
    expect(validatePromptTargets(input)).toHaveLength(10);
    expect(() => validatePromptTargets({ ...input, connections: [] })).toThrow();
    expect(() => validatePromptTargets({ ...input, nodes: input.nodes.slice(2) })).toThrow();
    expect(() => validatePromptTargets({ ...input, source: node("analysis", { promptOutputNodeIds: ["a", "a"] }) })).toThrow();
});

test("checks uploaded product images and completed upstream prompts", () => {
    const image = { ...node("product", { content: "data:image/png;base64,example" }), type: CanvasNodeType.Image };
    const prompt = node("prompt", { content: "单条提示词", status: "success" });
    const source = node("target", { requiredImageNodeId: "product", requiredPromptNodeId: "prompt" });
    expect(() => assertWorkflowInputs(source, [image, prompt])).not.toThrow();
    expect(() => assertWorkflowInputs(source, [image, { ...prompt, metadata: { content: "手动写入的提示词", status: "idle" } }])).not.toThrow();
    expect(() => assertWorkflowInputs(source, [prompt])).toThrow("上传图片");
    expect(() => assertWorkflowInputs(source, [image, { ...prompt, metadata: { ...prompt.metadata, status: "loading" } }])).toThrow("独立提示词");
    expect(() => assertWorkflowInputs(node("ordinary"), [])).not.toThrow();
});

test("one successful model request fans out to ten nodes without launching videos", async () => {
    const input = fixture();
    let nodes = input.nodes;
    let calls = 0;
    await runPromptFanout(input, { setNodes: update => { nodes = update(nodes); }, request: async () => { calls++; return JSON.stringify(result); } });
    expect(calls).toBe(1);
    expect(nodes.slice(1, 11).map(n => n.metadata?.content)).toEqual(prompts);
});

test("invalid output or request failure marks outputs as failed and exposes the error", async () => {
    for (const answer of ["invalid", "throw"]) {
        const input = fixture();
        let nodes = input.nodes;
        const run = runPromptFanout(input, { setNodes: update => { nodes = update(nodes); }, request: async () => {
            if (answer === "throw") throw new Error("provider failed");
            return answer;
        } });
        await expect(run).rejects.toThrow();
        expect(nodes.slice(1, 11).every(n => n.metadata?.status === "error" && n.metadata.errorDetails)).toBe(true);
        expect(nodes.slice(1, 11).every(n => !n.metadata?.content)).toBe(true);
    }
});

test("cancellation never writes a successful prompt result", async () => {
    const input = fixture();
    const controller = new AbortController();
    let nodes = input.nodes;
    await expect(runPromptFanout({ ...input, signal: controller.signal }, { setNodes: update => { nodes = update(nodes); }, request: async () => {
        controller.abort();
        return JSON.stringify(result);
    } })).rejects.toThrow();
    expect(nodes.slice(1, 11).every(n => n.metadata?.status === "error")).toBe(true);
});
