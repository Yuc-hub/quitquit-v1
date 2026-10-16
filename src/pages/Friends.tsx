import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FriendManager } from "../components/FriendManager";
import { Button, PageHeader, useToast } from "../components/ui";
import { friendsApi } from "../services/friends";
import { useFriendsStore } from "../store/useFriendsStore";

export default function FriendsPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { account, refresh } = useFriendsStore();
  const [inviter, setInviter] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (token) void friendsApi.getInviteLink(token).then(result => { setInviter(result.from.name); setError(""); }).catch(e => setError((e as Error).message)); }, [token]);
  const accept = async () => {
    if (!token) return;
    setBusy(true); setError("");
    try {
      await friendsApi.acceptInviteLink(token);
      await refresh();
      toast("已添加好友，双方现在可以看到主动公开的每日记录");
      navigate("/friends", { replace: true });
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return <div className="page stack">
    <PageHeader title="好友互记" subtitle="互相陪伴，只分享各自愿意公开的内容。" back="/review" />
    {token && <section className="panel stack" aria-label="好友邀请">
      <h2 className="text-lg">好友邀请</h2>
      {inviter ? <><p>{inviter} 邀请你成为好友。接受后，你们可以互看各自主动分享的心情和公开一句话。</p><p className="small muted">完整日记、聊天、事件与材料不会共享。接受邀请前，请先在下方创建或恢复共享身份。</p><div className="button-row"><Button disabled={!account || busy} onClick={() => void accept()}>同意并成为好友</Button><Button variant="ghost" onClick={() => navigate("/review")}>暂不接受</Button></div></> : !error ? <p className="muted">正在读取邀请…</p> : null}
      {error && <p role="alert" className="error">{error}</p>}
    </section>}
    <FriendManager />
  </div>;
}
