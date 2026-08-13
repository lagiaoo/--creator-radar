CREATE TABLE `creator_crm_events` (
	`id` text PRIMARY KEY NOT NULL,
	`crm_record_id` text NOT NULL,
	`creator_id` text NOT NULL,
	`event_type` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`note` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `creator_crm_records` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_id` text NOT NULL,
	`stage` text DEFAULT 'TO_CONTACT' NOT NULL,
	`owner` text DEFAULT '' NOT NULL,
	`contact_info` text DEFAULT '' NOT NULL,
	`last_contact_at` text,
	`next_follow_up_at` text,
	`note` text DEFAULT '' NOT NULL,
	`added_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `creator_crm_records_creator_id_unique` ON `creator_crm_records` (`creator_id`);