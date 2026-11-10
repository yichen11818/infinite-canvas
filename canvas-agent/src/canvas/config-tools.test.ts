import { EventEmitter } from "node:events";
import type { ServerResponse } from "node:http";
import assert from "node:assert/strict";
import test from "node:test";
import { CanvasSession } from "./session.js";
import { toolInputSchemas } from "./schemas.js";

test("configuration tools are forwarded even when no canvas is open", async (t) => {
    const session = new CanvasSession();
    const messages: string[] = [];
    const stream = Object.assign(new EventEmitter(), { writeHead() {}, write(value: string) { messages.push(value); return true; } });
    session.openEvents(new URL("http://localhost/events?clientId=config-client"), stream as unknown as ServerResponse);
    t.after(() => stream.emit("close"));
    const calls = [
        ["app_config_get", {}],
        ["app_config_upsert_channel", { id: "test", name: "Test", baseUrl: "https://example.com", apiFormat: "openai", apiKeyEnv: "VITE_TEST_KEY", models: [] }],
        ["app_config_remove_channel", { id: "test" }],
        ["app_config_set_default_model", { capability: "text", model: "test::model" }],
    ] as const;
    for (const [name, input] of calls) {
        const pending = session.callTool(name, input);
        const event = messages.filter((message) => message.startsWith("event: tool_call")).at(-1)!;
        const payload = JSON.parse(event.split("data: ")[1]);
        assert.equal(payload.name, name);
        session.resolveResult("config-client", { requestId: payload.requestId, result: { ok: true } });
        assert.deepEqual(await pending, { ok: true });
    }
});

test("configuration schema rejects raw credentials and unsafe URLs", () => {
    const input = { id: "test", name: "Test", baseUrl: "https://example.com", apiFormat: "openai", models: [] };
    assert.throws(() => toolInputSchemas.app_config_upsert_channel.parse({ ...input, apiKey: "private-value" }));
    assert.throws(() => toolInputSchemas.app_config_upsert_channel.parse({ ...input, baseUrl: "https://user:password@example.com" }));
    assert.throws(() => toolInputSchemas.app_config_upsert_channel.parse({ ...input, apiKeyEnv: "PATH" }));
    assert.throws(() => toolInputSchemas.app_config_set_default_model.parse({ capability: "unknown", model: "m" }));
});

test("configuration calls explicitly fail without a connected webpage", async () => {
    await assert.rejects(new CanvasSession().callTool("app_config_get", {}), /没有已连接网页/);
});
