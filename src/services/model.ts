export interface ModelSettings {
  endpoint: string;
  model: string;
  apiKey: string;
}

const KEY = "workday-model-settings";
export const clearModelSettings = () => sessionStorage.removeItem(KEY);
export const readModelSettings = (): ModelSettings => {
  try {
    return { endpoint: "https://api.openai.com/v1", model: "", apiKey: "", ...JSON.parse(sessionStorage.getItem(KEY) || "{}") };
  } catch {
    return { endpoint: "https://api.openai.com/v1", model: "", apiKey: "" };
  }
};
export const saveModelSettings = (settings: ModelSettings) => sessionStorage.setItem(KEY, JSON.stringify(settings));
export const modelReady = () => {
  const s = readModelSettings();
  return Boolean(s.apiKey && s.model && s.endpoint);
};

export function resolveModelEndpoint(endpoint: string): { url: URL; format: "responses" | "chat" } {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  const format = trimmed.endsWith("/responses") ? "responses" : "chat";
  const suffix = /\/(responses|chat\/completions)$/.test(trimmed) ? "" : "/chat/completions";
  const url = new URL(trimmed + suffix);
  if (url.protocol !== "https:" && !(["localhost", "127.0.0.1"].includes(url.hostname) && url.protocol === "http:"))
    throw new Error("API 地址需要使用 HTTPS；本机地址可以使用 HTTP。");
  return { url, format };
}

export function readModelText(data: unknown, format: "responses" | "chat"): string {
  const value = data as {
    choices?: { message?: { content?: string } }[];
    output_text?: string;
    output?: { type?: string; role?: string; content?: { type?: string; text?: string }[] }[];
  };
  if (format === "chat") return value?.choices?.[0]?.message?.content?.trim() || "";
  if (value?.output_text?.trim()) return value.output_text.trim();
  return (value?.output || [])
    .filter(item => item.type === "message" && item.role === "assistant")
    .flatMap(item => item.content || [])
    .filter(item => item.type === "output_text" && typeof item.text === "string")
    .map(item => item.text)
    .join("\n")
    .trim();
}

export async function callModel(messages: { role: "system" | "user" | "assistant"; content: string }[], settings = readModelSettings(), timeoutMs = 90000): Promise<string> {
  const { url, format } = resolveModelEndpoint(settings.endpoint);
  if (!settings.apiKey || !settings.model) throw new Error("请先在「我的」设置模型和 API Key。");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body = format === "responses"
      ? { model: settings.model, input: messages }
      : { model: settings.model, messages };
    const requestBody = url.hostname === "ark.cn-beijing.volces.com"
      ? { ...body, thinking: { type: "disabled" } }
      : body;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.apiKey}` },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      const message = errorBody?.error?.message || errorBody?.message;
      throw new Error(`模型服务返回 ${response.status}${message ? `：${String(message).slice(0, 200)}` : "。请检查地址、模型名称和 API Key。"}`);
    }
    const data = await response.json();
    const result = readModelText(data, format);
    if (!result) throw new Error("模型没有返回文字内容。");
    return result;
  } catch (error) {
    if ((error as Error).name === "AbortError") throw new Error("模型连接超时，请稍后重试。");
    throw error;
  } finally { clearTimeout(timer); }
}

export async function testModelConnection(settings: ModelSettings) {
  return callModel([{ role: "user", content: "请只回复：连接成功" }], settings, 30000);
}
