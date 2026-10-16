import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore, STORAGE_KEY } from "../store/useAppStore";
import {
  Button,
  ConfirmDialog,
  Modal,
  PageHeader,
  RequireProfile,
  SectionTitle,
  useToast,
} from "../components/ui";
import { MaterialCard, SuggestionList } from "../components/cards";
import { EMPLOYMENT_STATUSES } from "../constants";
import { downloadBlob } from "../services/files";
import type { EmploymentStatus } from "../types";
import { readModelSettings, saveModelSettings, testModelConnection } from "../services/model";
export default function ProfilePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const profile = useAppStore((s) => s.profile);
  const materials = useAppStore((s) => s.materials);
  const notificationEnabled = useAppStore((s) => s.notificationEnabled);
  const mockConfig = useAppStore((s) => s.mockConfig);
  const saveProfile = useAppStore((s) => s.saveProfile);
  const setNotification = useAppStore((s) => s.setNotification);
  const setMockConfig = useAppStore((s) => s.setMockConfig);
  const loadDemo = useAppStore((s) => s.loadDemo);
  const clearData = useAppStore((s) => s.clearData);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    employmentStatus: (profile?.employmentStatus || "在职") as EmploymentStatus,
    company: profile?.company || "",
    role: profile?.role || "",
    startDate: profile?.startDate || "",
    city: profile?.city || "",
  });
  const [clearOpen, setClearOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modelSettings, setModelSettings] = useState(readModelSettings);
  const [connectionState, setConnectionState] = useState("");
  const [testing, setTesting] = useState(false);
  const base = materials.filter((m) =>
    ["contract", "offer", "jd", "salary"].includes(m.type),
  );
  const exportData = () => {
    const snapshot = { ...useAppStore.getState(), materials };
    delete (snapshot as Record<string, unknown>).clearData;
    downloadBlob(
      new Blob([JSON.stringify(snapshot, null, 2)], {
        type: "application/json",
      }),
      "职场日记-演示数据.json",
    );
    toast("已导出演示数据（不含文件内容）");
  };
  return (
    <RequireProfile>
      <div className="page stack">
        <PageHeader title="我的" subtitle="这里管理你的工作档案和本地数据。" />
        <div className="card stack">
          <SectionTitle
            title="工作档案"
            action={
              <Button
                variant="ghost"
                onClick={() => {
                  setForm({
                    employmentStatus: (profile?.employmentStatus ||
                      "在职") as EmploymentStatus,
                    company: profile?.company || "",
                    role: profile?.role || "",
                    startDate: profile?.startDate || "",
                    city: profile?.city || "",
                  });
                  setEditing(true);
                }}
              >
                编辑
              </Button>
            }
          />
          {profile ? (
            <dl className="grid-2 text-sm">
              <div>
                <dt className="muted">工作状态</dt>
                <dd>{profile.employmentStatus}</dd>
              </div>
              <div>
                <dt className="muted">公司</dt>
                <dd>{profile.company || "未填写"}</dd>
              </div>
              <div>
                <dt className="muted">岗位</dt>
                <dd>{profile.role || "未填写"}</dd>
              </div>
              <div>
                <dt className="muted">入职日期</dt>
                <dd>{profile.startDate || "未填写"}</dd>
              </div>
              <div>
                <dt className="muted">工作城市</dt>
                <dd>{profile.city || "未填写"}</dd>
              </div>
            </dl>
          ) : (
            <p className="muted">还没有工作档案。</p>
          )}
        </div>
        <div className="card stack">
          <SectionTitle
            title="基础材料"
            action={
              <Button to="/materials/upload" variant="ghost">
                上传材料
              </Button>
            }
          />
          {base.length ? (
            base.map((material) => (
              <MaterialCard key={material.id} material={material} />
            ))
          ) : (
            <p className="muted">还没有基础材料，之后可以随时补充。</p>
          )}
        </div>
        <SuggestionList title="待处理留痕" />
        <div className="card stack">
          <SectionTitle title="AI 模型设置" subtitle="支持 Chat Completions 和 Responses 接口。设置只保存在当前浏览器会话。" />
          <div className="field"><label className="label" htmlFor="api-endpoint">API 基础地址或完整接口地址</label><input id="api-endpoint" className="input" value={modelSettings.endpoint} onChange={e => setModelSettings({ ...modelSettings, endpoint: e.target.value })} placeholder="https://ark.cn-beijing.volces.com/api/v3/responses" /></div>
          <div className="field"><label className="label" htmlFor="api-model">模型名称</label><input id="api-model" className="input" value={modelSettings.model} onChange={e => setModelSettings({ ...modelSettings, model: e.target.value })} placeholder="输入服务商提供的模型 ID" /></div>
          <div className="field"><label className="label" htmlFor="api-key">API Key</label><input id="api-key" type="password" autoComplete="off" className="input" value={modelSettings.apiKey} onChange={e => setModelSettings({ ...modelSettings, apiKey: e.target.value })} placeholder="sk-…" /></div>
          <div className="button-row"><Button onClick={() => { saveModelSettings(modelSettings); setConnectionState("设置已保存到当前会话。"); }}>保存设置</Button><Button disabled={testing} onClick={async () => { setTesting(true); setConnectionState("正在测试连接…"); try { await testModelConnection(modelSettings); saveModelSettings(modelSettings); setConnectionState("连接成功，可以使用 AI 对话。"); } catch (e) { setConnectionState((e as Error).message); } finally { setTesting(false); } }}>测试连接</Button><Button onClick={() => { const empty = { endpoint: "https://api.openai.com/v1", model: "", apiKey: "" }; setModelSettings(empty); saveModelSettings(empty); setConnectionState("已清除 API 设置。"); }}>清除</Button></div>
          {connectionState && <p role="status" className="small muted">{connectionState}</p>}
          <p className="small muted">连接后，对话、每日记录和 TXT 材料文本会发送到所填 API。Key 不进入数据导出；关闭浏览器会话后需重新填写。浏览器直连需要 API 服务支持 CORS。</p>
        </div>
        <div className="card stack">
          <SectionTitle title="隐私与数据说明" />
          <ul className="stack muted small">
            <li>· AI 整理结果需要你本人确认，不会自动变成事实。</li>
            <li>· 产品只做记录与整理，不提供法律结论。</li>
            <li>· AI 对话发送到你配置的 API；只有主动分享的心情和公开一句话会进入好友共享服务。</li>
            <li>· 原始文件不会被修改，模拟提取摘要与原件分开保存。</li>
          </ul>
          <Button variant="ghost" onClick={() => setPrivacy(true)}>
            查看完整说明
          </Button>
        </div>
        <div className="card stack">
          <SectionTitle title="通知偏好" />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={notificationEnabled}
              onChange={(e) => {
                setNotification(e.target.checked);
                toast("已保存应用内偏好");
              }}
            />
            在应用内提醒我记录今天
          </label>
          <p className="small muted">
            目前未接入系统通知，这里只保存应用内偏好，不会产生真实推送。
          </p>
        </div>
        <div className="card stack">
          <SectionTitle title="演示设置" subtitle="用于查看加载与失败状态。" />
          <div className="field">
            <label className="label" htmlFor="delay">
              模拟服务延迟（毫秒）
            </label>
            <input
              id="delay"
              type="number"
              min={0}
              max={5000}
              className="input"
              value={mockConfig.delayMs}
              onChange={(e) =>
                setMockConfig({ delayMs: Number(e.target.value) || 0 })
              }
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={mockConfig.failNext}
              onChange={(e) => setMockConfig({ failNext: e.target.checked })}
            />
            下一次模拟服务请求失败（可查看重试提示）
          </label>
        </div>
        <div className="card stack">
          <SectionTitle title="数据管理" />
          <div className="button-row">
            <Button onClick={exportData}>导出演示数据</Button>
            <Button onClick={() => setResetOpen(true)}>重置演示故事</Button>
            <Button variant="danger" onClick={() => setClearOpen(true)}>
              清空本地数据
            </Button>
          </div>
          <p className="small muted">
            清空会删除当前浏览器中的日记与文件，无法恢复。好友共享身份和已公开的记录需在回顾日历旁的好友页面单独删除。
          </p>
        </div>
        <p className="small muted">
          社区、律师市场、支付等功能暂未开发，因此不在这里展示入口。
        </p>
      </div>
      {editing && (
        <Modal title="编辑工作档案" onClose={() => setEditing(false)}>
          <div className="stack">
            <div className="field">
              <label className="label" htmlFor="status">
                工作状态
              </label>
              <select
                id="status"
                className="input"
                value={form.employmentStatus}
                onChange={(e) =>
                  setForm({
                    ...form,
                    employmentStatus: e.target.value as EmploymentStatus,
                  })
                }
              >
                {EMPLOYMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-grid">
              <div className="field">
                <label className="label" htmlFor="company">
                  公司
                </label>
                <input
                  id="company"
                  className="input"
                  value={form.company}
                  onChange={(e) =>
                    setForm({ ...form, company: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="role">
                  岗位
                </label>
                <input
                  id="role"
                  className="input"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="start">
                  入职日期
                </label>
                <input
                  id="start"
                  type="date"
                  className="input"
                  value={form.startDate}
                  onChange={(e) =>
                    setForm({ ...form, startDate: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="city">
                  城市
                </label>
                <input
                  id="city"
                  className="input"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </div>
            </div>
            <div className="button-row justify-end">
              <Button onClick={() => setEditing(false)}>取消</Button>
              <Button
                variant="primary"
                onClick={() => {
                  const current = useAppStore.getState().profile;
                  saveProfile({
                    id: current?.id || crypto.randomUUID(),
                    employmentStatus: form.employmentStatus,
                    company: form.company || undefined,
                    role: form.role || undefined,
                    startDate: form.startDate || undefined,
                    city: form.city || undefined,
                  });
                  toast("工作档案已更新");
                  setEditing(false);
                }}
              >
                保存
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {privacy && (
        <Modal title="隐私与数据说明" onClose={() => setPrivacy(false)}>
          <div className="stack">
            <p className="muted">
              工作档案、日记、事件、材料元数据和聊天记录保存在
              localStorage（键名 {STORAGE_KEY}），上传的原始文件保存在
              IndexedDB。清空浏览器数据或使用无痕窗口都会导致数据不可访问。
            </p>
            <p className="muted">
              启用真实 AI 后，对话文字、每日摘要原文及主动整理的 TXT 材料会发送到配置的 API。材料摘要与原始文件分开保存，确认前标记为“待确认”。
            </p>
            <p className="muted">
              产品不会给出“公司违法”“一定能赢”“你必须辞职”这类结论。需要专业判断时，建议咨询专业人士，该服务尚未接入。
            </p>
            <Button onClick={() => setPrivacy(false)}>我知道了</Button>
          </div>
        </Modal>
      )}
      <ConfirmDialog
        open={clearOpen}
        title="确认清空本地数据？"
        danger
        confirmText="我确认清空"
        description="这会删除当前浏览器中的工作档案、日记、事件、材料元数据和所有上传文件，且无法恢复。好友共享身份与已公开的记录不会删除；如需删除，请先到回顾日历旁的好友页面删除共享身份。"
        onCancel={() => setClearOpen(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await clearData();
            toast("本地数据已清空");
            navigate("/onboarding", { replace: true });
          } catch (e) {
            toast((e as Error).message);
          } finally {
            setBusy(false);
            setClearOpen(false);
          }
        }}
      />
      <ConfirmDialog
        open={resetOpen}
        title="重置为演示故事？"
        danger
        confirmText="重置演示数据"
        description="这会清空当前数据并重新加载虚构演示故事，包括示例材料。你自己的记录将被覆盖。"
        onCancel={() => setResetOpen(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await loadDemo(true);
            toast("已重置为演示故事");
            navigate("/today", { replace: true });
          } catch (e) {
            toast((e as Error).message);
          } finally {
            setBusy(false);
            setResetOpen(false);
          }
        }}
      />
      {busy && <p className="muted">正在处理…</p>}
    </RequireProfile>
  );
}
