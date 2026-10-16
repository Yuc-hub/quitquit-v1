import { useEffect, useState } from "react";
import { useFriendsStore } from "../store/useFriendsStore";
import type { Mood } from "../types";
import { Button, SectionTitle, useToast } from "./ui";

export function FriendDayShare({ date, mood }: { date: string; mood: Mood | null }) {
  const toast = useToast();
  const { account, days, refresh, loadMonth, publish, unpublish } = useFriendsStore();
  const shared = days.find(day => day.date === date && day.userId === account?.user.id);
  const [note, setNote] = useState("");
  const [workStatus, setWorkStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { void refresh(); void loadMonth(date.slice(0, 7)); }, [date, refresh, loadMonth]);
  useEffect(() => { setNote(shared?.note || ""); }, [shared?.note]);
  useEffect(() => { setWorkStatus(shared?.workStatus || ""); }, [shared?.workStatus]);
  const act = async (work: () => Promise<void>, message: string) => {
    setBusy(true); setError("");
    try { await work(); toast(message); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <section className="panel stack" aria-label="分享给好友">
    <SectionTitle title="分享给好友" subtitle="仅分享你主动填写并确认的心情、公开一句话和工作状况。" />
    {!account ? <div className="stack-sm"><p className="small muted">建立共享身份并互相加好友后，可以在回顾里看到彼此的心情。</p><Button size="sm" to="/friends">去添加好友</Button></div> : <>
      <div className="field"><label className="label" htmlFor={`friend-note-${date}`}>公开的一句话（可选）</label><textarea id={`friend-note-${date}`} className="input min-h-16" maxLength={280} value={note} onChange={e => setNote(e.target.value)} placeholder="只写愿意让好友看到的内容；完整日记不会同步" /></div>
      <div className="field"><label className="label" htmlFor={`friend-work-${date}`}>公开的工作状况（可选）</label><input id={`friend-work-${date}`} className="input" maxLength={140} value={workStatus} onChange={e => setWorkStatus(e.target.value)} placeholder="例如：项目推进中；不会从日记自动提取" /></div>
      <p className="small muted">{shared ? "这一天已分享。修改后需再次点击更新。" : "这一天还没有分享。"} 当前好友：{account.friends.length} 人。</p>
      <div className="button-row"><Button size="sm" disabled={busy || (!mood && !note.trim() && !workStatus.trim())} onClick={() => void act(() => publish(date, mood, note, workStatus), shared ? "共享内容已更新" : "已分享给好友")}>{shared ? "更新分享" : "分享这一天"}</Button>{shared && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(() => unpublish(date), "已停止分享这一天")}>停止分享</Button>}</div>
      {error && <p className="error" role="alert">{error}</p>}
    </>}
  </section>;
}
