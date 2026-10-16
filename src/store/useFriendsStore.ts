import { create } from "zustand";
import { clearFriendToken, friendsApi, getFriendToken, setFriendToken, type FriendAccount, type SharedDay } from "../services/friends";
import type { Mood } from "../types";

interface FriendsStore {
  account: FriendAccount | null;
  days: SharedDay[];
  error: string;
  loading: boolean;
  refresh: () => Promise<void>;
  loadMonth: (month: string) => Promise<void>;
  register: (name: string) => Promise<void>;
  restore: (token: string) => Promise<void>;
  invite: (code: string) => Promise<void>;
  respond: (id: string, action: "accept" | "reject") => Promise<void>;
  remove: (id: string) => Promise<void>;
  publish: (date: string, mood: Mood | null, note: string, workStatus: string) => Promise<void>;
  unpublish: (date: string) => Promise<void>;
  forget: () => void;
  deleteAccount: () => Promise<void>;
}

const errorText = (error: unknown) => error instanceof Error ? error.message : "共享操作失败。";
export const useFriendsStore = create<FriendsStore>((set, get) => ({
  account: null,
  days: [],
  error: "",
  loading: false,
  refresh: async () => {
    if (!getFriendToken()) { set({ account: null, days: [], error: "" }); return; }
    set({ loading: true, error: "" });
    try { set({ account: await friendsApi.me() }); }
    catch (error) { set({ account: null, error: errorText(error) }); }
    finally { set({ loading: false }); }
  },
  loadMonth: async (month) => {
    if (!getFriendToken()) { set({ days: [] }); return; }
    try { set({ days: (await friendsApi.feed(month)).days, error: "" }); }
    catch (error) { set({ days: [], error: errorText(error) }); }
  },
  register: async (name) => {
    const result = await friendsApi.register(name);
    setFriendToken(result.token);
    await get().refresh();
  },
  restore: async (token) => {
    const account = await friendsApi.me(token.trim());
    setFriendToken(token.trim());
    set({ account, error: "" });
  },
  invite: async (code) => { await friendsApi.invite(code); await get().refresh(); },
  respond: async (id, action) => { await friendsApi.respond(id, action); await get().refresh(); },
  remove: async (id) => { await friendsApi.remove(id); await get().refresh(); },
  publish: async (date, mood, note, workStatus) => {
    await friendsApi.publish(date, mood, note, workStatus);
    await get().loadMonth(date.slice(0, 7));
  },
  unpublish: async (date) => {
    await friendsApi.unpublish(date);
    await get().loadMonth(date.slice(0, 7));
  },
  forget: () => { clearFriendToken(); set({ account: null, days: [], error: "" }); },
  deleteAccount: async () => { await friendsApi.deleteAccount(); get().forget(); },
}));
