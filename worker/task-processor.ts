import { TikHubDouyinAdapter, TikHubError } from "../lib/adapters/tikhub";
import { analyzeCreator } from "../lib/services/creator-analysis";
import { runCreatorEngine, type CreatorEngineResult } from "../lib/creator-engine";

export type RuntimeEnv = { DB: D1Database; TIKHUB_API_KEY?: string; LLM_API_KEY?: string; LLM_BASE_URL?: string; LLM_MODEL?: string; CREATOR_ENGINE_SHADOW_MODE?: string };
type TaskRow = { id: string; keywords: string; target_requirement: string; result_limit_per_keyword: number; works_limit_per_creator: number; checkpoint: string | null };

export async function processTask(env: RuntimeEnv, taskId: string) {
  const lock = await run(env.DB, "UPDATE search_tasks SET status='RUNNING',updated_at=?,last_run_at=?,pause_reason='' WHERE id=? AND status='PENDING'", now(), now(), taskId);
  if (changedRows(lock) !== 1) return;
  const task = await first<TaskRow>(env.DB, "SELECT id, keywords, target_requirement, result_limit_per_keyword, works_limit_per_creator, checkpoint FROM search_tasks WHERE id = ?", taskId);
  if (!task) return;
  if (!env.TIKHUB_API_KEY) return pause(env.DB, taskId, "TIKHUB_NOT_CONFIGURED", "请先配置 TikHub API Key");
  if (!env.LLM_API_KEY) return pause(env.DB, taskId, "LLM_NOT_CONFIGURED", "请先配置正式 LLM API");
  const keywords = parseJson<string[]>(task.keywords, []); const checkpoint = parseJson(task.checkpoint, { keywordIndex: 0, creatorIndex: 0 });
  const adapter = new TikHubDouyinAdapter(env.TIKHUB_API_KEY);
  const seen = new Set<string>();
  try {
    for (let keywordIndex = checkpoint.keywordIndex; keywordIndex < keywords.length; keywordIndex++) {
      if (!await isTaskRunning(env.DB, taskId)) return;
      const keyword = keywords[keywordIndex];
      const candidates = await adapter.searchUsers(keyword, task.result_limit_per_keyword);
      await log(env.DB, taskId, "SEARCH", `关键词“${keyword}”发现 ${candidates.length} 位候选`);
      const pendingCandidates = candidates.filter((item) => item.douyinUniqueId && !seen.has(item.douyinUniqueId));
      let profiles: import("../lib/adapters/types").CreatorProfile[];
      let profileBatchWarning = "";
      try {
        const cachedProfiles: import("../lib/adapters/types").CreatorProfile[] = [];
        const uncachedCandidates: typeof pendingCandidates = [];
        for (const candidate of pendingCandidates) {
          const cached = await cachedProfile(env.DB, candidate.douyinUniqueId!);
          if (cached) cachedProfiles.push({ ...candidate, bio: cached.bio ?? undefined, followers: cached.follower_count ?? undefined, totalLikes: cached.total_likes ?? undefined });
          else uncachedCandidates.push(candidate);
        }
        profiles = [...cachedProfiles, ...await adapter.collectProfiles(uncachedCandidates)];
        if (cachedProfiles.length) await log(env.DB, taskId, "PROFILE_CACHE", `复用 ${cachedProfiles.length} 位作者的已有主页数据，未重复调用 TikHub`);
      } catch (error) {
        if (isFatalTikHubError(error)) throw error;
        profiles = pendingCandidates.map((item) => ({ ...item }));
        profileBatchWarning = error instanceof Error ? error.message : "主页批量采集失败";
        await log(env.DB, taskId, "PROFILE_DEGRADED", `主页数据暂不可用，已保留 ${profiles.length} 位搜索候选`, "WARN");
      }
      for (let creatorIndex = keywordIndex === checkpoint.keywordIndex ? checkpoint.creatorIndex : 0; creatorIndex < profiles.length; creatorIndex++) {
        if (!await isTaskRunning(env.DB, taskId)) return;
        const profile = profiles[creatorIndex]; if (!profile.douyinUniqueId || seen.has(profile.douyinUniqueId)) continue; seen.add(profile.douyinUniqueId);
        await checkpointTask(env.DB, taskId, keywordIndex, creatorIndex);
        try {
          let works: import("../lib/adapters/types").CreatorWork[] = [];
          let worksWarning = "";
          try { works = await adapter.collectWorks(profile, task.works_limit_per_creator); }
          catch (error) {
            if (isFatalTikHubError(error)) throw error;
            worksWarning = error instanceof Error ? error.message : "近期作品采集失败";
            await log(env.DB, taskId, "WORKS_DEGRADED", `“${profile.nickname}”作品数据暂不可用，已保留主页证据`, "WARN");
          }
          const engine = runCreatorEngine({ profile, works, profileStatus: profileBatchWarning ? "BLOCKED" : profile.bio || profile.followers !== undefined ? "COLLECTED" : "PARTIAL", warning: profileBatchWarning || worksWarning });
          const analysis = await analyzeCreator(profile, works, task.target_requirement, { apiKey: env.LLM_API_KEY, baseUrl: env.LLM_BASE_URL, model: env.LLM_MODEL });
          await saveCreator(env.DB, taskId, keyword, profile, works, analysis, engine, env.CREATOR_ENGINE_SHADOW_MODE !== "false");
        } catch (error) {
          await saveFailure(env.DB, taskId, profile.nickname, "PROFILE", error);
        }
      }
      await checkpointTask(env.DB, taskId, keywordIndex + 1, 0);
      await updateProgress(env.DB, taskId, Math.round(((keywordIndex + 1) / keywords.length) * 100));
    }
    await run(env.DB, "UPDATE search_tasks SET status='COMPLETED', progress=100, updated_at=?, last_run_at=? WHERE id=? AND status='RUNNING'", now(), now(), taskId);
  } catch (error) {
    if (!await isTaskRunning(env.DB, taskId)) return;
    const type = error instanceof TikHubError ? error.type : "TASK_ERROR";
    await pause(env.DB, taskId, type, error instanceof Error ? error.message : "任务执行失败");
  }
}

