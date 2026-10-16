import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const DB_PATH = resolve(process.env.FRIEND_DB_PATH || ".local/friend-sharing.json");
const moods = new Set(["happy", "okay", "neutral", "tired", "angry", "anxious", "sad"]);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const code = () => randomBytes(6).toString("hex").toUpperCase();
const readDb = async () => {
  try { return JSON.parse(await readFile(DB_PATH, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT") return { users: [], invitations: [], days: [] };
    throw error;
  }
};
const saveDb = async (db) => {
  await mkdir(dirname(DB_PATH), { recursive: true });
  const tmp = `${DB_PATH}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
  await rename(tmp, DB_PATH);
};
const respond = (res, status, value) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(value));
};
const body = async (req) => {
  let text = "";
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 8192) throw new Error("请求内容过长。");
  }
  return text ? JSON.parse(text) : {};
};
const publicUser = (user) => ({ id: user.id, name: user.name, friendCode: user.friendCode });

let pending = Promise.resolve();

export function handleShareApi(req, res, next) {
  if (!req.url?.startsWith("/api/friends")) return next();
  const operation = pending.then(() => runShareApi(req, res));
  pending = operation.catch(() => {});
}

async function runShareApi(req, res) {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    const db = await readDb();
    if (path === "/api/friends/register" && req.method === "POST") {
      const { name } = await body(req);
      if (typeof name !== "string" || !name.trim() || name.trim().length > 24) return respond(res, 400, { error: "请填写 1–24 字的显示名称。" });
      const token = randomBytes(32).toString("base64url");
      let friendCode = code();
      while (db.users.some((u) => u.friendCode === friendCode)) friendCode = code();
      const user = { id: randomUUID(), name: name.trim(), tokenHash: hash(token), friendCode, friendIds: [] };
      db.users.push(user);
      await saveDb(db);
      return respond(res, 201, { token, user: publicUser(user) });
    }
    const link = path.match(/^\/api\/friends\/invite-links\/([A-Za-z0-9_-]+)$/);
    if (link && req.method === "GET") {
      const item = db.invitations.find((i) => i.linkHash === hash(link[1]) && i.status === "pending" && Date.parse(i.expiresAt) > Date.now());
      const from = item && db.users.find((u) => u.id === item.fromId);
      if (!from) return respond(res, 404, { error: "邀请链接无效或已过期。" });
      return respond(res, 200, { from: { name: from.name }, expiresAt: item.expiresAt });
    }
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    const user = token && db.users.find((u) => u.tokenHash === hash(token));
    if (!user) return respond(res, 401, { error: "共享身份无效，请使用恢复码重新连接。" });

    if (path === "/api/friends/me" && req.method === "DELETE") {
      db.users = db.users.filter((u) => u.id !== user.id).map((u) => ({ ...u, friendIds: u.friendIds.filter((id) => id !== user.id) }));
      db.invitations = db.invitations.filter((i) => i.fromId !== user.id && i.toId !== user.id);
      db.days = db.days.filter((item) => item.userId !== user.id);
      await saveDb(db);
      return respond(res, 200, { ok: true });
    }

    if (path === "/api/friends/me" && req.method === "GET") {
      return respond(res, 200, {
        user: publicUser(user),
        friends: db.users.filter((u) => user.friendIds.includes(u.id)).map(publicUser),
        incoming: db.invitations.filter((i) => i.toId === user.id && i.status === "pending").map((i) => ({ id: i.id, from: publicUser(db.users.find((u) => u.id === i.fromId)) })),
        outgoing: db.invitations.filter((i) => i.fromId === user.id && i.status === "pending").map((i) => ({ id: i.id, to: publicUser(db.users.find((u) => u.id === i.toId)) })),
      });
    }
    if (path === "/api/friends/invite-links" && req.method === "POST") {
      const linkToken = randomBytes(32).toString("base64url");
      db.invitations.push({ id: randomUUID(), fromId: user.id, toId: null, status: "pending", linkHash: hash(linkToken), expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() });
      await saveDb(db);
      return respond(res, 201, { linkToken });
    }
    if (link && req.method === "POST") {
      const item = db.invitations.find((i) => i.linkHash === hash(link[1]) && i.status === "pending" && Date.parse(i.expiresAt) > Date.now());
      const from = item && db.users.find((u) => u.id === item.fromId);
      if (!from) return respond(res, 404, { error: "邀请链接无效或已过期。" });
      if (from.id === user.id) return respond(res, 400, { error: "不能接受自己的邀请。" });
      if (user.friendIds.includes(from.id)) return respond(res, 409, { error: "你们已经是好友。" });
      item.status = "accepted";
      item.toId = user.id;
      user.friendIds.push(from.id);
      from.friendIds.push(user.id);
      await saveDb(db);
      return respond(res, 200, { ok: true });
    }
    if (path === "/api/friends/invitations" && req.method === "POST") {
      const { friendCode } = await body(req);
      const target = db.users.find((u) => u.friendCode === String(friendCode || "").trim().toUpperCase());
      if (!target) return respond(res, 404, { error: "找不到这个好友码。" });
      if (target.id === user.id) return respond(res, 400, { error: "不能添加自己。" });
      if (user.friendIds.includes(target.id)) return respond(res, 409, { error: "你们已经是好友。" });
      if (db.invitations.some((i) => i.fromId === user.id && i.toId === target.id && i.status === "pending")) return respond(res, 409, { error: "申请已发送，等待对方接受。" });
      db.invitations.push({ id: randomUUID(), fromId: user.id, toId: target.id, status: "pending" });
      await saveDb(db);
      return respond(res, 201, { ok: true });
    }
    const invite = path.match(/^\/api\/friends\/invitations\/([^/]+)\/(accept|reject)$/);
    if (invite && req.method === "POST") {
      const item = db.invitations.find((i) => i.id === invite[1] && i.toId === user.id && i.status === "pending");
      if (!item) return respond(res, 404, { error: "申请不存在或已处理。" });
      item.status = invite[2] === "accept" ? "accepted" : "rejected";
      if (item.status === "accepted") {
        const other = db.users.find((u) => u.id === item.fromId);
        user.friendIds = [...new Set([...user.friendIds, other.id])];
        other.friendIds = [...new Set([...other.friendIds, user.id])];
      }
      await saveDb(db);
      return respond(res, 200, { ok: true });
    }
    const friendship = path.match(/^\/api\/friends\/connections\/([^/]+)$/);
    if (friendship && req.method === "DELETE") {
      const other = db.users.find((u) => u.id === friendship[1] && user.friendIds.includes(u.id));
      if (!other) return respond(res, 404, { error: "好友不存在。" });
      user.friendIds = user.friendIds.filter((id) => id !== other.id);
      other.friendIds = other.friendIds.filter((id) => id !== user.id);
      await saveDb(db);
      return respond(res, 200, { ok: true });
    }
    const day = path.match(/^\/api\/friends\/days\/(\d{4}-\d{2}-\d{2})$/);
    if (day && req.method === "PUT") {
      const data = await body(req);
      if (data.mood != null && !moods.has(data.mood)) return respond(res, 400, { error: "心情值无效。" });
      if (typeof data.note !== "string" || data.note.length > 280) return respond(res, 400, { error: "公开的一句话不能超过 280 字。" });
      if (typeof data.workStatus !== "string" || data.workStatus.length > 140) return respond(res, 400, { error: "公开的工作状况不能超过 140 字。" });
      db.days = db.days.filter((item) => !(item.userId === user.id && item.date === day[1]));
      db.days.push({ userId: user.id, date: day[1], mood: data.mood || null, note: data.note.trim(), workStatus: data.workStatus.trim(), updatedAt: new Date().toISOString() });
      await saveDb(db);
      return respond(res, 200, { ok: true });
    }
    if (day && req.method === "DELETE") {
      db.days = db.days.filter((item) => !(item.userId === user.id && item.date === day[1]));
      await saveDb(db);
      return respond(res, 200, { ok: true });
    }
    if (path === "/api/friends/feed" && req.method === "GET") {
      const month = new URL(req.url, "http://localhost").searchParams.get("month");
      if (!/^\d{4}-\d{2}$/.test(month || "")) return respond(res, 400, { error: "月份无效。" });
      const allowed = new Set([...user.friendIds, user.id]);
      return respond(res, 200, { days: db.days.filter((item) => item.date.startsWith(month) && allowed.has(item.userId)).map((item) => ({ ...item, user: publicUser(db.users.find((u) => u.id === item.userId)) })) });
    }
    return respond(res, 404, { error: "接口不存在。" });
  } catch (error) {
    return respond(res, 500, { error: error.message || "共享服务暂时不可用。" });
  }
}
