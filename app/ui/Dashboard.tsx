"use client";

import { useEffect, useMemo, useState } from "react";
import { creators as initialCreators, logs, tasks as initialTasks } from "../../lib/mock-data";
import {
  CREATOR_FILTERS_STORAGE_KEY,
  DEFAULT_CREATOR_FILTERS,
  hasActiveCreatorFilters,
  parseCreatorFilters,
  serializeCreatorFilters,
} from "../../lib/services/creator-filters";
import type { CRMRecord, CRMStage, Creator, Recommendation, SearchTask, TianmuStatus } from "../../lib/types";
import { CREATOR_CATEGORIES } from "../../lib/category-taxonomy";

type View = "overview" | "tasks" | "creators" | "tianmu" | "crm" | "logs" | "detail";
type TikHubStatus = { status: "CHECKING" | "HEALTHY" | "UNAVAILABLE" | "NOT_CONFIGURED"; balance: number | null; freeCredit: number | null };
type RuntimeStatus = { mode: "live" | "mock"; aiProvider: string; tianmuAuthorPoolUrl?: string };
type ApiTask = Record<string, unknown>;
type TaskResultRow = { id: string; nickname: string; douyin_account: string; main_category: string; keyword: string; recommendation: Recommendation; tianmu_status: TianmuStatus; final_status: Creator["finalStatus"]; content_verticality: number; reasoning: string };
type TianmuPendingRow = { id: string; nickname: string; douyin_account: string; profile_url: string; main_category: string; reasoning: string };

const navItems: { id: View; label: string; icon: string }[] = [
  { id: "overview", label: "工作概览", icon: "⌂" },
  { id: "tasks", label: "搜索任务", icon: "⌕" },
  { id: "creators", label: "创作者候选池", icon: "◎" },
  { id: "tianmu", label: "天牧待查", icon: "✓" },
  { id: "crm", label: "建联 CRM", icon: "◇" },
  { id: "logs", label: "运行日志", icon: "≡" },
];

const crmStageLabel: Record<CRMStage, string> = {
  TO_CONTACT: "待建联",
  CONTACTED: "已触达",
  IN_DISCUSSION: "沟通中",
  INTENT_CONFIRMED: "意向确认",
  ONBOARDED: "已入驻",
  PAUSED: "暂缓",
  REJECTED: "不再跟进",
};

const crmStageOptions = Object.keys(crmStageLabel) as CRMStage[];

const recommendationLabel: Record<Recommendation, string> = {
  RECOMMENDED: "内容推荐",
  REVIEW_REQUIRED: "待复核",
  NOT_RECOMMENDED: "不推荐",
};

const tianmuLabel: Record<TianmuStatus, string> = {
  NOT_CHECKED: "未查询",
  MATCHED: "天牧已匹配",
  NOT_MATCHED: "天牧未匹配",
  REVIEW_REQUIRED: "查重待复核",
  LOGIN_EXPIRED: "登录失效",
  NO_PERMISSION: "无权限",
};

function badgeTone(value: string) {
  if (["RECOMMENDED", "NOT_MATCHED", "RECOMMENDED_FOR_BD", "COMPLETED"].includes(value)) return "badge-green";
  if (["NOT_RECOMMENDED", "LOGIN_EXPIRED", "NO_PERMISSION", "DO_NOT_CONTACT"].includes(value)) return "badge-red";
  if (["REVIEW_REQUIRED", "MANUAL_REVIEW", "PENDING", "RUNNING", "WAITING_MANUAL", "PARTIAL"].includes(value)) return "badge-amber";
  return "badge-gray";
}

function finalLabel(value: Creator["finalStatus"]) {
  return {
    RECOMMENDED_FOR_BD: "推荐 BD",
    ALREADY_IN_TIANMU: "已在天牧",
    MANUAL_REVIEW: "人工复核",
    DO_NOT_CONTACT: "暂不联系",
    DATA_ERROR: "数据异常",
  }[value];
}

function mapApiTask(row: ApiTask, failureRows: ApiTask[] = []): SearchTask {
  const parse = <T,>(value: unknown, fallback: T): T => { try { return typeof value === "string" ? JSON.parse(value) as T : (value as T) ?? fallback; } catch { return fallback; } };
  const rawStatus = String(row.status ?? "PAUSED");
  const status: SearchTask["status"] = ["PENDING", "RUNNING", "PAUSED", "WAITING_MANUAL", "PARTIAL", "COMPLETED"].includes(rawStatus) ? rawStatus as SearchTask["status"] : "PAUSED";
  return {
    id: String(row.id), name: String(row.name ?? "未命名任务"), category: String(row.primary_category ?? "AI识别类目"),
    keywords: parse(row.keywords, []), targetRequirement: String(row.target_requirement ?? ""),
    resultLimitPerKeyword: Number(row.result_limit_per_keyword ?? 12), worksLimitPerCreator: Number(row.works_limit_per_creator ?? 6),
    estimatedApiCalls: Number(row.estimated_api_calls ?? (parse<string[]>(row.keywords, []).length * (1 + Number(row.result_limit_per_keyword ?? 12) * 2))), checkpoint: parse(row.checkpoint, { keywordIndex: 0, creatorIndex: 0 }),
    pauseReason: String(row.pause_reason ?? ""), status, progress: Number(row.progress ?? 0), discovered: Number(row.discovered ?? 0),
    recommended: Number(row.recommended ?? 0), checked: Number(row.checked ?? 0), bdReady: Number(row.bd_ready ?? 0),
    lastRun: row.last_run_at ? new Date(String(row.last_run_at)).toLocaleString("zh-CN") : "尚未运行",
    failures: failureRows.map((failure) => ({ id: String(failure.id), creatorId: failure.creator_id ? String(failure.creator_id) : undefined, creatorName: String(failure.creator_name ?? ""), stage: String(failure.stage ?? "PROFILE") as import("../../lib/types").TaskFailure["stage"], errorType: String(failure.error_type ?? "PLATFORM_BLOCKED") as import("../../lib/types").TaskFailure["errorType"], message: String(failure.message ?? ""), retryCount: Number(failure.retry_count ?? 0), status: String(failure.status ?? "PENDING") as import("../../lib/types").TaskFailure["status"] })),
  };
}

