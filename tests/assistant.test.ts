import { describe, expect, it } from "vitest";
import {
  buildReply,
  buildConversationSystemPrompt,
  buildSummary,
  classifyIntent,
  parsePeople,
  isEventFollowup,
  resolveDate,
  type AssistantContext,
} from "../src/services/ai";
import { requirementsForChange } from "../src/services/materials";
import { migrateData } from "../src/services/migrate";
import type { AppData, Material, WorkEvent } from "../src/types";

const DATE = "2026-10-12";

const material = (over: Partial<Material> = {}): Material => ({
  id: "m1",
  name: "当前有效劳动合同",
  type: "contract",
  status: "saved_externally",
  isCurrent: true,
  eventIds: [],
  extractionStatus: "none",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...over,
});

const event = (over: Partial<WorkEvent> = {}): WorkEvent => ({
  id: "e1",
  title: "项目群成员变化",
  occurredAt: DATE,
  people: [],
  description: "被移出项目群",
  status: "confirmed",
  attention: "watch",
  sourceType: "chat",
  sourceId: "entry1",
  materialIds: [],
  updates: [],
  createdAt: "2026-10-12T00:00:00.000Z",
  updatedAt: "2026-10-12T00:00:00.000Z",
  ...over,
});

const ctx = (over: Partial<AssistantContext> = {}): AssistantContext => ({
  date: DATE,
  entryId: "entry1",
  userText: "",
  confirmedEvents: [],
  draftTitles: [],
  materials: [],
  ...over,
});

