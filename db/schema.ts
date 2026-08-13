import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const searchTasks = sqliteTable("search_tasks", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  primaryCategory: text("primary_category").notNull(),
  secondaryCategories: text("secondary_categories", { mode: "json" }).$type<string[]>().notNull(),
  keywords: text("keywords", { mode: "json" }).$type<string[]>().notNull(),
  targetRequirement: text("target_requirement").notNull().default(""),
  status: text("status").notNull(),
  progress: real("progress").notNull().default(0),
  resultLimitPerKeyword: integer("result_limit_per_keyword").notNull().default(30),
  worksLimitPerCreator: integer("works_limit_per_creator").notNull().default(12),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  lastRunAt: text("last_run_at"),
  checkpoint: text("checkpoint", { mode: "json" }).$type<{ keywordIndex: number; creatorIndex: number }>(),
  pauseReason: text("pause_reason").notNull().default(""),
});

export const taskFailures = sqliteTable("task_failures", {
  id: text("id").primaryKey(), taskId: text("task_id").notNull(), creatorId: text("creator_id"),
  creatorName: text("creator_name").notNull().default(""), stage: text("stage").notNull(),
  errorType: text("error_type").notNull(), message: text("message").notNull(),
  retryCount: integer("retry_count").notNull().default(0), status: text("status").notNull().default("PENDING"),
  nextRetryAt: text("next_retry_at"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
});

export const creators = sqliteTable("creators", {
  id: text("id").primaryKey(),
  douyinUniqueId: text("douyin_unique_id").unique(),
  douyinAccount: text("douyin_account").unique(),
  nickname: text("nickname").notNull(),
  profileUrl: text("profile_url").unique(),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  region: text("region"),
  followerCount: integer("follower_count"),
  totalLikes: integer("total_likes"),
  verification: text("verification"),
  latestPublishTime: text("latest_publish_time"),
  firstDiscoveredAt: text("first_discovered_at").notNull(),
  lastCollectedAt: text("last_collected_at"),
  collectionStatus: text("collection_status").notNull(),
  profileStatus: text("profile_status").notNull().default("PARTIAL"),
  evidenceLevel: text("evidence_level").notNull().default("SEARCH_ONLY"),
  evidenceWarnings: text("evidence_warnings", { mode: "json" }).$type<string[]>().notNull().default([]),
  profileRetryCount: integer("profile_retry_count").notNull().default(0),
  lastProfileAttemptAt: text("last_profile_attempt_at"),
  analysisStatus: text("analysis_status").notNull(),
  tianmuStatus: text("tianmu_status").notNull(),
  finalStatus: text("final_status").notNull(),
});

export const creatorShadowEvaluations = sqliteTable("creator_shadow_evaluations", {
  id: text("id").primaryKey(),
  creatorId: text("creator_id").notNull(),
  taskId: text("task_id").notNull(),
  engineVersion: text("engine_version").notNull(),
  llmRecommendation: text("llm_recommendation").notNull(),
  llmMatchScore: real("llm_match_score").notNull(),
  baseScore: real("base_score").notNull(),
  profileCompleteness: real("profile_completeness").notNull(),
  activityScore: real("activity_score").notNull(),
  commercialSignalsScore: real("commercial_signals_score").notNull(),
  evidenceConfidence: real("evidence_confidence").notNull(),
  evidenceLevel: text("evidence_level").notNull(),
  warnings: text("warnings", { mode: "json" }).$type<string[]>().notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("idx_creator_shadow_task_created").on(table.taskId, table.createdAt),
  index("idx_creator_shadow_creator").on(table.creatorId),
]);

export const creatorDiscoveries = sqliteTable("creator_discoveries", {
  id: text("id").primaryKey(),
  creatorId: text("creator_id").notNull(),
  taskId: text("task_id").notNull(),
  keyword: text("keyword").notNull(),
  sourceVideoUrl: text("source_video_url"),
  discoveredAt: text("discovered_at").notNull(),
});

export const works = sqliteTable("works", {
  id: text("id").primaryKey(),
  creatorId: text("creator_id").notNull(),
  platformWorkId: text("platform_work_id").unique(),
  title: text("title").notNull(),
  description: text("description"),
  hashtags: text("hashtags", { mode: "json" }).$type<string[]>(),
  workUrl: text("work_url"),
  publishTime: text("publish_time"),
  likeCount: integer("like_count"),
  commentCount: integer("comment_count"),
  shareCount: integer("share_count"),
  analysisStatus: text("analysis_status").notNull(),
});

export const workAnalyses = sqliteTable("work_analyses", {
  id: text("id").primaryKey(),
  workId: text("work_id").notNull().unique(),
  primaryCategory: text("primary_category").notNull(),
  secondaryCategory: text("secondary_category"),
  contentFormat: text("content_format").notNull(),
  informationValue: text("information_value").notNull(),
  completeness: text("completeness").notNull(),
  originalityProbability: text("originality_probability").notNull(),
  repostRisk: text("repost_risk").notNull(),
  advertisementRisk: text("advertisement_risk").notNull(),
  baiduFit: text("baidu_fit").notNull(),
  reasoning: text("reasoning").notNull(),
});

export const creatorAnalyses = sqliteTable("creator_analyses", {
  id: text("id").primaryKey(),
  creatorId: text("creator_id").notNull().unique(),
  mainCategory: text("main_category").notNull(),
  secondaryCategories: text("secondary_categories", { mode: "json" }).$type<string[]>(),
  targetContentRatio: real("target_content_ratio").notNull(),
  contentVerticality: real("content_verticality").notNull(),
  informationValue: text("information_value").notNull(),
  consistency: text("consistency").notNull(),
  originality: text("originality").notNull(),
  repostRisk: text("repost_risk").notNull(),
  baiduFit: text("baidu_fit").notNull(),
  recommendation: text("recommendation").notNull(),
  reasoning: text("reasoning").notNull(),
  representativeWorkIds: text("representative_work_ids", { mode: "json" }).$type<string[]>(),
  isEmergingCreator: integer("is_emerging_creator", { mode: "boolean" }).notNull().default(false),
  confidence: real("confidence").notNull(),
  analyzedAt: text("analyzed_at").notNull(),
});

export const tianmuChecks = sqliteTable("tianmu_checks", {
  id: text("id").primaryKey(),
  creatorId: text("creator_id").notNull(),
  originalNickname: text("original_nickname").notNull(),
  queryNickname: text("query_nickname").notNull(),
  normalizedNickname: text("normalized_nickname").notNull(),
  resultCount: integer("result_count").notNull(),
  exactMatchCount: integer("exact_match_count").notNull(),
  exactMatchNicknames: text("exact_match_nicknames", { mode: "json" }).$type<string[]>(),
  similarMatchNicknames: text("similar_match_nicknames", { mode: "json" }).$type<string[]>(),
  status: text("status").notNull(),
  previousEntryStatus: text("previous_entry_status"),
  errorReason: text("error_reason"),
  requiresManualReview: integer("requires_manual_review", { mode: "boolean" }).notNull(),
  manuallyConfirmed: integer("manually_confirmed", { mode: "boolean" }).notNull().default(false),
  checkedAt: text("checked_at").notNull(),
});

export const taskLogs = sqliteTable("task_logs", {
  id: text("id").primaryKey(),
  taskId: text("task_id"),
  creatorId: text("creator_id"),
  level: text("level").notNull(),
  module: text("module").notNull(),
  action: text("action").notNull(),
  message: text("message").notNull(),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: text("created_at").notNull(),
});

export const creatorCrmRecords = sqliteTable("creator_crm_records", {
  id: text("id").primaryKey(),
  creatorId: text("creator_id").notNull().unique(),
  stage: text("stage").notNull().default("TO_CONTACT"),
  owner: text("owner").notNull().default(""),
  contactInfo: text("contact_info").notNull().default(""),
  lastContactAt: text("last_contact_at"),
  nextFollowUpAt: text("next_follow_up_at"),
  note: text("note").notNull().default(""),
  addedAt: text("added_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const creatorCrmEvents = sqliteTable("creator_crm_events", {
  id: text("id").primaryKey(),
  crmRecordId: text("crm_record_id").notNull(),
  creatorId: text("creator_id").notNull(),
  eventType: text("event_type").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  note: text("note"),
  createdAt: text("created_at").notNull(),
});
