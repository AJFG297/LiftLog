ALTER TABLE `workout` ADD `routine_id` text;--> statement-breakpoint
CREATE INDEX `workout_routine` ON `workout` (`routine_id`);