describe("AI 是记录整理助手，不是聊天机器人", () => {
  it("用户只说累：回应情绪，不强行创建事件", () => {
    const reply = buildReply("今天累死了", ctx());
    expect(reply.candidateEvent).toBeUndefined();
    expect(reply.clarify).toBeUndefined();
    expect(reply.emergency).toBeUndefined();
    expect(reply.content).toContain("消耗");
  });

  it("描述具体变化：默认用已有信息直接整理，不再每次都追问", () => {
    const reply = buildReply("老板把我移出项目群了", ctx());
    // 关键变化：减少打扰——能整理就直接整理
    expect(reply.clarify).toBeUndefined();
    expect(reply.candidateEvent).toBeDefined();
    expect(reply.candidateEvent?.title).toBe("项目群成员变化");
    // 没提时间就默认用这一天
    expect(reply.candidateEvent?.occurredAt).toBe(DATE);
  });

  it("项目交给新人时生成带已知时间人物的对话卡片草稿", () => {
    const text = "我有个项目正在跟进，今天老板突然把这个项目给一个新人了";
    const reply = buildReply(text, ctx());
    expect(reply.candidateEvent).toMatchObject({
      title: "项目交接变化",
      occurredAt: DATE,
      people: ["老板", "新人"],
      description: text,
      dateWasInferred: false,
    });
    expect(reply.noteworthy).toBe(true);
    expect(reply.content).toContain("最让你在意");
    expect(reply.content).not.toContain("风险");
  });

  it("聊天回复先倾听，事件卡片负责事实；未说日期时提示核对", () => {
    const text = "老板把项目交给新人了";
    const reply = buildReply(text, ctx());
    expect(reply.candidateEvent?.dateWasInferred).toBe(true);
    const prompt = buildConversationSystemPrompt(text, ctx(), reply);
    expect(prompt).toContain("事件草稿会在独立卡片中显示");
    expect(prompt).toContain("不要替他断定");
    expect(isEventFollowup("老板是开会口头通知的")).toBe(true);
    expect(isEventFollowup("我现在觉得很难受")).toBe(false);
  });

  it("值得及时关注的变化会在对话里给轻量卡片，普通进展只进今日整理", () => {
    const watch = buildReply("老板把我移出项目群了", ctx());
    expect(watch.noteworthy).toBe(true);
    const normal = buildReply("今天完成项目了，还被表扬了一下", ctx());
    expect(normal.candidateEvent?.attention).toBe("normal");
    expect(normal.noteworthy).toBe(false);
  });

  it("只有时间确实说不清时才补问一句", () => {
    const vague = buildReply("前几天老板取消了两个项目会议", ctx());
    expect(vague.clarify).toBeDefined();
    expect(vague.candidateEvent).toBeUndefined();
    expect(vague.content).toMatch(/哪一天/);
  });

  it("能推断时间时直接用推断结果，不追问", () => {
    const reply = buildReply("昨天老板取消了项目会议", ctx());
    expect(reply.clarify).toBeUndefined();
    expect(reply.candidateEvent?.occurredAt).toBe("2026-10-11");
  });

  it("遇到当天签文件这类时间敏感事项：展示整理当前情况的入口", () => {
    const reply = buildReply("HR 让我今天签离职协议", ctx());
    expect(reply.emergency).toBe(true);
    expect(reply.candidateEvent).toBeUndefined();
    expect(reply.content).toContain("整理");
  });

  it("用户问该保存什么：先查库存，已有材料不重复建议", () => {
    const reply = buildReply(
      "HR 找我谈话，我要留什么？",
      ctx({ materials: [material()] }),
    );
    const types = (reply.requirements ?? []).map((r) => r.type);
    expect(types).toContain("hr");
    // 劳动合同已保存，仍然会带上要求，但由 createSuggestions 按库存过滤掉
    expect(types).toContain("contract");
    expect(reply.content).toContain("材料库");
    expect(reply.content).toContain("当前有效劳动合同");
  });

  it("描述变化时同时给出留痕建议，且建议不依赖事件", () => {
    const reply = buildReply("老板把我移出项目群了", ctx());
    const reqs = reply.requirements ?? [];
    expect(reqs.length).toBeGreaterThan(0);
    expect(reqs.every((r) => r.entryId === "entry1")).toBe(true);
    // 材料收集不以确认事件为前提：草稿还没确认，建议里也不带 eventId
    expect(reqs.every((r) => r.eventId === undefined)).toBe(true);
  });

  it("已确认事件被新消息补充：建议追加进展，而不是新建重复事件", () => {
    const reply = buildReply(
      "今天又被移出项目群了",
      ctx({ confirmedEvents: [event()] }),
    );
    expect(reply.updateSuggestionEventId).toBe("e1");
    expect(reply.candidateEvent).toBeUndefined();
    expect(reply.content).toContain("已确认");
  });

  it("同一天已存在同名草稿时不重复生成", () => {
    const reply = buildReply(
      "被移出项目群了",
      ctx({ draftTitles: ["项目群成员变化"] }),
    );
    expect(reply.candidateEvent).toBeUndefined();
    expect(reply.clarify).toBeUndefined();
    expect(reply.content).toContain("今日整理");
  });

  it("意图分类覆盖情绪 / 材料 / 紧急 / 事件 / 闲聊", () => {
    expect(classifyIntent("今天好累")).toBe("emotion");
    expect(classifyIntent("我要留什么材料？")).toBe("materials");
    expect(classifyIntent("HR 让我今天签协议")).toBe("urgent");
    expect(classifyIntent("项目群把我移出了")).toBe("event");
    expect(classifyIntent("中午吃了面")).toBe("smalltalk");
  });

  it("从原话里抽人物，并尽量推断日期", () => {
    expect(parsePeople("就按今天，涉及主管和 HR")).toEqual(["主管", "HR"]);
    expect(parsePeople("今天挺正常")).toEqual([]);
    expect(resolveDate("就按今天", DATE)).toBe(DATE);
    expect(resolveDate("昨天的事", DATE)).toBe("2026-10-11");
    expect(resolveDate("前几天的事", DATE)).toBeNull();
  });

  it("没有状态也能生成总结，且总结不包含结论性判断", () => {
    const summary = buildSummary({}, "今天正常");
    expect(summary).toContain("模拟 AI");
    expect(summary).not.toMatch(/公司违法|一定能赢|你必须辞职/);
  });

  it("只填心情也能生成总结，总结里不再出现压力与工作时长", () => {
    const summary = buildSummary({ mood: "tired" }, "");
    expect(summary).toContain("疲惫");
    expect(summary).not.toContain("压力");
    expect(summary).not.toContain("小时");
  });
});

