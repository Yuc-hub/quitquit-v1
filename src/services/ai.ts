import type {
  DailyStatusInput,
  EventInput,
  Material,
  MockConfig,
  Mood,
  WorkEvent,
} from "../types";
import { MOODS, addDays, today } from "../constants";
import { callModel, modelReady } from "./model";
import {
  matchingMaterials,
  requirementsForChange,
  type MaterialRequirement,
} from "./materials";

/**
 * 这里是**模拟实现**。所有输出都来自本地规则模板，
 * 不是真实模型分析，界面上会统一标注「模拟 AI」。
 * 后续接入真实模型时，替换本文件即可，`aiService` 的签名保持不变。
 */
export const simulate = async (config: MockConfig) => {
  await new Promise((r) => setTimeout(r, Math.max(0, config.delayMs)));
  if (config.failNext)
    throw new Error("模拟服务暂时没有回应，你的输入仍然保留。请重试。");
};

/** 从一段自然语言里识别出值得记录的候选事件；纯情绪表达返回 null */
export function detectEvent(
  content: string,
  sourceType: EventInput["sourceType"],
  sourceId?: string,
  date = today(),
): EventInput | null {
  let title = "";
  let attention: EventInput["attention"] = "watch";
  if (/项目.{0,16}(交给|给了|给一个|转给|移交|换给).{0,12}(新人|同事|别人|其他人)|(?:新人|同事|别人|其他人).{0,12}接手.{0,12}项目/.test(content))
    title = "项目交接变化";
  else if (/会议.*取消|取消.*会议/.test(content)) title = "会议安排变化";
  else if (/移出|项目群/.test(content)) title = "项目群成员变化";
  else if (/协议|签文件|签离职|签署/.test(content)) {
    title = "被要求签署文件";
    attention = /今天|当天|立即/.test(content) ? "priority" : "watch";
  } else if (/解除|辞退/.test(content)) {
    title = "收到解除沟通";
    attention = "priority";
  } else if (/调岗|停职/.test(content)) title = "工作安排调整";
  else if (/降薪|扣工资|拖欠工资|没发工资/.test(content)) {
    title = "薪酬发放变化";
    attention = "priority";
  } else if (/绩效下降|绩效被改|突然差评|考核不合格/.test(content)) title = "绩效评价变化";
  else if (/权限被收回|账号被停用|系统访问被取消/.test(content)) {
    title = "工作系统权限变化";
    attention = "priority";
  } else if (/被排除.*会议|不让我参加.*会议|不再安排工作|工作被移交/.test(content)) title = "工作参与情况变化";
  else if (/工资.*异常|工资.*没|欠薪|考勤/.test(content))
    title = "工资或考勤情况待核对";
  else if (/完成项目|表扬|绩效.*正常/.test(content)) {
    title = "工作中的积极进展";
    attention = "normal";
  } else if (/项目.*变化|项目.*调整/.test(content)) title = "项目安排变化";
  else if (/HR|人事/.test(content)) title = "HR 沟通记录";
  if (!title) return null;
  return {
    title,
    occurredAt: date,
    description: content,
    people: [],
    attention,
    sourceType,
    sourceId,
  };
}

export type Intent = "emotion" | "materials" | "urgent" | "event" | "smalltalk";

const EMOTION =
  /累|烦|难受|焦虑|委屈|开心|还行|撑不住|emo|心累|压力大|不想上班/;
const MATERIALS = /留什么|留点|保存什么|要保存|该保存|材料|证据|收集|截图/;
const URGENT =
  /今天签|当天签|立即签|今天就签|要求今天|今天离职|被通知解除|马上签|今天就办/;
/** 时间说得不确定，才需要补问一句 */
const VAGUE_TIME = /前几天|前阵子|上周|上个月|之前|某天|有段时间/;

/** 判断用户这句话想做什么，决定 AI 的回应方式 */
export function classifyIntent(text: string): Intent {
  if (URGENT.test(text)) return "urgent";
  if (MATERIALS.test(text)) return "materials";
  if (detectEvent(text, "chat")) return "event";
  if (EMOTION.test(text)) return "emotion";
  return "smalltalk";
}

/** 从「涉及主管、和 HR」这类说法里抽出人物 */
export function parsePeople(text: string): string[] {
  const mentioned = text.match(/(?:涉及|和|跟(?!进)|与)([^，。,；;]+)/)?.[1];
  return Array.from(
    new Set(
      [
        ...(mentioned ? mentioned.split(/[、,，和及]/).map((s) => s.trim()) : []),
        ...["老板", "主管", "HR", "新人"].filter((role) => text.includes(role)),
      ].filter(Boolean),
    ),
  );
}

