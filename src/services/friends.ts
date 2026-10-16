import type { Mood } from "../types";

export interface SharedUser { id: string; name: string; friendCode: string }
export interface SharedDay { userId: string; date: string; mood: Mood | null; note: string; workStatus?: string; user: SharedUser; updatedAt: string }
export interface FriendAccount {
  user: SharedUser;
  friends: SharedUser[];
  incoming: { id: string; from: SharedUser }[];
  outgoing: { id: string; to: SharedUser }[];
}

const TOKEN_KEY = "workday-friend-recovery-code-v1";
export const getFriendToken = () => localStorage.getItem(TOKEN_KEY) || "";
export const setFriendToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const clearFriendToken = () => localStorage.removeItem(TOKEN_KEY);

async function request<T>(path: string, method = "GET", data?: unknown, token = getFriendToken()): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/friends${path}`, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(data ? { "Content-Type": "application/json" } : {}) },
      body: data ? JSON.stringify(data) : undefined,
    });
  } catch {
    throw new Error("好友共享服务不可用，请确认本项目服务仍在运行。");
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `共享服务返回 ${response.status}`);
  return result as T;
}

export const friendsApi = {
  register: (name: string) => request<{ token: string; user: SharedUser }>("/register", "POST", { name }, ""),
  me: (token?: string) => request<FriendAccount>("/me", "GET", undefined, token),
  deleteAccount: () => request<{ ok: true }>("/me", "DELETE"),
  invite: (friendCode: string) => request<{ ok: true }>("/invitations", "POST", { friendCode }),
  createInviteLink: () => request<{ linkToken: string }>("/invite-links", "POST"),
  getInviteLink: (token: string) => request<{ from: { name: string }; expiresAt: string }>(`/invite-links/${encodeURIComponent(token)}`),
  acceptInviteLink: (token: string) => request<{ ok: true }>(`/invite-links/${encodeURIComponent(token)}`, "POST"),
  respond: (id: string, action: "accept" | "reject") => request<{ ok: true }>(`/invitations/${encodeURIComponent(id)}/${action}`, "POST"),
  remove: (id: string) => request<{ ok: true }>(`/connections/${encodeURIComponent(id)}`, "DELETE"),
  feed: (month: string) => request<{ days: SharedDay[] }>(`/feed?month=${encodeURIComponent(month)}`),
  publish: (date: string, mood: Mood | null, note: string, workStatus: string) => request<{ ok: true }>(`/days/${date}`, "PUT", { mood, note, workStatus }),
  unpublish: (date: string) => request<{ ok: true }>(`/days/${date}`, "DELETE"),
};
