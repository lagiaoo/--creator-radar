CREATE TABLE `creator_analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_id` text NOT NULL,
	`main_category` text NOT NULL,
	`secondary_categories` text,
	`target_content_ratio` real NOT NULL,
	`content_verticality` real NOT NULL,
	`information_value` text NOT NULL,
	`consistency` text NOT NULL,
	`originality` text NOT NULL,
	`repost_risk` text NOT NULL,
	`baidu_fit` text NOT NULL,
	`recommendation` text NOT NULL,
	`reasoning` text NOT NULL,
	`representative_work_ids` text,
	`is_emerging_creator` integer DEFAULT false NOT NULL,
	`confidence` real NOT NULL,
	`analyzed_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `creator_analyses_creator_id_unique` ON `creator_analyses` (`creator_id`);--> statement-breakpoint
CREATE TABLE `creator_discoveries` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_id` text NOT NULL,
	`task_id` text NOT NULL,
	`keyword` text NOT NULL,
	`source_video_url` text,
	`discovered_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `creators` (
	`id` text PRIMARY KEY NOT NULL,
	`douyin_unique_id` text,
	`douyin_account` text,
	`nickname` text NOT NULL,
	`profile_url` text,
	`avatar_url` text,
	`bio` text,
	`region` text,
	`follower_count` integer,
	`total_likes` integer,
	`verification` text,
	`latest_publish_time` text,
	`first_discovered_at` text NOT NULL,
	`last_collected_at` text,
	`collection_status` text NOT NULL,
	`analysis_status` text NOT NULL,
	`tianmu_status` text NOT NULL,
	`final_status` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `creators_douyin_unique_id_unique` ON `creators` (`douyin_unique_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `creators_douyin_account_unique` ON `creators` (`douyin_account`);--> statement-breakpoint
CREATE UNIQUE INDEX `creators_profile_url_unique` ON `creators` (`profile_url`);--> statement-breakpoint
CREATE TABLE `search_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`primary_category` text NOT NULL,
	`secondary_categories` text NOT NULL,
	`keywords` text NOT NULL,
	`status` text NOT NULL,
	`progress` real DEFAULT 0 NOT NULL,
	`result_limit_per_keyword` integer DEFAULT 30 NOT NULL,
	`works_limit_per_creator` integer DEFAULT 12 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_run_at` text
);
--> statement-breakpoint
CREATE TABLE `task_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text,
	`creator_id` text,
	`level` text NOT NULL,
	`module` text NOT NULL,
	`action` text NOT NULL,
	`message` text NOT NULL,
	`metadata` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tianmu_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_id` text NOT NULL,
	`original_nickname` text NOT NULL,
	`query_nickname` text NOT NULL,
	`normalized_nickname` text NOT NULL,
	`result_count` integer NOT NULL,
	`exact_match_count` integer NOT NULL,
	`exact_match_nicknames` text,
	`similar_match_nicknames` text,
	`status` text NOT NULL,
	`previous_entry_status` text,
	`error_reason` text,
	`requires_manual_review` integer NOT NULL,
	`manually_confirmed` integer DEFAULT false NOT NULL,
	`checked_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `work_analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`work_id` text NOT NULL,
	`primary_category` text NOT NULL,
	`secondary_category` text,
	`content_format` text NOT NULL,
	`information_value` text NOT NULL,
	`completeness` text NOT NULL,
	`originality_probability` text NOT NULL,
	`repost_risk` text NOT NULL,
	`advertisement_risk` text NOT NULL,
	`baidu_fit` text NOT NULL,
	`reasoning` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_analyses_work_id_unique` ON `work_analyses` (`work_id`);--> statement-breakpoint
CREATE TABLE `works` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_id` text NOT NULL,
	`platform_work_id` text,
	`title` text NOT NULL,
	`description` text,
	`hashtags` text,
	`work_url` text,
	`publish_time` text,
	`like_count` integer,
	`comment_count` integer,
	`share_count` integer,
	`analysis_status` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `works_platform_work_id_unique` ON `works` (`platform_work_id`);