function mapApiCreator(row: ApiTask): Creator {
  const recommendation = String(row.recommendation ?? "REVIEW_REQUIRED") as Recommendation;
  return {
    id: String(row.id), nickname: String(row.nickname ?? "未知作者"), douyinAccount: String(row.douyin_account ?? ""),
    profileUrl: String(row.profile_url ?? ""), category: String(row.main_category ?? "其他"), subcategory: String(row.main_category ?? "其他"),
    bio: String(row.bio ?? ""), followers: Number(row.follower_count ?? 0), totalLikes: Number(row.total_likes ?? 0),
    verticality: Number(row.content_verticality ?? 0), targetRatio: Math.round(Number(row.target_content_ratio ?? 0) * 100),
    originalityRisk: String(row.repost_risk ?? "中") as Creator["originalityRisk"], recommendation,
    tianmuStatus: String(row.tianmu_status ?? "NOT_CHECKED") as TianmuStatus,
    finalStatus: String(row.final_status ?? "MANUAL_REVIEW") as Creator["finalStatus"], emerging: Boolean(row.is_emerging_creator),
    keyword: String(row.keyword ?? ""), reasoning: String(row.reasoning ?? "暂无分析说明"), avatarColor: "#247a5c", works: [],
  };
}

function mapApiCrmRecord(row: ApiTask): CRMRecord {
  return {
    id: String(row.id), creatorId: String(row.creator_id), stage: String(row.stage ?? "TO_CONTACT") as CRMStage,
    owner: String(row.owner ?? ""), contactInfo: String(row.contact_info ?? ""),
    lastContactAt: String(row.last_contact_at ?? ""), nextFollowUpAt: String(row.next_follow_up_at ?? ""),
    note: String(row.note ?? ""), addedAt: String(row.added_at ?? ""), updatedAt: String(row.updated_at ?? ""),
  };
}

