ALTER TABLE `score_submissions` ADD `photo_state` text DEFAULT 'available' NOT NULL;--> statement-breakpoint
ALTER TABLE `score_submissions` ADD `photo_purged_at` text;--> statement-breakpoint
ALTER TABLE `score_submissions` ADD `photo_purged_by` integer REFERENCES users(id);