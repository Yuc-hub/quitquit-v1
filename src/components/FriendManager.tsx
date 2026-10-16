import { useEffect, useState } from "react";
import { useFriendsStore } from "../store/useFriendsStore";
import { friendsApi, getFriendToken } from "../services/friends";
import { Button, ConfirmDialog, SectionTitle, useToast } from "./ui";

export function FriendManager() {
  const toast = useToast();
  const { account, error, loading, refresh, register, restore, remove, deleteAccount } = useFriendsStore();
  const [name, setName] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [recovery, setRecovery] = useState("");
  const [showRecovery, setShowRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  useEffect(() => { void refresh(); }, [refresh]);
  const act = async (work: () => Promise<void>, success: string) => {
    setBusy(true); setMessage("");
    try { await work(); setMessage(success); toast(success); }
    catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  };
  const makeLink = () => void act(async () => {
    const { linkToken } = await friendsApi.createInviteLink();
    setInviteLink(`${window.location.origin}/friends/invite/${linkToken}`);
  }, "邀请链接已生成，发给你信任的朋友即可");

  return <div className="card stack" data-testid="friend-manager">
    <SectionTitle title="好友互记" subtitle="发送邀请链接；对方打开并同意后，双方才可互看主动分享的心情和公开一句话。" />
    {!account ? <div className="stack-sm">
      <p className="small muted">先创建共享身份，再生成邀请链接。完整日记、聊天、事件和材料默认不会共享。</p>
      <div className="field"><label className="label" htmlFor="friend-name">显示名称</label><input id="friend-name" className="input" maxLength={24} value={name} onChange={e => setName(e.target.value)} placeholder="好友看到的称呼" /></div>
      <Button disabled={busy || !name.trim()} onClick={() => void act(() => register(name), "共享身份已创建")}>创建共享身份</Button>
      <div className="divider pt-3 stack-sm">
        <p className="small muted">换浏览器时，使用原来的恢复码继续同一个身份。</p>
        <div className="field"><label className="label" htmlFor="friend-recovery">恢复码</label><input id="friend-recovery" className="input" type="password" autoComplete="off" value={recovery} onChange={e => setRecovery(e.target.value)} /></div>
        <Button disabled={busy || !recovery.trim()} onClick={() => void act(() => restore(recovery), "已恢复共享身份")}>恢复身份</Button>
      </div>
    </div> : <div className="stack">
      <div className="stack-sm"><p className="font-medium">{account.user.name}</p><p className="faint">链接有效期为 7 天，每个链接只能接受一次。好友需要能访问同一个项目服务。</p></div>
      <div className="button-row"><Button disabled={busy} onClick={makeLink}>生成邀请链接</Button><Button disabled={busy || loading} onClick={() => void refresh()}>刷新好友</Button></div>
      {inviteLink && <div className="field"><label className="label" htmlFor="friend-invite-link">邀请链接</label><input id="friend-invite-link" className="input" readOnly value={inviteLink} onFocus={e => e.target.select()} /><Button size="sm" onClick={() => void act(async () => { await navigator.clipboard.writeText(inviteLink); }, "链接已复制")}>复制链接</Button></div>}
      <div className="divider pt-3 stack-sm"><p className="font-medium">我的好友</p>{account.friends.length ? account.friends.map(friend => <div key={friend.id} className="list-row"><span>{friend.name}</span><Button size="sm" variant="ghost" onClick={() => setRemoveId(friend.id)}>解除好友</Button></div>) : <p className="small muted">还没有好友。添加后可在回顾日历看到彼此分享的心情。</p>}</div>
      <div className="divider pt-3 stack-sm"><p className="font-medium">恢复与隐私</p><p className="small muted">恢复码可让持有者在其他浏览器访问你的共享身份，请像密码一样保管。</p><div className="button-row"><Button size="sm" onClick={() => setShowRecovery(!showRecovery)}>{showRecovery ? "隐藏恢复码" : "查看恢复码"}</Button><Button size="sm" variant="danger" onClick={() => setDeleteOpen(true)}>删除共享身份</Button></div>{showRecovery && <code className="break-all text-xs select-all">{getFriendToken()}</code>}</div>
    </div>}
    {(message || error) && <p role="status" className="small muted">{message || error}</p>}
    <ConfirmDialog open={Boolean(removeId)} title="解除好友？" description="解除后双方将立即无法查看彼此共享的记录。" confirmText="解除好友" onCancel={() => setRemoveId(null)} onConfirm={() => { const id = removeId; setRemoveId(null); if (id) void act(() => remove(id), "已解除好友"); }} />
    <ConfirmDialog open={deleteOpen} title="删除共享身份？" danger description="这会删除服务器上的好友关系、申请和已公开的每日记录，无法恢复。" confirmText="删除共享身份" onCancel={() => setDeleteOpen(false)} onConfirm={() => { setDeleteOpen(false); void act(deleteAccount, "共享身份及公开记录已删除"); }} />
  </div>;
}
