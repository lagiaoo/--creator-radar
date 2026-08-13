CREATE TABLE `task_failures` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`creator_id` text,
	`creator_name` text DEFAULT '' NOT NULL,
	`stage` text NOT NULL,
	`error_type` text NOT NULL,
	`message` text NOT NULL,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`next_retry_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `search_tasks` ADD `checkpoint` text;--> statement-breakpoint
ALTER TABLE `search_tasks` ADD `pause_reason` text DEFAULT '' NOT NULL;