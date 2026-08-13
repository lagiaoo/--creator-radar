CREATE TABLE `creator_shadow_evaluations` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_id` text NOT NULL,
	`task_id` text NOT NULL,
	`engine_version` text NOT NULL,
	`llm_recommendation` text NOT NULL,
	`llm_match_score` real NOT NULL,
	`base_score` real NOT NULL,
	`profile_completeness` real NOT NULL,
	`activity_score` real NOT NULL,
	`commercial_signals_score` real NOT NULL,
	`evidence_confidence` real NOT NULL,
	`evidence_level` text NOT NULL,
	`warnings` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `creators` ADD `profile_status` text DEFAULT 'PARTIAL' NOT NULL;--> statement-breakpoint
ALTER TABLE `creators` ADD `evidence_level` text DEFAULT 'SEARCH_ONLY' NOT NULL;--> statement-breakpoint
ALTER TABLE `creators` ADD `evidence_warnings` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `creators` ADD `profile_retry_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `creators` ADD `last_profile_attempt_at` text;