/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { processTask, type RuntimeEnv } from "./task-processor";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  TIKHUB_API_KEY?: string;
  FALLBACK_CRAWLER_URL?: string;
  FALLBACK_CRAWLER_TOKEN?: string;
  LLM_API_KEY?: string;
  LLM_BASE_URL?: string;
  LLM_MODEL?: string;
  CREATOR_ENGINE_SHADOW_MODE?: string;
  TIANMU_AUTHOR_POOL_URL?: string;
  APP_MODE?: string;
  AI_PROVIDER?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/tikhub/status") return tikhubStatus(env);
    if (url.pathname === "/api/runtime/status") return Response.json({ mode: env.APP_MODE === "live" ? "live" : "mock", aiProvider: env.AI_PROVIDER ?? "mock", tianmuAuthorPoolUrl: env.TIANMU_AUTHOR_POOL_URL ?? "" });
    if (url.pathname === "/api/logs" && request.method === "GET") return listLogs(env.DB, url);
    if (url.pathname === "/api/tasks" && request.method === "GET") return listTasks(env.DB);
    if (url.pathname === "/api/tasks" && request.method === "POST") return createTask(request, env, ctx);
    if (url.pathname === "/api/creators" && request.method === "GET") return listCreators(env.DB);
    if (url.pathname === "/api/crm") return crmCollection(request, env.DB);
    const crmMatch = url.pathname.match(/^\/api\/crm\/([^/]+)$/);
    if (crmMatch) return crmRecord(request, env.DB, decodeURIComponent(crmMatch[1]));
    if (url.pathname === "/api/tianmu/pending" && request.method === "GET") return tianmuPending(env.DB);
    if (url.pathname === "/api/tianmu/checks" && request.method === "POST") return saveTianmuCheck(request, env.DB);
    if (url.pathname === "/api/shadow/report" && request.method === "GET") return shadowReport(env.DB, url);
    const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)(?:\/(results|run|pause|retry-failures))?$/);
    if (taskMatch) return taskRoute(request, env, ctx, decodeURIComponent(taskMatch[1]), taskMatch[2]);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;

async function tikhubStatus(env: Env) {
  if (!env.TIKHUB_API_KEY) return Response.json({ status: "NOT_CONFIGURED", balance: null, freeCredit: null });
  try {
    const response = await fetch("https://api.tikhub.io/api/v1/tikhub/user/get_user_info", { headers: { Authorization: `Bearer ${env.TIKHUB_API_KEY}` }, signal: AbortSignal.timeout(20000) });
    const payload = await response.json() as { code?: number; user_data?: { balance?: number; free_credit?: number; is_active?: boolean } };
    const healthy = response.ok && payload.code === 200 && payload.user_data?.is_active !== false;
    return Response.json({ status: healthy ? "HEALTHY" : "UNAVAILABLE", balance: payload.user_data?.balance ?? null, freeCredit: payload.user_data?.free_credit ?? null }, { status: healthy ? 200 : 503 });
  } catch { return Response.json({ status: "UNAVAILABLE", balance: null, freeCredit: null }, { status: 503 }); }
}