/**
 * 尽量用已有信息推断日期，**能推断就不补问**。
 * 说不清才返回 null，由调用方决定是否澄清。
 */
export function resolveDate(text: string, fallback: string): string | null {
  const iso = text.match(/\b(20\d{2})[-/年](\d{1,2})[-/月](\d{1,2})日?\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const monthDay = text.match(/(\d{1,2})月(\d{1,2})日/);
  if (monthDay) return `${fallback.slice(0, 4)}-${monthDay[1].padStart(2, "0")}-${monthDay[2].padStart(2, "0")}`;
  if (/今天|当天|刚刚|刚才/.test(text)) return fallback;
  if (/昨天|昨日/.test(text)) return addDays(fallback, -1);
  if (/前天/.test(text)) return addDays(fallback, -2);
  if (VAGUE_TIME.test(text)) return null;
  // 没提时间：默认就用这一天的记录日期
  return fallback;
}

export interface AssistantContext {
  /** 当前记录的日期 */
  date: string;
  /** 当前每日记录 id，作为候选事件与留痕建议的来源 */
  entryId: string;
  /** 当天全部用户原文（含本条） */
  userText: string;
  /** 当天已确认的事件 */
  confirmedEvents: WorkEvent[];
  /** 当天已有的草稿标题，避免重复生成同一候选 */
  draftTitles: string[];
  materials: Material[];
  history?: { role: "user" | "assistant"; content: string }[];
  activeDraft?: WorkEvent;
}

/** 只有明确补充了时间、人物或沟通方式，才把后续聊天写入待确认事件。 */
export function isEventFollowup(text: string): boolean {
  return /今天|昨天|前天|\d{1,2}月\d{1,2}日|20\d{2}-\d{1,2}-\d{1,2}|老板|主管|HR|新人|同事|口头|会议|微信|邮件|消息|电话|通知|交接|提前|交给|接手|安排/.test(text);
}

export function buildConversationSystemPrompt(text: string, ctx: AssistantContext, reply: AssistantReply): string {
  const mode = reply.emergency
    ? "这次涉及时间敏感的明确事项：先回应情绪，再简短说明可以核对事实；可以提醒保存原件和寻求专业帮助。"
    : reply.clarify
      ? "用户说了一件具体的事，但时间还不清楚。先回应他，再自然地问一个大概日期；不要把时间猜成事实。"
      : classifyIntent(text) === "materials"
      ? "用户在问材料：先回应其担忧，再回答所问，只列可能相关的材料。"
      : "这是日常对话：主要任务是陪用户说清感受。事件草稿会在独立卡片中显示，你不要在聊天气泡里重复日期、事件摘要、保存材料清单或风险推演。";
  return `你是职场日记里正在和用户聊天的中文陪伴助手。${mode}\n请认真听当前这句话，不要套用“辛苦了、确实容易不安和失落、可以先把事实记下来、今天做一件小事”的固定模板。用户没有说出某种情绪时，不要替他断定；可以用“这变化来得突然”等贴近原话的观察，再邀请他讲讲当时的感受或最在意的部分。一次只问一个自然的问题；用户不想回答时可以继续陪他说。回复控制在2到4句话，像真实聊天，不用标题、加粗、日期清单或条款。不要编造动机、法律结论，也不要鼓励辞职。只有用户主动问证据、出现明确的签署/解除/降薪/停用权限等紧急信号时，才在对话里简短谈材料和专业协助。当前记录日期：${ctx.date}。${ctx.activeDraft ? `待确认草稿：${ctx.activeDraft.title}。用户可能在补充它；不要说它已经确认。` : ""}`;
}

export interface AssistantReply {
  content: string;
  /** 需要用户确认的事件草稿。一般候选进「今日整理」，不必当场确认。 */
  candidateEvent?: EventInput;
  /** 这条草稿值得及时关注，在对话里给一张轻量卡片 */
  noteworthy?: boolean;
  /** 时间说不清，先补问一句 */
  clarify?: EventInput;
  /** 留痕建议（已按库存去重，只包含确实缺失的） */
  requirements?: MaterialRequirement[];
  /** 时间敏感，展示「整理当前情况」卡片 */
  emergency?: boolean;
  /** 已确认事件被补充，建议追加进展 */
  updateSuggestionEventId?: string;
}

/**
 * 用户问「该保存什么」时的基础清单。
 * 判断依据是当天全部原文加上当前这条消息——用户可能先说了情况再问该留什么。
 */
function baseRequirements(
  ctx: AssistantContext,
  text: string,
): MaterialRequirement[] {
  const haystack = `${ctx.userText} ${text}`;
  const list: MaterialRequirement[] = [
    {
      type: "contract",
      entryId: ctx.entryId,
      title: "当前有效劳动合同",
      reason: "用于确认劳动关系与岗位信息。",
      currentOnly: true,
    },
    {
      type: "salary",
      entryId: ctx.entryId,
      title: "最近一个月工资记录",
      reason: "便于核对发放情况，只补缺失的月份。",
    },
  ];
  if (/HR|人事|谈话|沟通/.test(haystack))
    list.push({
      type: "hr",
      entryId: ctx.entryId,
      title: "本次 HR 沟通记录",
      reason: "沟通内容建议保留原始记录。",
    });
  if (/考勤|打卡|加班/.test(haystack))
    list.push({
      type: "attendance",
      entryId: ctx.entryId,
      title: "相关考勤记录",
      reason: "考勤与工作时长建议留一份原始记录。",
    });
  if (/项目群|移出|群聊/.test(haystack))
    list.push({
      type: "project",
      entryId: ctx.entryId,
      title: "群聊变化记录",
      reason: "群成员或权限变化建议截图留存。",
    });
  return list;
}

/**
 * 根据用户输入生成结构化回应。
 *
 * 设计原则是**减少打扰**：
 * - 默认使用已有信息（日期默认就是这一天，人物从原话里抽），能整理就直接整理；
 * - 只有时间确实说不清（「前几天」）才补问一句；
 * - 一般候选直接进「今日整理」，不弹表单、不要求当场确认；
 * - 值得及时关注的变化才在对话里给一张轻量卡片。
 */
export function buildReply(text: string, ctx: AssistantContext): AssistantReply {
  const intent = classifyIntent(text);

  if (intent === "urgent") {
    return {
      content:
        "听起来这件事在时间上比较紧。我不会替你判断对错，但可以帮你把已知事实整理下来。要不要现在整理一下当前情况？一步一步来，整理完可以回到今天的记录。",
      emergency: true,
    };
  }

  if (intent === "materials") {
    const requirements = baseRequirements(ctx, text);
    const existing = requirements
      .filter((r) => matchingMaterials(r, ctx.materials).length > 0)
      .map((r) => matchingMaterials(r, ctx.materials)[0].name);
    const lines: string[] = ["我先查了你的材料库。"];
    lines.push(
      existing.length
        ? `已有：${Array.from(new Set(existing)).join("、")}，这些不需要重复处理。`
        : "材料库里暂时没有可以直接复用的材料。",
    );
    return {
      content: `${lines.join("")}\n下面只列出可能缺失的部分，按你知道的情况保存就好，不必勉强。`,
      requirements,
    };
  }

  const detected = detectEvent(text, "chat", ctx.entryId, ctx.date);

  if (detected) {
    // 已确认事件被新消息补充 → 建议追加进展，而不是新建重复事件
    const related = ctx.confirmedEvents.find((e) => e.title === detected.title);
    if (related) {
      return {
        content: `你提到的这件事，和已经记录的「${related.title}」看起来是同一件。要不要把这次的补充作为进展追加进去？我不会自动改写已确认的内容。`,
        updateSuggestionEventId: related.id,
      };
    }
    // 时间说不清才补问，其余一律先用已有信息整理
    const occurredAt = resolveDate(text, ctx.date);
    if (!occurredAt) {
      return {
        content:
          "这件事大概发生在哪一天？说个大概就行（例如「昨天」「就按今天」），我按你说的记。",
        clarify: detected,
      };
    }
    const draft: EventInput = {
      ...detected,
      occurredAt,
      dateWasInferred: !/今天|当天|刚刚|刚才|昨天|昨日|前天|\d{1,2}月\d{1,2}日|20\d{2}[-/年]\d{1,2}/.test(text),
      people: parsePeople(text),
    };
    const requirements = requirementsForChange(
      `${ctx.userText} ${text}`,
      ctx.entryId,
      ctx.date,
    );
    if (ctx.draftTitles.includes(detected.title)) {
      return {
        content:
          "这件事今天已经有一条在「今日整理」里了，我不再重复生成。需要的话可以在那里确认或编辑。",
        requirements,
      };
    }
    const noteworthy = draft.attention !== "normal";
    return {
      content: detected.title === "项目交接变化"
        ? "你一直在跟进这个项目，今天却突然交给了新人。这样的变化可能让人一时有很多话想说。你愿意聊聊，当时最让你在意的是什么？"
        : noteworthy
          ? "这件事听起来来得有点突然。你想先说说当时发生了什么、自己怎么想的吗？我在听。"
          : "听到了。你想再聊聊这件事对你意味着什么吗？",
      candidateEvent: draft,
      noteworthy,
      requirements,
    };
  }

  if (intent === "emotion") {
    return {
      content:
        "听起来今天挺消耗的。不需要每一次都发生特别的事，我会把你说的记在这里。想继续说也可以。",
    };
  }

  return {
    content:
      "我记下了。如果愿意，可以再说得具体一点，比如发生了什么、涉及谁、大概什么时候。",
  };
}

/** 用当天的状态与用户原文生成一段模拟总结（与原文分开保存） */
export function buildSummary(
  status: Partial<DailyStatusInput>,
  userText: string,
): string {
  const parts: string[] = [];
  if (status.mood)
    parts.push(`今天的你感到${MOODS[status.mood as Mood].label}`);
  const head = parts.length ? `${parts.join("，")}。` : "";
  const body = userText
    ? "已按关键词整理候选事件，请核对原文后再确认。"
    : "不需要每一天都发生特别的事，记录感受本身也有意义。";
  return `模拟 AI：${head}愿记录帮你看见自己的节奏。${body}`;
}

export const aiService = {
  async reply(text: string, ctx: AssistantContext, config: MockConfig) {
    if (!modelReady()) {
      await simulate(config);
      return buildReply(text, ctx);
    }
    const structured = buildReply(text, ctx);
    const highRisk = /自杀|自残|不想活|结束生命|伤害自己|活不下去/.test(text);
    if (highRisk) return {
      content: "听起来你现在很痛苦。你现在是否安全？如果可能伤害自己，请马上联系当地紧急服务，或请身边信任的人陪着你。我们可以先只关注接下来的几分钟。",
    };
    const system = buildConversationSystemPrompt(text, ctx, structured);
    const content = await callModel([
      { role: "system", content: system },
      ...(ctx.history || []).slice(-10),
      { role: "user", content: text },
    ]);
    return { ...structured, content };
  },
  async summarize(
    status: Partial<DailyStatusInput>,
    userText: string,
    config: MockConfig,
  ) {
    if (!modelReady()) {
      await simulate(config);
      return buildSummary(status, userText);
    }
    return callModel([
      { role: "system", content: "请用中文把用户的每日情况整理为不超过120字的中性摘要。区分感受和事实，不推断法律风险，不添加用户未说的事，不把情绪当作事件。" },
      { role: "user", content: `心情：${status.mood ? MOODS[status.mood].label : "未选"}\n原文：${userText || "未填写"}` },
    ]);
  },
  async extract(file: File, config: MockConfig) {
    if (modelReady()) {
      if (!/\.(txt|pdf)$/i.test(file.name)) throw new Error("目前真实 AI 支持 TXT 和可复制文字的 PDF；图片请核对原件并手动填写摘要。");
      const source = /\.pdf$/i.test(file.name) ? await (await import("./pdfText")).extractPdfText(file) : (await file.text()).slice(0, 12000);
      if (!source.trim()) throw new Error("文件中没有可提取的文字；扫描件请核对原件并手动填写摘要。");
      return callModel([
        { role: "system", content: "请用中文整理材料中的日期、人物、事项和待核对点。只根据原文，不编造；不提供法律结论。开头注明“AI 整理草稿，需核对原件”。" },
        { role: "user", content: `文件：${file.name}\n${source}` },
      ]);
    }
    await simulate(config);
    if (file.name.toLowerCase().endsWith(".txt")) {
      const text = await file.text();
      return `模拟提取结果 · TXT 原文节选（最多 1200 字，未核实）\n${text.slice(0, 1200)}`;
    }
    return `模拟提取结果：已接收文件「${file.name}」。当前演示不读取图片或 PDF 中的人物与事实，请查看原文件并手动填写摘要。`;
  },
};