async function saveCreator(db: D1Database, taskId: string, keyword: string, profile: import("../lib/adapters/types").CreatorProfile, works: import("../lib/adapters/types").CreatorWork[], analysis: import("../lib/services/creator-analysis").CreatorAnalysisResult, engine: CreatorEngineResult, shadowEnabled: boolean) {
  const creatorId = `creator-${profile.douyinUniqueId}`; const stamp = now(); const finalStatus = analysis.recommendation === "RECOMMENDED" ? "MANUAL_REVIEW" : "DO_NOT_CONTACT";
  const statements = [
    db.prepare("INSERT INTO creators (id,douyin_unique_id,douyin_account,nickname,profile_url,bio,follower_count,total_likes,first_discovered_at,last_collected_at,collection_status,profile_status,evidence_level,evidence_warnings,profile_retry_count,last_profile_attempt_at,analysis_status,tianmu_status,final_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET nickname=excluded.nickname,bio=excluded.bio,follower_count=excluded.follower_count,total_likes=excluded.total_likes,last_collected_at=excluded.last_collected_at,collection_status=excluded.collection_status,profile_status=excluded.profile_status,evidence_level=excluded.evidence_level,evidence_warnings=excluded.evidence_warnings,last_profile_attempt_at=excluded.last_profile_attempt_at,analysis_status=excluded.analysis_status").bind(creatorId, profile.douyinUniqueId, profile.douyinAccount ?? null, profile.nickname, profile.profileUrl, profile.bio ?? null, profile.followers ?? null, profile.totalLikes ?? null, stamp, stamp, engine.creator.profileStatus === "COLLECTED" ? "COLLECTED" : "PARTIAL", engine.creator.profileStatus, engine.creator.evidenceLevel, JSON.stringify(engine.creator.evidenceWarnings), engine.creator.profileStatus === "COLLECTED" ? 0 : 1, stamp, "ANALYZED", "NOT_CHECKED", finalStatus),
    db.prepare("INSERT INTO creator_discoveries (id,creator_id,task_id,keyword,source_video_url,discovered_at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), creatorId, taskId, keyword, profile.sourceVideoUrl || null, stamp),
    db.prepare("INSERT INTO creator_analyses (id,creator_id,main_category,secondary_categories,target_content_ratio,content_verticality,information_value,consistency,originality,repost_risk,baidu_fit,recommendation,reasoning,representative_work_ids,is_emerging_creator,confidence,analyzed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(creator_id) DO UPDATE SET main_category=excluded.main_category,recommendation=excluded.recommendation,reasoning=excluded.reasoning,confidence=excluded.confidence,analyzed_at=excluded.analyzed_at").bind(crypto.randomUUID(), creatorId, analysis.category, "[]", analysis.score / 100, analysis.score, "待人工复核", "待人工复核", "待人工复核", analysis.riskReason ? "中" : "低", analysis.score >= 60 ? "高" : "中", analysis.recommendation, analysis.matchReason, JSON.stringify(works.map((item) => item.platformWorkId)), 0, analysis.confidence, stamp),
  ];
  if (shadowEnabled) statements.push(db.prepare("INSERT INTO creator_shadow_evaluations (id,creator_id,task_id,engine_version,llm_recommendation,llm_match_score,base_score,profile_completeness,activity_score,commercial_signals_score,evidence_confidence,evidence_level,warnings,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), creatorId, taskId, "creator-engine-v1", analysis.recommendation, analysis.score, engine.baseScore.total, engine.baseScore.profileCompleteness, engine.baseScore.activity, engine.baseScore.commercialSignals, engine.baseScore.evidenceConfidence, engine.creator.evidenceLevel, JSON.stringify(engine.baseScore.reasons), stamp));
  await db.batch(statements);
  for (const work of works) await run(db, "INSERT OR IGNORE INTO works (id,creator_id,platform_work_id,title,description,work_url,publish_time,analysis_status) VALUES (?,?,?,?,?,?,?,?)", `work-${work.platformWorkId}`, creatorId, work.platformWorkId, work.title, work.description ?? null, work.workUrl, work.publishedAt ?? null, "COLLECTED");
}

async function saveFailure(db: D1Database, taskId: string, creatorName: string, stage: string, error: unknown) { const message = error instanceof Error ? error.message : "未知错误"; await run(db, "INSERT INTO task_failures (id,task_id,creator_name,stage,error_type,message,retry_count,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)", crypto.randomUUID(), taskId, creatorName, stage, message.startsWith("LLM_") ? "LLM_ERROR" : "PROFILE_ERROR", message, 0, "PENDING", now(), now()); }
async function checkpointTask(db: D1Database, id: string, keywordIndex: number, creatorIndex: number) { await run(db, "UPDATE search_tasks SET checkpoint=?,updated_at=? WHERE id=?", JSON.stringify({ keywordIndex, creatorIndex }), now(), id); }
async function updateProgress(db: D1Database, id: string, progress: number) { await run(db, "UPDATE search_tasks SET progress=?,updated_at=? WHERE id=?", progress, now(), id); }
async function pause(db: D1Database, id: string, type: string, reason: string) { await run(db, "UPDATE search_tasks SET status='PAUSED',pause_reason=?,updated_at=? WHERE id=?", `${type}: ${reason}`, now(), id); await log(db, id, "PAUSED", reason, type); }
async function log(db: D1Database, taskId: string, action: string, message: string, level = "INFO") { await run(db, "INSERT INTO task_logs (id,task_id,level,module,action,message,created_at) VALUES (?,?,?,?,?,?,?)", crypto.randomUUID(), taskId, level, "任务执行器", action, message, now()); }
async function run(db: D1Database, sql: string, ...values: unknown[]) { return db.prepare(sql).bind(...values).run(); }
async function first<T>(db: D1Database, sql: string, ...values: unknown[]) { return db.prepare(sql).bind(...values).first() as Promise<T | null>; }
function changedRows(result: unknown) { return Number((result as { meta?: { changes?: number } })?.meta?.changes ?? 0); }
async function isTaskRunning(db: D1Database, id: string) { return Boolean(await first<{ id: string }>(db, "SELECT id FROM search_tasks WHERE id=? AND status='RUNNING'", id)); }
function parseJson<T>(value: string | null, fallback: T): T { try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } }
function now() { return new Date().toISOString(); }
function isFatalTikHubError(error: unknown) { return error instanceof TikHubError && ["UNAUTHORIZED", "RATE_LIMITED", "INSUFFICIENT_BALANCE"].includes(error.type); }
async function cachedProfile(db: D1Database, douyinUniqueId: string) {
  const freshAfter = new Date(Date.now() - 7 * 86400000).toISOString();
  return first<{ bio: string | null; follower_count: number | null; total_likes: number | null }>(db, "SELECT bio,follower_count,total_likes FROM creators WHERE douyin_unique_id=? AND profile_status='COLLECTED' AND last_collected_at>=?", douyinUniqueId, freshAfter);
}