export function Dashboard() {
  const [view, setView] = useState<View>("overview");
  const [creators, setCreators] = useState<Creator[]>([]);
  const [tasks, setTasks] = useState<SearchTask[]>([]);
  const [taskActionIds, setTaskActionIds] = useState<Set<string>>(new Set());
  const [crmRecords, setCrmRecords] = useState<CRMRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [filters, setFilters] = useState(() =>
    typeof window === "undefined"
      ? DEFAULT_CREATOR_FILTERS
      : parseCreatorFilters(
          window.localStorage.getItem(CREATOR_FILTERS_STORAGE_KEY),
        ),
  );
  const { query, category, recommendation, tianmu, emergingOnly } = filters;
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [toast, setToast] = useState("");
  const [tikhubStatus, setTikhubStatus] = useState<TikHubStatus>({ status: "CHECKING", balance: null, freeCredit: null });
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>({ mode: "live", aiProvider: "openai" });

  const selectedCreator =
    creators.find((creator) => creator.id === selectedId) ?? creators[0];

  const filteredCreators = useMemo(
    () =>
      creators.filter((creator) => {
        const text = `${creator.nickname}${creator.douyinAccount}${creator.subcategory}${creator.keyword}`.toLowerCase();
        return (
          text.includes(query.toLowerCase()) &&
          (category === "全部类目" || creator.category === category) &&
          (recommendation === "全部结果" || creator.recommendation === recommendation) &&
          (tianmu === "全部状态" || creator.tianmuStatus === tianmu) &&
          (!emergingOnly || creator.emerging)
        );
      }),
    [category, creators, emergingOnly, query, recommendation, tianmu],
  );

  useEffect(() => {
    fetch("/api/runtime/status")
      .then(async (response) => response.json() as Promise<RuntimeStatus>)
      .then((status) => { setRuntimeStatus(status); if (status.mode === "mock") { setCreators(initialCreators); setTasks(initialTasks); setSelectedId(initialCreators[0].id); } })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      CREATOR_FILTERS_STORAGE_KEY,
      serializeCreatorFilters(filters),
    );
  }, [filters]);

  useEffect(() => {
    const stored = parseCreatorFilters(
      window.localStorage.getItem(CREATOR_FILTERS_STORAGE_KEY),
    );
    if (!hasActiveCreatorFilters(stored)) return;

    const restoreView = window.setTimeout(() => setView("creators"), 0);
    return () => window.clearTimeout(restoreView);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/tikhub/status")
      .then(async (response) => response.json() as Promise<TikHubStatus>)
      .then((status) => { if (active) setTikhubStatus(status); })
      .catch(() => { if (active) setTikhubStatus({ status: "UNAVAILABLE", balance: null, freeCredit: null }); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    fetch("/api/tasks")
      .then(async (response) => response.ok ? response.json() as Promise<{ tasks: ApiTask[] }> : Promise.reject())
      .then(({ tasks: rows }) => setTasks(rows.map((row) => mapApiTask(row))))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetch("/api/creators")
      .then(async (response) => response.ok ? response.json() as Promise<{ creators: ApiTask[] }> : Promise.reject())
      .then(({ creators: rows }) => { setCreators(rows.map(mapApiCreator)); if (rows[0]) setSelectedId(String(rows[0].id)); })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!tasks.some((task) => task.status === "PENDING" || task.status === "RUNNING")) return;
    const timer = window.setInterval(() => {
      fetch("/api/tasks")
        .then(async (response) => response.ok ? response.json() as Promise<{ tasks: ApiTask[] }> : Promise.reject())
        .then(({ tasks: rows }) => setTasks(rows.map((row) => mapApiTask(row))))
        .catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [tasks]);

  useEffect(() => {
    fetch("/api/crm")
      .then(async (response) => response.ok ? response.json() as Promise<{ records: ApiTask[] }> : Promise.reject())
      .then(({ records }) => setCrmRecords(records.map(mapApiCrmRecord)))
      .catch(() => undefined);
  }, []);

  const stats = {
    discovered: tasks.reduce((sum, task) => sum + task.discovered, 0),
    recommended: creators.filter((creator) => creator.recommendation === "RECOMMENDED").length,
    checked: creators.filter((creator) => creator.tianmuStatus !== "NOT_CHECKED").length,
    bdReady: creators.filter((creator) => creator.finalStatus === "RECOMMENDED_FOR_BD").length,
  };

  function openCreator(id: string) {
    setSelectedId(id);
    setView("detail");
  }

  async function updateCreator(
    id: string,
    patch: Partial<Pick<Creator, "recommendation" | "tianmuStatus" | "finalStatus">>,
  ) {
    const creator = creators.find((item) => item.id === id);
    setCreators((items) =>
      items.map((creator) => (creator.id === id ? { ...creator, ...patch } : creator)),
    );
    if (!patch.tianmuStatus || !creator) { showToast("状态已更新"); return; }
    try {
      const response = await fetch("/api/tianmu/checks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorId: id, nickname: creator.nickname, status: patch.tianmuStatus, resultCount: patch.tianmuStatus === "MATCHED" ? 1 : 0, exactMatchNicknames: patch.tianmuStatus === "MATCHED" ? [creator.nickname] : [] }),
      });
      if (!response.ok) throw new Error();
      showToast("天牧核验结果已保存");
    } catch { showToast("保存失败，请稍后重试"); }
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }

  async function addToCrm(creatorId: string) {
    if (crmRecords.some((record) => record.creatorId === creatorId)) {
      showToast("该作者已在 CRM 中");
      setView("crm");
      return;
    }
    try {
      const response = await fetch("/api/crm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ creatorId, owner: "LY" }) });
      const payload = await response.json() as { record?: ApiTask };
      if (!response.ok || !payload.record) throw new Error();
      setCrmRecords((records) => [mapApiCrmRecord(payload.record!), ...records]);
      showToast("已加入建联 CRM");
    } catch { showToast("CRM 保存失败，请确认数据库已连接"); }
  }

  function updateCrmRecord(id: string, patch: Partial<CRMRecord>) {
    setCrmRecords((records) =>
      records.map((record) =>
        record.id === id
          ? { ...record, ...patch, updatedAt: new Date().toISOString() }
          : record,
      ),
    );
    void fetch(`/api/crm/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) })
      .then((response) => { if (!response.ok) throw new Error(); })
      .catch(() => showToast("CRM 更新未保存，请重试"));
  }

  async function runTask(taskId: string) {
    const current = tasks.find((task) => task.id === taskId);
    if (!current || taskActionIds.has(taskId) || current.status === "PENDING") return;
    setTaskActionIds((ids) => new Set(ids).add(taskId));
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/${current?.status === "RUNNING" ? "pause" : "run"}`, { method: "POST" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "任务操作失败");
      setTasks((items) => items.map((task) => task.id === taskId ? { ...task, status: current?.status === "RUNNING" ? "PAUSED" : "PENDING", pauseReason: "", lastRun: "刚刚" } : task));
      showToast(current?.status === "RUNNING" ? "任务已暂停" : "任务已提交，状态将自动更新");
    } catch (error) { showToast(error instanceof Error ? error.message : "任务操作失败，请稍后重试"); }
    finally { window.setTimeout(() => setTaskActionIds((ids) => { const next = new Set(ids); next.delete(taskId); return next; }), 1200); }
  }

  function deleteTask(taskId: string) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task || !window.confirm(`确定删除搜索任务“${task.name}”吗？`)) return;
    void fetch(`/api/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" }).catch(() => undefined);
    setTasks((items) => items.filter((item) => item.id !== taskId));
    showToast("搜索任务已删除");
  }

  async function refreshTask(taskId: string) {
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`);
      const payload = await response.json() as { task?: ApiTask; failures?: ApiTask[] };
      if (!response.ok || !payload.task) throw new Error();
      setTasks((items) => items.map((task) => task.id === taskId ? mapApiTask(payload.task!, payload.failures) : task));
      showToast("已读取最新搜索状态");
    } catch { showToast("任务接口暂不可用，保留当前状态"); }
  }

  function recoverTask(taskId: string, action: "RETRY" | "SKIP" | "RESUME") {
    setTasks((items) => items.map((task) => {
      if (task.id !== taskId) return task;
      if (action === "SKIP") return { ...task, status: "RUNNING", pauseReason: "", failures: task.failures.map((failure) => ({ ...failure, status: "SKIPPED" as const })), lastRun: "刚刚" };
      if (action === "RETRY") return { ...task, status: "RUNNING", pauseReason: "", failures: task.failures.map((failure) => ({ ...failure, status: "RETRYING" as const, retryCount: failure.retryCount + 1 })), lastRun: "刚刚" };
      return { ...task, status: "RUNNING", pauseReason: "", lastRun: "刚刚" };
    }));
    showToast(action === "SKIP" ? "已跳过受限账号并从检查点继续" : action === "RETRY" ? "正在只重试失败账号" : "已从检查点恢复任务");
  }

  const currentTitle = navItems.find((item) => item.id === view)?.label ??
    (view === "detail" ? "创作者详情" : "工作概览");

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => setView("overview")}
          aria-label="返回工作概览"
        >
          <span className="brand-mark">雷</span>
          <span className="brand-copy">
            <span className="brand-title">创作者雷达</span>
            <span className="brand-sub">百家号运营工具</span>
          </span>
        </button>
        <nav className="nav" aria-label="主导航">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              onClick={() => setView(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <div><span className="status-dot" />{runtimeStatus.mode === "live" ? "Live 模式运行中" : "Mock 模式运行中"}</div>
          <div>{runtimeStatus.mode === "live" ? "TikHub + LLM 真实链路" : "演示数据，不产生 API 消耗"}</div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <div className="page-kicker">BAIJIAHAO CREATOR OPS</div>
            <div style={{ fontSize: 13, fontWeight: 750, marginTop: 3 }}>{currentTitle}</div>
          </div>
          <div className="top-actions">
            <div className={`api-status api-${tikhubStatus.status.toLowerCase()}`} title="TikHub API 账户状态">
              <span className="api-dot" />
              <span>{tikhubStatus.status === "HEALTHY" ? "TikHub API 正常" : tikhubStatus.status === "CHECKING" ? "TikHub 检测中" : tikhubStatus.status === "NOT_CONFIGURED" ? "TikHub 未配置" : "TikHub API 异常"}</span>
              {tikhubStatus.balance !== null && <span className="api-balance">余额 ${tikhubStatus.balance.toFixed(2)}</span>}
            </div>
            <span className="mode-pill">● {runtimeStatus.mode === "live" ? "Live 数据" : "Mock 数据"}</span>
            <button className="avatar" aria-label="当前用户">LY</button>
          </div>
        </header>

        <div className="content">
          {view === "overview" && (
            <Overview
              stats={stats}
              creators={creators}
              onViewCreators={() => setView("creators")}
              onNewTask={() => setShowTaskModal(true)}
              onOpenCreator={openCreator}
            />
          )}
          {view === "tasks" && (
            <Tasks
              tasks={tasks}
              creators={creators}
              onNewTask={() => setShowTaskModal(true)}
              onRunTask={runTask}
              taskActionIds={taskActionIds}
              onDeleteTask={deleteTask}
              onRefreshTask={refreshTask}
              onOpenCreatorFromTask={openCreator}
              onRecoverTask={recoverTask}
            />
          )}
          {view === "creators" && (
            <Creators
              creators={filteredCreators}
              query={query}
              category={category}
              recommendation={recommendation}
              tianmu={tianmu}
              emergingOnly={emergingOnly}
              onQuery={(value) =>
                setFilters((current) => ({ ...current, query: value }))
              }
              onCategory={(value) =>
                setFilters((current) => ({ ...current, category: value }))
              }
              onRecommendation={(value) =>
                setFilters((current) => ({ ...current, recommendation: value }))
              }
              onTianmu={(value) =>
                setFilters((current) => ({ ...current, tianmu: value }))
              }
              onEmergingOnly={(value) =>
                setFilters((current) => ({ ...current, emergingOnly: value }))
              }
              onOpen={openCreator}
              crmCreatorIds={new Set(crmRecords.map((record) => record.creatorId))}
              onAddToCrm={addToCrm}
            />
          )}
          {view === "crm" && (
            <CRMWorkspace
              creators={creators}
              records={crmRecords}
              onOpen={openCreator}
              onUpdate={updateCrmRecord}
              onToast={showToast}
            />
          )}
          {view === "tianmu" && (
            <TianmuQueue authorPoolUrl={runtimeStatus.tianmuAuthorPoolUrl} onOpen={openCreator} onConfirmed={(id, status, finalStatus) => {
              setCreators((items) => items.map((creator) => creator.id === id ? { ...creator, tianmuStatus: status, finalStatus } : creator));
              showToast("天牧核验结果已回写");
            }} />
          )}
          {view === "logs" && <Logs />}
          {view === "detail" && selectedCreator && (
            <CreatorDetail
              creator={selectedCreator}
              onBack={() => setView("creators")}
              onUpdate={updateCreator}
              inCrm={crmRecords.some((record) => record.creatorId === selectedCreator.id)}
              onAddToCrm={addToCrm}
            />
          )}
        </div>
      </main>

      {showTaskModal && (
        <NewTaskModal
          onClose={() => setShowTaskModal(false)}
          onCreate={(task) => {
            void fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(task) })
              .then(async (response) => { const payload = await response.json() as { id?: string; error?: string }; if (!response.ok || !payload.id) throw new Error(payload.error); setTasks((items) => [{ ...task, id: payload.id!, status: "PENDING", lastRun: "刚刚" }, ...items]); showToast("真实搜索任务已创建"); })
              .catch(() => { setTasks((items) => [task, ...items]); showToast("任务接口不可用，已保存为本地草稿"); });
            setShowTaskModal(false); setView("tasks");
          }}
        />
      )}
      {toast && (
        <div
          style={{
            position: "fixed",
            right: 24,
            bottom: 24,
            zIndex: 80,
            background: "#10271f",
            color: "white",
            padding: "11px 15px",
            borderRadius: 10,
            fontSize: 12,
            boxShadow: "0 12px 35px rgba(0,0,0,.2)",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function PageHead({
  title,
  copy,
  actions,
}: {
  title: string;
  copy: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        <p>{copy}</p>
      </div>
      {actions && <div className="top-actions">{actions}</div>}
    </div>
  );
}

function Overview({
  stats,
  creators,
  onViewCreators,
  onNewTask,
  onOpenCreator,
}: {
  stats: { discovered: number; recommended: number; checked: number; bdReady: number };
  creators: Creator[];
  onViewCreators: () => void;
  onNewTask: () => void;
  onOpenCreator: (id: string) => void;
}) {
  const recommended = creators
    .filter((creator) => creator.finalStatus === "RECOMMENDED_FOR_BD")
    .slice(0, 5);
  return (
    <>
      <PageHead
        title="创作者搜索与查重结果"
        copy="这里只展示已搜索作者、已完成查重作者和当前可 BD 作者。"
        actions={
          <>
            <button className="btn" onClick={onViewCreators}>查看候选池</button>
            <button className="btn btn-primary" onClick={onNewTask}>＋ 新建搜索任务</button>
          </>
        }
      />
      <div className="stats-grid">
        {[
          ["已搜索作者", stats.discovered, "搜索任务累计"],
          ["已完成查重", stats.checked, "天牧昵称查重"],
          ["当前可 BD", stats.bdReady, "内容通过且未匹配"],
        ].map(([label, value, trend]) => (
          <div className="stat-card" key={label}>
            <div className="stat-label">{label}</div>
            <div className="stat-row">
              <div className="stat-value">{value}</div>
              <div className="trend">{trend}</div>
            </div>
          </div>
        ))}
      </div>
      <div>
        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">可 BD 作者</div>
              <div className="card-sub">已通过业务目标筛选，且天牧查重未匹配</div>
            </div>
            <button className="btn btn-quiet" onClick={onViewCreators}>查看全部 →</button>
          </div>
          <CreatorTable creators={recommended} onOpen={onOpenCreator} compact />
        </section>
      </div>
    </>
  );
}

function Tasks({
  tasks,
  creators,
  onNewTask,
  onRunTask,
  taskActionIds,
  onDeleteTask,
  onRefreshTask,
  onOpenCreatorFromTask,
  onRecoverTask,
}: {
  tasks: SearchTask[];
  creators: Creator[];
  onNewTask: () => void;
  onRunTask: (id: string) => void;
  taskActionIds: Set<string>;
  onDeleteTask: (id: string) => void;
  onRefreshTask: (id: string) => void;
  onOpenCreatorFromTask: (id: string) => void;
  onRecoverTask: (id: string, action: "RETRY" | "SKIP" | "RESUME") => void;
}) {
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [remoteResults, setRemoteResults] = useState<Record<string, TaskResultRow[]>>({});
  function successfulCreators(task: SearchTask): TaskResultRow[] {
    if (remoteResults[task.id]) return remoteResults[task.id];
    const categoryMatches = creators.filter((creator) =>
      creator.recommendation === "RECOMMENDED" &&
      (task.category === "AI识别类目" || creator.category === task.category),
    );
    const recommended = creators.filter((creator) => creator.recommendation === "RECOMMENDED");
    const pool = categoryMatches.length ? categoryMatches : recommended;
    return pool.slice(0, Math.min(task.recommended, 8)).map((creator) => ({ id: creator.id, nickname: creator.nickname, douyin_account: creator.douyinAccount, main_category: `${creator.category} / ${creator.subcategory}`, keyword: creator.keyword, recommendation: creator.recommendation, tianmu_status: creator.tianmuStatus, final_status: creator.finalStatus, content_verticality: creator.verticality, reasoning: creator.reasoning }));
  }

  function toggleTask(id: string) {
    setExpandedTasks((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    if (!expandedTasks.has(id) && !remoteResults[id]) {
      void fetch(`/api/tasks/${encodeURIComponent(id)}/results`)
        .then(async (response) => response.ok ? response.json() as Promise<{ creators: TaskResultRow[] }> : Promise.reject())
        .then(({ creators: rows }) => setRemoteResults((current) => ({ ...current, [id]: rows })))
        .catch(() => undefined);
    }
  }

  return (
    <>
      <PageHead
        title="搜索任务"
        copy="搜索关键词负责发现，筛选引进标准负责判断；任务可暂停、继续或删除。"
        actions={<button className="btn btn-primary" onClick={onNewTask}>＋ 新建任务</button>}
      />
      <div className="task-list">
        {tasks.map((task) => (
          <section className="card task-card" key={task.id}>
            <div>
              <div className="task-title">{task.name}</div>
              <div className="task-meta">
                <span className="badge badge-gray">{task.category}</span>
                <span>{task.keywords.length} 个关键词</span>
                <span>·</span>
                <span>{task.lastRun}</span>
              </div>
              <div className="task-requirement">筛选标准：{task.targetRequirement}</div>
              <div className="task-budget">额度保护：每词 {task.resultLimitPerKeyword} 个候选 · 每人 {task.worksLimitPerCreator} 条作品 · 最坏约 {task.estimatedApiCalls} 次请求</div>
            </div>
            <div>
              <div className="progress-bar"><span style={{ width: `${task.progress}%` }} /></div>
              <div className="progress-meta">
                <span>{task.discovered} 位作者 · {task.recommended} 位内容推荐</span>
                <strong>{task.progress}%</strong>
              </div>
            </div>
            <div className="task-actions">
              <span className={`badge ${badgeTone(task.status)}`}>
                {task.status === "PENDING" ? "准备中" : task.status === "RUNNING" ? "运行中" : task.status === "PAUSED" ? "已暂停" : task.status === "WAITING_MANUAL" ? "等待人工处理" : task.status === "PARTIAL" ? "部分完成" : "已完成"}
              </span>
              <button className="btn" onClick={() => onRefreshTask(task.id)}>↻ 刷新状态</button>
              <button className="btn" disabled={taskActionIds.has(task.id) || task.status === "PENDING"} onClick={() => onRunTask(task.id)}>
                {taskActionIds.has(task.id) || task.status === "PENDING" ? "处理中…" : task.status === "RUNNING" ? "暂停" : task.status === "COMPLETED" ? "重跑" : "继续"}
              </button>
              <button className="btn btn-danger" onClick={() => onDeleteTask(task.id)}>删除</button>
            </div>
            {task.pauseReason && <div className="notice" style={{ marginTop: 12 }}><strong>暂停原因：</strong>{task.pauseReason}</div>}
            <div className="task-results-toggle">
              <button className="btn btn-quiet" onClick={() => toggleTask(task.id)} aria-expanded={expandedTasks.has(task.id)}>
                {expandedTasks.has(task.id) ? "收起筛选结果" : `展开查看筛选成功作者（${Math.min(task.recommended, 8)}）`}
              </button>
            </div>
            {expandedTasks.has(task.id) && (
              <div className="task-results">
                <div className="task-results-head"><strong>筛选成功作者</strong><span>展示最近通过业务标准的作者；点击作者可查看判断证据。</span></div>
                {successfulCreators(task).length ? (
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>作者</th><th>内容品类</th><th>命中关键词</th><th>内容判断</th><th>天牧查重</th><th>BD状态</th><th /></tr></thead>
                      <tbody>{successfulCreators(task).map((creator) => (
                        <tr key={creator.id}>
                          <td><strong>{creator.nickname}</strong><div className="creator-id">@{creator.douyin_account}</div></td>
                          <td>{creator.main_category}</td>
                          <td>{creator.keyword}</td>
                          <td><span className={`badge ${badgeTone(creator.recommendation)}`}>{recommendationLabel[creator.recommendation]}</span></td>
                          <td><span className={`badge ${badgeTone(creator.tianmu_status)}`}>{tianmuLabel[creator.tianmu_status]}</span></td>
                          <td><span className={`badge ${badgeTone(creator.final_status)}`}>{finalLabel(creator.final_status)}</span></td>
                          <td><button className="btn btn-quiet" onClick={() => onOpenCreatorFromTask(creator.id)}>详情 →</button></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : <div className="empty">当前任务还没有通过筛选的作者。</div>}
              </div>
            )}
            {task.failures.some((failure) => failure.status === "PENDING" || failure.status === "RETRYING") && (
              <div className="recovery-panel">
                <div className="recovery-head"><strong>人工处理队列</strong><span>任务其他账号不受影响 · 检查点 {task.checkpoint.keywordIndex + 1}/{task.keywords.length}</span></div>
                {task.failures.filter((failure) => failure.status === "PENDING" || failure.status === "RETRYING").map((failure) => (
                  <div className="recovery-row" key={failure.id}>
                    <span className="badge badge-amber">{failure.errorType}</span><strong>{failure.creatorName || "当前任务"}</strong><span>{failure.message}</span><span>已重试 {failure.retryCount}/3</span>
                  </div>
                ))}
                <div className="recovery-actions">
                  <button className="btn" onClick={() => onRecoverTask(task.id, "RESUME")}>登录完成，从检查点继续</button>
                  <button className="btn" onClick={() => onRecoverTask(task.id, "RETRY")}>只重试失败账号</button>
                  <button className="btn btn-quiet" onClick={() => onRecoverTask(task.id, "SKIP")}>跳过受限账号</button>
                </div>
              </div>
            )}
          </section>
        ))}
      </div>
    </>
  );
}

function Creators({
  creators,
  query,
  category,
  recommendation,
  tianmu,
  emergingOnly,
  onQuery,
  onCategory,
  onRecommendation,
  onTianmu,
  onEmergingOnly,
  onOpen,
  crmCreatorIds,
  onAddToCrm,
}: {
  creators: Creator[];
  query: string;
  category: string;
  recommendation: string;
  tianmu: string;
  emergingOnly: boolean;
  onQuery: (value: string) => void;
  onCategory: (value: string) => void;
  onRecommendation: (value: string) => void;
  onTianmu: (value: string) => void;
  onEmergingOnly: (value: boolean) => void;
  onOpen: (id: string) => void;
  crmCreatorIds: Set<string>;
  onAddToCrm: (id: string) => void;
}) {
  return (
    <>
      <PageHead
        title="创作者候选池"
        copy={`当前展示 ${creators.length} 位作者；人工确认后加入 CRM，再从 CRM 导出跟进表。`}
      />
      <section className="card">
        <div className="toolbar">
          <input
            className="field search-field"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="搜索昵称、抖音号、类目或关键词"
            aria-label="搜索候选作者"
          />
          <select className="field" value={category} onChange={(event) => onCategory(event.target.value)}>
            <option>全部类目</option>
            {CREATOR_CATEGORIES.map((value) => <option key={value}>{value}</option>)}
          </select>
          <select className="field" value={recommendation} onChange={(event) => onRecommendation(event.target.value)}>
            <option value="全部结果">全部内容结果</option>
            <option value="RECOMMENDED">内容推荐</option>
            <option value="REVIEW_REQUIRED">待复核</option>
            <option value="NOT_RECOMMENDED">不推荐</option>
          </select>
          <select className="field" value={tianmu} onChange={(event) => onTianmu(event.target.value)}>
            <option value="全部状态">全部天牧状态</option>
            <option value="NOT_MATCHED">未匹配</option>
            <option value="MATCHED">已匹配</option>
            <option value="REVIEW_REQUIRED">待复核</option>
            <option value="NOT_CHECKED">未查询</option>
          </select>
          <button
            type="button"
            className={`btn filter-toggle ${emergingOnly ? "active" : ""}`}
            aria-pressed={emergingOnly}
            onClick={() => onEmergingOnly(!emergingOnly)}
          >
            ✦ 只看新锐
          </button>
        </div>
        {creators.length ? (
          <CreatorTable
            creators={creators}
            onOpen={onOpen}
            crmCreatorIds={crmCreatorIds}
            onAddToCrm={onAddToCrm}
          />
        ) : (
          <div className="empty">没有符合当前筛选条件的作者。</div>
        )}
      </section>
    </>
  );
}

function CreatorTable({
  creators,
  onOpen,
  compact = false,
  crmCreatorIds,
  onAddToCrm,
}: {
  creators: Creator[];
  onOpen: (id: string) => void;
  compact?: boolean;
  crmCreatorIds?: Set<string>;
  onAddToCrm?: (id: string) => void;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>创作者</th>
            <th>内容方向</th>
            <th>垂直度</th>
            <th>内容筛选</th>
            {!compact && <th>天牧查重</th>}
            <th>最终状态</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {creators.map((creator) => (
            <tr key={creator.id}>
              <td>
                <div className="creator-cell">
                  <div className="creator-avatar" style={{ background: creator.avatarColor }}>
                    {creator.nickname.slice(0, 1)}
                  </div>
                  <div>
                    <div className="creator-name-line">
                      <button
                        type="button"
                        className="creator-name-link"
                        onClick={() => onOpen(creator.id)}
                      >
                        {creator.nickname}
                      </button>
                      {creator.emerging && <span className="badge badge-green" style={{ marginLeft: 7 }}>新锐</span>}
                    </div>
                    <div className="creator-id">
                      @{creator.douyinAccount} · {creator.followers.toLocaleString()} 粉
                      {" · "}
                      <a
                        className="creator-profile-link"
                        href={creator.profileUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        抖音主页 ↗
                      </a>
                    </div>
                  </div>
                </div>
              </td>
              <td>
                <div style={{ fontWeight: 700 }}>{creator.subcategory}</div>
                <div className="creator-id">{creator.keyword}</div>
              </td>
              <td>
                <div className="metric">
                  <div className="meter"><span style={{ width: `${creator.verticality}%` }} /></div>
                  <strong>{creator.verticality}</strong>
                </div>
              </td>
              <td><span className={`badge ${badgeTone(creator.recommendation)}`}>{recommendationLabel[creator.recommendation]}</span></td>
              {!compact && <td><span className={`badge ${badgeTone(creator.tianmuStatus)}`}>{tianmuLabel[creator.tianmuStatus]}</span></td>}
              <td><span className={`badge ${badgeTone(creator.finalStatus)}`}>{finalLabel(creator.finalStatus)}</span></td>
              <td>
                <div className="task-actions">
                  {!compact && onAddToCrm && (
                    <button
                      className="btn btn-quiet"
                      disabled={crmCreatorIds?.has(creator.id)}
                      onClick={() => onAddToCrm(creator.id)}
                    >
                      {crmCreatorIds?.has(creator.id) ? "已入 CRM" : "加入 CRM"}
                    </button>
                  )}
                  <button className="btn btn-quiet" onClick={() => onOpen(creator.id)}>详情 →</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreatorDetail({
  creator,
  onBack,
  onUpdate,
  inCrm,
  onAddToCrm,
}: {
  creator: Creator;
  onBack: () => void;
  onUpdate: (
    id: string,
    patch: Partial<Pick<Creator, "recommendation" | "tianmuStatus" | "finalStatus">>,
  ) => void;
  inCrm: boolean;
  onAddToCrm: (id: string) => void;
}) {
  return (
    <>
      <PageHead
        title={creator.nickname}
        copy={`首次由“${creator.keyword}”发现 · Mock 数据`}
        actions={
          <>
            <button className="btn" onClick={onBack}>← 返回候选池</button>
            <button
              className="btn btn-primary"
              disabled={inCrm}
              onClick={() => onAddToCrm(creator.id)}
            >
              {inCrm ? "已在 CRM" : "加入建联 CRM"}
            </button>
          </>
        }
      />
      <div className="detail-grid">
        <div style={{ display: "grid", gap: 16 }}>
          <section className="card profile-card">
            <div className="profile-top">
              <div className="profile-avatar" style={{ background: creator.avatarColor }}>{creator.nickname.slice(0, 1)}</div>
              <div>
                <div className="profile-name">{creator.nickname}</div>
                <div className="creator-id">@{creator.douyinAccount} · {creator.category} / {creator.subcategory}</div>
                <a
                  className="profile-link"
                  href={creator.profileUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  打开抖音主页 ↗
                </a>
              </div>
              <span className={`badge ${badgeTone(creator.finalStatus)}`} style={{ marginLeft: "auto" }}>{finalLabel(creator.finalStatus)}</span>
            </div>
            <div className="profile-bio">{creator.bio}</div>
            <div className="profile-metrics">
              <div className="mini-metric"><strong>{creator.followers.toLocaleString()}</strong><span>粉丝（辅助）</span></div>
              <div className="mini-metric"><strong>{creator.totalLikes.toLocaleString()}</strong><span>总获赞（辅助）</span></div>
              <div className="mini-metric"><strong>{creator.targetRatio}%</strong><span>目标内容占比</span></div>
            </div>
          </section>
          <section className="card">
            <div className="card-head">
              <div><div className="card-title">代表作品</div><div className="card-sub">用于快速复核内容质量的证据样本</div></div>
            </div>
            <div className="works-list">
              {creator.works.map((work) => (
                <div className="work-row" key={work.id}>
                  <div>
                    <div className="work-title">{work.title}</div>
                    <div className="work-meta"><span>{work.format}</span><span>信息增量 {work.infoValue}</span><span>百度适配 {work.baiduFit}</span><span>{work.publishedAt}</span></div>
                  </div>
                  <span className="badge badge-gray">{work.likes.toLocaleString()} 赞</span>
                </div>
              ))}
            </div>
          </section>
        </div>
        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          <section className="card analysis">
            <div className="card-title">内容判断依据</div>
            <div className="analysis-grid">
              <div className="analysis-item"><span>内容垂直度</span><strong>{creator.verticality} / 100</strong></div>
              <div className="analysis-item"><span>原创风险</span><strong>{creator.originalityRisk}</strong></div>
              <div className="analysis-item"><span>内容结论</span><strong>{recommendationLabel[creator.recommendation]}</strong></div>
              <div className="analysis-item"><span>新锐潜力</span><strong>{creator.emerging ? "是" : "否"}</strong></div>
            </div>
            <div className="analysis-copy">{creator.reasoning}</div>
          </section>
          <section className="card analysis">
            <div className="card-title">天牧昵称查重</div>
            <div className="notice" style={{ margin: "13px 0" }}>
              仅使用完整抖音昵称查询。多个同名或相似结果不会自动判定。
            </div>
            <div className="analysis-item">
              <span>当前结果</span>
              <strong>{tianmuLabel[creator.tianmuStatus]}</strong>
            </div>
            <div className="task-actions" style={{ marginTop: 12, flexWrap: "wrap" }}>
              <button
                className="btn"
                onClick={() =>
                  onUpdate(creator.id, {
                    tianmuStatus: "NOT_MATCHED",
                    finalStatus: creator.recommendation === "RECOMMENDED" ? "RECOMMENDED_FOR_BD" : "MANUAL_REVIEW",
                  })
                }
              >
                标记未匹配
              </button>
              <button
                className="btn"
                onClick={() =>
                  onUpdate(creator.id, {
                    tianmuStatus: "MATCHED",
                    finalStatus: "ALREADY_IN_TIANMU",
                  })
                }
              >
                确认已匹配
              </button>
              <button
                className="btn"
                onClick={() =>
                  onUpdate(creator.id, {
                    tianmuStatus: "REVIEW_REQUIRED",
                    finalStatus: "MANUAL_REVIEW",
                  })
                }
              >
                需要复核
              </button>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function TianmuQueue({ authorPoolUrl, onOpen, onConfirmed }: {
  authorPoolUrl?: string;
  onOpen: (id: string) => void;
  onConfirmed: (id: string, status: TianmuStatus, finalStatus: Creator["finalStatus"]) => void;
}) {
  const [rows, setRows] = useState<TianmuPendingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tianmu/pending")
      .then(async (response) => response.ok ? response.json() as Promise<{ creators: TianmuPendingRow[] }> : Promise.reject())
      .then(({ creators }) => setRows(creators))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  async function confirm(row: TianmuPendingRow, status: TianmuStatus) {
    const response = await fetch("/api/tianmu/checks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creatorId: row.id, nickname: row.nickname, status, resultCount: status === "MATCHED" ? 1 : 0, exactMatchNicknames: status === "MATCHED" ? [row.nickname] : [] }),
    });
    if (!response.ok) return;
    const finalStatus: Creator["finalStatus"] = status === "NOT_MATCHED" ? "RECOMMENDED_FOR_BD" : status === "MATCHED" ? "ALREADY_IN_TIANMU" : "MANUAL_REVIEW";
    setRows((items) => items.filter((item) => item.id !== row.id));
    onConfirmed(row.id, status, finalStatus);
  }

  return <>
    <PageHead title="天牧待查队列" copy="只列出内容已推荐的作者。先在天牧用完整昵称查询，再人工确认结果，系统会自动回写候选池。" actions={authorPoolUrl ?
      <a className="btn btn-primary" href={authorPoolUrl} target="_blank" rel="noreferrer">打开天牧作者池 ↗</a> :
      <span className="badge badge-gray">未配置天牧地址</span>
    } />
    <div className="notice" style={{ marginBottom: 16 }}>登录、验证码或访问限制出现时任务不会丢失；完成平台验证后回到此页继续确认。系统不会绕过平台安全验证。</div>
    <section className="card">
      {loading ? <div className="empty-state">正在读取待查作者…</div> : rows.length === 0 ? <div className="empty-state">当前没有待查作者</div> :
        <div className="table-wrap"><table><thead><tr><th>作者</th><th>内容品类</th><th>推荐依据</th><th>核验操作</th></tr></thead><tbody>
          {rows.map((row) => <tr key={row.id}>
            <td><button className="link-button" onClick={() => onOpen(row.id)}>{row.nickname}</button><div className="creator-id">@{row.douyin_account}</div></td>
            <td>{row.main_category}</td><td className="reason-cell">{row.reasoning}</td>
            <td><div className="task-actions"><button className="btn" onClick={() => void confirm(row, "NOT_MATCHED")}>未找到</button><button className="btn" onClick={() => void confirm(row, "MATCHED")}>确认同名</button><button className="btn" onClick={() => void confirm(row, "REVIEW_REQUIRED")}>需复核</button></div></td>
          </tr>)}</tbody></table></div>}
    </section>
  </>;
}

function CRMWorkspace({
  creators,
  records,
  onOpen,
  onUpdate,
  onToast,
}: {
  creators: Creator[];
  records: CRMRecord[];
  onOpen: (id: string) => void;
  onUpdate: (id: string, patch: Partial<CRMRecord>) => void;
  onToast: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<CRMStage | "ALL">("ALL");
  const creatorMap = useMemo(
    () => new Map(creators.map((creator) => [creator.id, creator])),
    [creators],
  );
  const rows = useMemo(
    () =>
      records.filter((record) => {
        const creator = creatorMap.get(record.creatorId);
        const text = `${creator?.nickname ?? ""}${creator?.douyinAccount ?? ""}${record.owner}${record.contactInfo}${record.note}`.toLowerCase();
        return text.includes(query.toLowerCase()) && (stage === "ALL" || record.stage === stage);
      }),
    [creatorMap, query, records, stage],
  );

  function exportCrm() {
    const header = [
      "创作者昵称", "抖音号", "抖音主页", "内容方向", "粉丝数", "发现关键词",
      "内容结论", "天牧结果", "CRM阶段", "负责人", "联系方式", "最近跟进",
      "下次跟进", "跟进备注", "推荐理由", "加入CRM时间",
    ];
    const data = rows.map((record) => {
      const creator = creatorMap.get(record.creatorId);
      return [
        creator?.nickname ?? "", creator?.douyinAccount ?? "", creator?.profileUrl ?? "",
        creator ? `${creator.category}/${creator.subcategory}` : "", creator?.followers ?? "",
        creator?.keyword ?? "", creator ? recommendationLabel[creator.recommendation] : "",
        creator ? tianmuLabel[creator.tianmuStatus] : "", crmStageLabel[record.stage], record.owner,
        record.contactInfo, record.lastContactAt, record.nextFollowUpAt, record.note,
        creator?.reasoning ?? "", record.addedAt.slice(0, 10),
      ];
    });
    const csv = [header, ...data]
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `百家号创作者CRM-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    onToast(`已导出 ${rows.length} 条 CRM 记录`);
  }

  const followUpCount = records.filter((record) =>
    record.nextFollowUpAt && record.nextFollowUpAt <= new Date().toISOString().slice(0, 10),
  ).length;

  return (
    <>
      <PageHead
        title="建联 CRM"
        copy="人工确认后的作者在这里持续跟进；导出内容以当前 CRM 筛选结果为准。"
        actions={<button className="btn btn-primary" onClick={exportCrm}>⇩ 导出 CRM 表格</button>}
      />
      <div className="stats-grid crm-stats">
        {[
          ["CRM 作者", records.length],
          ["待建联", records.filter((record) => record.stage === "TO_CONTACT").length],
          ["沟通中", records.filter((record) => ["CONTACTED", "IN_DISCUSSION", "INTENT_CONFIRMED"].includes(record.stage)).length],
          ["今日需跟进", followUpCount],
        ].map(([label, value]) => (
          <div className="stat-card" key={label}>
            <div className="stat-label">{label}</div>
            <div className="stat-value crm-stat-value">{value}</div>
          </div>
        ))}
      </div>
      <section className="card">
        <div className="toolbar">
          <input
            className="field search-field"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索作者、负责人、联系方式或备注"
          />
          <select className="field" value={stage} onChange={(event) => setStage(event.target.value as CRMStage | "ALL")}>
            <option value="ALL">全部跟进阶段</option>
            {crmStageOptions.map((value) => <option value={value} key={value}>{crmStageLabel[value]}</option>)}
          </select>
        </div>
        {rows.length ? (
          <div className="table-wrap">
            <table className="crm-table">
              <thead><tr><th>创作者</th><th>跟进阶段</th><th>负责人</th><th>联系方式</th><th>最近跟进</th><th>下次跟进</th><th>备注</th><th /></tr></thead>
              <tbody>
                {rows.map((record) => {
                  const creator = creatorMap.get(record.creatorId);
                  if (!creator) return null;
                  return (
                    <tr key={record.id}>
                      <td>
                        <button className="creator-name-link" onClick={() => onOpen(creator.id)}>{creator.nickname}</button>
                        <div className="creator-id">@{creator.douyinAccount} · {creator.subcategory}</div>
                      </td>
                      <td>
                        <select className="field crm-field" value={record.stage} onChange={(event) => onUpdate(record.id, { stage: event.target.value as CRMStage })}>
                          {crmStageOptions.map((value) => <option value={value} key={value}>{crmStageLabel[value]}</option>)}
                        </select>
                      </td>
                      <td><input className="field crm-field crm-short" value={record.owner} onChange={(event) => onUpdate(record.id, { owner: event.target.value })} /></td>
                      <td><input className="field crm-field" value={record.contactInfo} placeholder="微信/邮箱/电话" onChange={(event) => onUpdate(record.id, { contactInfo: event.target.value })} /></td>
                      <td><input className="field crm-field" type="date" value={record.lastContactAt} onChange={(event) => onUpdate(record.id, { lastContactAt: event.target.value })} /></td>
                      <td><input className="field crm-field" type="date" value={record.nextFollowUpAt} onChange={(event) => onUpdate(record.id, { nextFollowUpAt: event.target.value })} /></td>
                      <td><input className="field crm-field crm-note" value={record.note} placeholder="本次结论和下一步" onChange={(event) => onUpdate(record.id, { note: event.target.value })} /></td>
                      <td><button className="btn btn-quiet" onClick={() => onOpen(creator.id)}>详情 →</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">CRM 里还没有符合当前条件的作者，请先从候选池人工加入。</div>
        )}
      </section>
    </>
  );
}

function Logs() {
  return (
    <>
      <PageHead title="运行日志" copy="所有关键步骤都保留结果；异常不会静默跳过。" />
      <section className="card">
        <div className="card-head">
          <div><div className="card-title">最近事件</div><div className="card-sub">Mock 任务日志</div></div>
          <span className="badge badge-green">系统正常</span>
        </div>
        {logs.map((log) => (
          <div className="log-row" key={log.id}>
            <span className="log-time">{log.time}</span>
            <span className={`badge ${log.level === "INFO" ? "badge-green" : log.level === "WARN" ? "badge-amber" : "badge-red"}`}>{log.level}</span>
            <strong>{log.module}</strong>
            <span>{log.message}</span>
            <button className="btn btn-quiet">{log.level === "ERROR" ? "重试" : "查看"}</button>
          </div>
        ))}
      </section>
    </>
  );
}

function NewTaskModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (task: SearchTask) => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [keywords, setKeywords] = useState("");
  const [targetRequirement, setTargetRequirement] = useState("");
  const [resultLimit, setResultLimit] = useState(12);
  const [worksLimit, setWorksLimit] = useState(6);
  const keywordCount = keywords.split("\n").map((value) => value.trim()).filter(Boolean).length;
  const estimatedApiCalls = keywordCount + keywordCount * resultLimit * 2;
  function create() {
    const list = keywords.split("\n").map((value) => value.trim()).filter(Boolean);
    if (!name.trim() || !list.length || !targetRequirement.trim()) return;
    onCreate({
      id: `task-${Date.now()}`,
      name: name.trim(),
      category: category.trim() || "AI识别类目",
      keywords: list,
      targetRequirement: targetRequirement.trim(),
      resultLimitPerKeyword: resultLimit,
      worksLimitPerCreator: worksLimit,
      estimatedApiCalls,
      checkpoint: { keywordIndex: 0, creatorIndex: 0 },
      pauseReason: "",
      failures: [],
      status: "PAUSED",
      progress: 0,
      discovered: 0,
      recommended: 0,
      checked: 0,
      bdReady: 0,
      lastRun: "尚未运行",
    });
  }
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="新建搜索任务" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head"><strong>新建搜索任务</strong><button className="btn btn-quiet" onClick={onClose}>×</button></div>
        <div className="modal-body">
          <div className="form-row"><label>任务名称</label><input className="field" value={name} placeholder="例如：优质美妆教程作者" onChange={(event) => setName(event.target.value)} /></div>
          <div className="form-row"><label>目标类目（可选）</label><input className="field" value={category} placeholder="可自定义；留空由 AI 根据结果识别" onChange={(event) => setCategory(event.target.value)} /></div>
          <div className="form-row"><label>搜索关键词（每行一个）</label><textarea className="field" value={keywords} placeholder="例如：敏感肌护肤\n通勤妆教程\n成分测评" onChange={(event) => setKeywords(event.target.value)} /></div>
          <div className="form-row"><label>筛选引进标准</label><textarea className="field" value={targetRequirement} placeholder="例如：寻找持续原创、近期稳定更新、有真人表达，适合引入百家号长期运营的美妆创作者。粉丝量不是硬门槛。" onChange={(event) => setTargetRequirement(event.target.value)} /></div>
          <div className="budget-grid">
            <div className="form-row"><label>每个关键词候选上限</label><input className="field" type="number" min="5" max="50" value={resultLimit} onChange={(event) => setResultLimit(Math.max(5, Math.min(50, Number(event.target.value))))} /></div>
            <div className="form-row"><label>每位作者采样作品</label><input className="field" type="number" min="3" max="12" value={worksLimit} onChange={(event) => setWorksLimit(Math.max(3, Math.min(12, Number(event.target.value))))} /></div>
          </div>
          <div className="notice">额度预估：最坏约 {estimatedApiCalls} 次 TikHub 请求。系统先用搜索结果初筛，去重后只补采高潜作者主页与作品；已采集作者优先复用缓存。关键词只负责发现，最终按账号整体内容归类和筛选。</div>
        </div>
        <div className="modal-foot"><button className="btn" onClick={onClose}>取消</button><button className="btn btn-primary" onClick={create}>创建任务</button></div>
      </div>
    </div>
  );
}