async function createTask(request: Request, env: Env, ctx: ExecutionContext) {
  const body = await request.json() as { name?: string; category?: string; keywords?: string[]; targetRequirement?: string; resultLimitPerKeyword?: number; worksLimitPerCreator?: number };
  if (!body.name?.trim() || !body.keywords?.length || !body.targetRequirement?.trim()) return Response.json({ error: "任务名称、关键词和筛选标准必填" }, { status: 400 });
  const id = `task-${crypto.randomUUID()}`; const stamp = new Date().toISOString(); const resultLimit = clamp(body.resultLimitPerKeyword, 5, 50, 12); const worksLimit = clamp(body.worksLimitPerCreator, 3, 12, 6);
  await env.DB.prepare("INSERT INTO search_tasks (id,name,primary_category,secondary_categories,keywords,target_requirement,status,progress,result_limit_per_keyword,works_limit_per_creator,created_at,updated_at,checkpoint,pause_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id, body.name.trim(), body.category?.trim() || "AI识别类目", "[]", JSON.stringify(body.keywords), body.targetRequirement.trim(), "PENDING", 0, resultLimit, worksLimit, stamp, stamp, JSON.stringify({ keywordIndex: 0, creatorIndex: 0 }), "").run();
  ctx.waitUntil(processTask(env as RuntimeEnv, id));
  return Response.json({ id, status: "PENDING" }, { status: 201 });
}

async function listTasks(db: D1Database) {
  const result = await db.prepare("SELECT t.*, (SELECT COUNT(*) FROM creator_discoveries d WHERE d.task_id=t.id) AS discovered, (SELECT COUNT(*) FROM creator_discoveries d JOIN creator_analyses a ON a.creator_id=d.creator_id WHERE d.task_id=t.id AND a.recommendation='RECOMMENDED') AS recommended, (SELECT COUNT(*) FROM task_failures f WHERE f.task_id=t.id AND f.status IN ('PENDING','RETRYING')) AS failure_count FROM search_tasks t ORDER BY t.created_at DESC LIMIT 100").all() as { results?: unknown[] };
  return Response.json({ tasks: result.results ?? [] });
}

async function listCreators(db: D1Database) {
  const result = await db.prepare("SELECT c.id,c.douyin_account,c.nickname,c.profile_url,c.bio,c.follower_count,c.total_likes,c.tianmu_status,c.final_status,c.profile_status,c.evidence_level,c.evidence_warnings,c.profile_retry_count,a.main_category,a.content_verticality,a.target_content_ratio,a.repost_risk,a.recommendation,a.reasoning,a.is_emerging_creator,d.keyword FROM creators c LEFT JOIN creator_analyses a ON a.creator_id=c.id LEFT JOIN creator_discoveries d ON d.creator_id=c.id GROUP BY c.id ORDER BY c.first_discovered_at DESC LIMIT 500").all() as { results?: unknown[] };
  return Response.json({ creators: result.results ?? [] });
}

async function listLogs(db: D1Database, url: URL) {
  const level = url.searchParams.get("level");
  const taskId = url.searchParams.get("taskId");
  const limit = clamp(Number(url.searchParams.get("limit") ?? 100), 1, 300, 100);
  const conditions: string[] = []; const values: unknown[] = [];
  if (level && ["INFO", "WARN", "ERROR"].includes(level)) { conditions.push("l.level=?"); values.push(level); }
  if (taskId) { conditions.push("l.task_id=?"); values.push(taskId); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await db.prepare(`SELECT l.id,l.task_id,l.creator_id,l.level,l.module,l.action,l.message,l.metadata,l.created_at,t.name AS task_name FROM task_logs l LEFT JOIN search_tasks t ON t.id=l.task_id ${where} ORDER BY l.created_at DESC LIMIT ?`).bind(...values, limit).all() as { results?: unknown[] };
  const summary = await db.prepare("SELECT level,COUNT(*) AS count FROM task_logs GROUP BY level").all() as { results?: Array<{ level: string; count: number }> };
  return Response.json({ logs: result.results ?? [], summary: Object.fromEntries((summary.results ?? []).map((row) => [row.level, row.count])) });
}

async function shadowReport(db: D1Database, url: URL) {
  const taskId = url.searchParams.get("taskId");
  const where = taskId ? "WHERE s.task_id=?" : "";
  const query = `SELECT s.*,c.nickname,a.reasoning FROM creator_shadow_evaluations s JOIN creators c ON c.id=s.creator_id LEFT JOIN creator_analyses a ON a.creator_id=s.creator_id ${where} ORDER BY s.created_at DESC LIMIT 500`;
  const result = taskId ? await db.prepare(query).bind(taskId).all() : await db.prepare(query).all() as { results?: unknown[] };
  const rows = (result as { results?: Array<Record<string, unknown>> }).results ?? [];
  const disagreements = rows.filter((row) => {
    const base = Number(row.base_score ?? 0);
    const expected = base >= 65 ? "RECOMMENDED" : base >= 45 ? "REVIEW_REQUIRED" : "NOT_RECOMMENDED";
    return expected !== row.llm_recommendation;
  }).length;
  return Response.json({ summary: { total: rows.length, disagreements, disagreementRate: rows.length ? disagreements / rows.length : 0 }, evaluations: rows });
}

async function crmCollection(request: Request, db: D1Database) {
  if (request.method === "GET") {
    const result = await db.prepare("SELECT r.*,c.nickname,c.douyin_account,c.profile_url,c.follower_count,c.tianmu_status,c.final_status,a.main_category,a.recommendation,a.reasoning FROM creator_crm_records r JOIN creators c ON c.id=r.creator_id LEFT JOIN creator_analyses a ON a.creator_id=c.id ORDER BY r.updated_at DESC").all() as { results?: unknown[] };
    return Response.json({ records: result.results ?? [] });
  }
  if (request.method === "POST") {
    const body = await request.json() as { creatorId?: string; owner?: string }; if (!body.creatorId) return Response.json({ error: "creatorId 必填" }, { status: 400 });
    const existing = await db.prepare("SELECT id FROM creator_crm_records WHERE creator_id=?").bind(body.creatorId).first() as { id?: string } | null;
    const id = existing?.id ?? `crm-${crypto.randomUUID()}`; const stamp = new Date().toISOString();
    if (!existing) await db.batch([
      db.prepare("INSERT INTO creator_crm_records (id,creator_id,stage,owner,contact_info,note,added_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").bind(id, body.creatorId, "TO_CONTACT", body.owner ?? "", "", "", stamp, stamp),
      db.prepare("INSERT INTO creator_crm_events (id,crm_record_id,creator_id,event_type,new_value,note,created_at) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(), id, body.creatorId, "ADDED", "TO_CONTACT", "加入 CRM", stamp),
    ]);
    const record = await db.prepare("SELECT * FROM creator_crm_records WHERE creator_id=?").bind(body.creatorId).first(); return Response.json({ record }, { status: 201 });
  }
  return Response.json({ error: "不支持的操作" }, { status: 405 });
}

async function crmRecord(request: Request, db: D1Database, id: string) {
  if (request.method !== "PATCH") return Response.json({ error: "不支持的操作" }, { status: 405 });
  const body = await request.json() as { stage?: string; owner?: string; contactInfo?: string; lastContactAt?: string; nextFollowUpAt?: string; note?: string };
  const old = await db.prepare("SELECT * FROM creator_crm_records WHERE id=?").bind(id).first() as Record<string, unknown> | null; if (!old) return Response.json({ error: "CRM 记录不存在" }, { status: 404 });
  const values = { stage: body.stage ?? old.stage, owner: body.owner ?? old.owner, contactInfo: body.contactInfo ?? old.contact_info, lastContactAt: body.lastContactAt ?? old.last_contact_at, nextFollowUpAt: body.nextFollowUpAt ?? old.next_follow_up_at, note: body.note ?? old.note };
  const stamp = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE creator_crm_records SET stage=?,owner=?,contact_info=?,last_contact_at=?,next_follow_up_at=?,note=?,updated_at=? WHERE id=?").bind(values.stage, values.owner, values.contactInfo, values.lastContactAt || null, values.nextFollowUpAt || null, values.note, stamp, id),
    db.prepare("INSERT INTO creator_crm_events (id,crm_record_id,creator_id,event_type,old_value,new_value,note,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), id, old.creator_id, "UPDATED", String(old.stage ?? ""), String(values.stage), String(values.note ?? ""), stamp),
  ]);
  return Response.json({ success: true });
}

async function tianmuPending(db: D1Database) {
  const result = await db.prepare("SELECT c.id,c.nickname,c.douyin_account,c.profile_url,a.main_category,a.recommendation,a.reasoning FROM creators c JOIN creator_analyses a ON a.creator_id=c.id WHERE a.recommendation='RECOMMENDED' AND c.tianmu_status IN ('NOT_CHECKED','LOGIN_EXPIRED','NO_PERMISSION','REVIEW_REQUIRED') ORDER BY a.content_verticality DESC").all() as { results?: unknown[] };
  return Response.json({ creators: result.results ?? [] });
}

async function saveTianmuCheck(request: Request, db: D1Database) {
  const body = await request.json() as { creatorId?: string; nickname?: string; status?: string; resultCount?: number; exactMatchNicknames?: string[]; similarMatchNicknames?: string[]; errorReason?: string };
  const allowed = ["MATCHED", "NOT_MATCHED", "REVIEW_REQUIRED", "LOGIN_EXPIRED", "NO_PERMISSION"]; if (!body.creatorId || !body.nickname || !allowed.includes(body.status ?? "")) return Response.json({ error: "查重参数无效" }, { status: 400 });
  const stamp = new Date().toISOString(); const exact = body.exactMatchNicknames ?? []; const similar = body.similarMatchNicknames ?? []; const status = body.status!;
  const finalStatus = status === "NOT_MATCHED" ? "RECOMMENDED_FOR_BD" : status === "MATCHED" ? "ALREADY_IN_TIANMU" : "MANUAL_REVIEW";
  await db.batch([
    db.prepare("INSERT INTO tianmu_checks (id,creator_id,original_nickname,query_nickname,normalized_nickname,result_count,exact_match_count,exact_match_nicknames,similar_match_nicknames,status,error_reason,requires_manual_review,manually_confirmed,checked_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), body.creatorId, body.nickname, body.nickname.trim(), body.nickname.trim(), body.resultCount ?? exact.length + similar.length, exact.length, JSON.stringify(exact), JSON.stringify(similar), status, body.errorReason ?? null, status === "REVIEW_REQUIRED" ? 1 : 0, 1, stamp),
    db.prepare("UPDATE creators SET tianmu_status=?,final_status=? WHERE id=?").bind(status, finalStatus, body.creatorId),
  ]);
  return Response.json({ success: true, finalStatus });
}

async function taskRoute(request: Request, env: Env, ctx: ExecutionContext, id: string, action?: string) {
  if (action === "results" && request.method === "GET") {
    const result = await env.DB.prepare("SELECT c.id,c.nickname,c.douyin_account,c.profile_url,c.bio,c.follower_count,c.total_likes,c.tianmu_status,c.final_status,d.keyword,a.main_category,a.content_verticality,a.recommendation,a.reasoning,a.confidence FROM creator_discoveries d JOIN creators c ON c.id=d.creator_id LEFT JOIN creator_analyses a ON a.creator_id=c.id WHERE d.task_id=? ORDER BY a.content_verticality DESC").bind(id).all() as { results?: unknown[] };
    return Response.json({ creators: result.results ?? [] });
  }
  if (request.method === "GET") {
    const task = await env.DB.prepare("SELECT * FROM search_tasks WHERE id=?").bind(id).first(); const failures = await env.DB.prepare("SELECT * FROM task_failures WHERE task_id=? ORDER BY created_at DESC").bind(id).all() as { results?: unknown[] };
    return task ? Response.json({ task, failures: failures.results ?? [] }) : Response.json({ error: "任务不存在" }, { status: 404 });
  }
  if (request.method === "DELETE") { await env.DB.prepare("DELETE FROM search_tasks WHERE id=?").bind(id).run(); return Response.json({ success: true }); }
  if (request.method === "POST" && action === "pause") { await env.DB.prepare("UPDATE search_tasks SET status='PAUSED',pause_reason='用户暂停',updated_at=? WHERE id=?").bind(new Date().toISOString(), id).run(); return Response.json({ success: true }); }
  if (request.method === "POST" && (action === "run" || action === "retry-failures")) {
    if (action === "retry-failures") await env.DB.prepare("UPDATE task_failures SET status='RETRYING',retry_count=retry_count+1,updated_at=? WHERE task_id=? AND status='PENDING' AND retry_count<3").bind(new Date().toISOString(), id).run();
    const stamp = new Date().toISOString();
    const queued = await env.DB.prepare("UPDATE search_tasks SET status='PENDING',progress=CASE WHEN status='COMPLETED' THEN 0 ELSE progress END,checkpoint=CASE WHEN status='COMPLETED' THEN ? ELSE checkpoint END,pause_reason='',updated_at=? WHERE id=? AND status NOT IN ('RUNNING','PENDING')").bind(JSON.stringify({ keywordIndex: 0, creatorIndex: 0 }), stamp, id).run();
    if (Number((queued as { meta?: { changes?: number } }).meta?.changes ?? 0) !== 1) {
      const task = await env.DB.prepare("SELECT status FROM search_tasks WHERE id=?").bind(id).first() as { status?: string } | null;
      if (!task) return Response.json({ error: "任务不存在" }, { status: 404 });
      return Response.json({ error: task.status === "RUNNING" ? "任务已经在运行，请勿重复提交" : "任务已经进入执行队列" }, { status: 409 });
    }
    ctx.waitUntil(processTask(env as RuntimeEnv, id)); return Response.json({ success: true, status: "RUNNING" }, { status: 202 });
  }
  return Response.json({ error: "不支持的操作" }, { status: 405 });
}

function clamp(value: number | undefined, min: number, max: number, fallback: number) { return Math.max(min, Math.min(max, Number(value ?? fallback))); }