describe("留痕建议可以脱离事件存在", () => {
  it("从当天记录直接推导建议，并带上 entryId", () => {
    const reqs = requirementsForChange(
      "今天老板取消了我两个项目会议",
      "entry1",
      DATE,
    );
    expect(reqs.some((r) => r.type === "meeting")).toBe(true);
    expect(reqs.every((r) => r.entryId === "entry1")).toBe(true);
    expect(reqs.every((r) => r.eventId === undefined)).toBe(true);
  });

  it("时间敏感的事项标记为建议优先保存", () => {
    const reqs = requirementsForChange("HR 要求我今天签协议", "entry1", DATE);
    expect(reqs.some((r) => r.priority)).toBe(true);
  });

  it("工资类材料只建议当月缺失的时间段", () => {
    const reqs = requirementsForChange("这个月工资好像没发", "entry1", DATE);
    const salary = reqs.find((r) => r.type === "salary");
    expect(salary?.coverageStart).toBe("2026-10-01");
    expect(salary?.coverageEnd).toBe("2026-10-31");
  });

  it("普通工作日不产生任何收集任务", () => {
    expect(requirementsForChange("今天挺正常的", "entry1", DATE)).toEqual([]);
  });
});

describe("数据迁移", () => {
  it("v1 数据补齐每日记录的 conversationId / eventIds / suggestionIds", () => {
    const legacy = {
      onboarded: true,
      entries: [{ id: "entry1", date: DATE, content: "旧日记", tags: [] }],
      events: [
        { id: "e1", sourceId: "entry1", title: "旧事件" },
        { id: "e2", sourceId: "other", title: "别的事件" },
      ],
      suggestions: [{ id: "s1", eventId: "e1", title: "旧建议" }],
      messages: [
        {
          id: "msg1",
          role: "user",
          content: "旧消息",
          conversationId: "default",
        },
      ],
    } as unknown as Partial<AppData>;

    const data = migrateData(legacy);
    expect(data.entries[0].conversationId).toBe(`conv-${DATE}`);
    expect(data.entries[0].eventIds).toEqual(["e1"]);
    expect(data.entries[0].suggestionIds).toEqual(["s1"]);
    // 旧消息挂到对应日期的记录上，并补上状态
    expect(data.messages[0].dailyEntryId).toBe("entry1");
    expect(data.messages[0].status).toBe("sent");
    // 未提供的新字段回落到默认值
    expect(data.materials).toEqual([]);
    expect(data.mockConfig.delayMs).toBeGreaterThan(0);
  });

  it("v2 数据补齐留痕建议的 entryId，让建议能挂在某一天上", () => {
    const legacy = {
      onboarded: true,
      entries: [
        {
          id: "entry1",
          date: DATE,
          content: "旧日记",
          tags: [],
          conversationId: `conv-${DATE}`,
          eventIds: [],
          suggestionIds: ["s1"],
        },
      ],
      // 没有 eventId、也没有 entryId 的老建议
      suggestions: [{ id: "s1", type: "notice", title: "待签文件" }],
      messages: [],
    } as unknown as Partial<AppData>;

    const data = migrateData(legacy);
    expect(data.suggestions[0].entryId).toBe("entry1");
  });

  it("空数据不会抛错", () => {
    expect(migrateData(undefined).entries).toEqual([]);
    expect(migrateData({}).messages).toEqual([]);
    expect(migrateData({}).suggestions).toEqual([]);
  });
});
