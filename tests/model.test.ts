import { describe, expect, it, vi } from "vitest";
import { callModel, readModelText, resolveModelEndpoint } from "../src/services/model";

describe("model endpoint compatibility", () => {
  it("uses a full Ark Responses URL without appending another path", () => {
    const target = resolveModelEndpoint("https://ark.cn-beijing.volces.com/api/v3/responses");
    expect(target.url.pathname).toBe("/api/v3/responses");
    expect(target.format).toBe("responses");
  });

  it("accepts a base URL and a full chat URL", () => {
    expect(resolveModelEndpoint("https://ark.cn-beijing.volces.com/api/v3").url.pathname).toBe("/api/v3/chat/completions");
    expect(resolveModelEndpoint("https://ark.cn-beijing.volces.com/api/v3/chat/completions").url.pathname).toBe("/api/v3/chat/completions");
  });

  it("reads Responses output text", () => {
    expect(readModelText({ output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "连接成功" }] }] }, "responses")).toBe("连接成功");
  });

  it("sends input to the Responses API", async () => {
    const mock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output_text: "连接成功" }) });
    vi.stubGlobal("fetch", mock);
    try {
      const result = await callModel([{ role: "user", content: "你好" }], {
        endpoint: "https://ark.cn-beijing.volces.com/api/v3/responses", model: "test-model", apiKey: "test-key",
      });
      expect(result).toBe("连接成功");
      expect(mock.mock.calls[0][0].pathname).toBe("/api/v3/responses");
      expect(JSON.parse(mock.mock.calls[0][1].body)).toEqual({ model: "test-model", input: [{ role: "user", content: "你好" }], thinking: { type: "disabled" } });
    } finally { vi.unstubAllGlobals(); }
  });
});
