CREATE TABLE `qr_access_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token_hash` text NOT NULL,
	`kind` text NOT NULL,
	`reference` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`expires_at` text,
	`created_by` integer NOT NULL,
	`created_at` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `qr_access_tokens_token_hash_unique` ON `qr_access_tokens` (`token_hash`);--> statement-breakpoint
ALTER TABLE `result_audit` ADD COLUMN `submission_id` integer;
--> statement-breakpoint
CREATE TABLE `score_submissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_code` text NOT NULL,
	`game_id` text NOT NULL,
	`category_code` text NOT NULL,
	`scorekeeper_name` text NOT NULL,
	`result` text DEFAULT '' NOT NULL,
	`set_1` text DEFAULT '' NOT NULL,
	`set_2` text DEFAULT '' NOT NULL,
	`set_3` text DEFAULT '' NOT NULL,
	`photo_key` text NOT NULL,
	`photo_mime` text NOT NULL,
	`photo_size` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`submitted_at` text NOT NULL,
	`reviewed_at` text,
	`reviewed_by` integer,
	`review_note` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `score_submissions_public_code_unique` ON `score_submissions` (`public_code`);--> statement-breakpoint
CREATE TABLE `score_uploads` (
	`photo_key` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`photo_mime` text NOT NULL,
	`photo_size` integer NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_qr_access_tokens_reference` ON `qr_access_tokens` (`kind`,`reference`,`active`);--> statement-breakpoint
CREATE INDEX `idx_score_submissions_status` ON `score_submissions` (`status`,`submitted_at` DESC);--> statement-breakpoint
CREATE INDEX `idx_score_submissions_game` ON `score_submissions` (`game_id`,`submitted_at` DESC);
