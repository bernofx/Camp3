CREATE TABLE `ranking_resolutions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category_code` text NOT NULL,
	`group_code` text NOT NULL,
	`team_a` text NOT NULL,
	`team_b` text NOT NULL,
	`resolution_type` text NOT NULL,
	`preferred_team_code` text DEFAULT '' NOT NULL,
	`playoff_game_id` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ranking_resolutions_pair_unique` ON `ranking_resolutions` (`category_code`,`group_code`,`team_a`,`team_b`);--> statement-breakpoint
ALTER TABLE `score_submissions` ADD `referee_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `score_submissions` ADD `court_manager_name` text DEFAULT '' NOT NULL;