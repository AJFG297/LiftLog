CREATE TABLE `cardio_set` (
	`workout_id` text NOT NULL,
	`exercise_position` integer NOT NULL,
	`position` integer NOT NULL,
	`blueprint` text NOT NULL,
	`completed_at` text,
	`completed_at_ms` integer,
	`duration` text,
	`distance_value` text,
	`distance_unit` text,
	`resistance` text,
	`incline` text,
	`weight_value` text,
	`weight_unit` text,
	`steps` integer,
	PRIMARY KEY(`workout_id`, `exercise_position`, `position`),
	FOREIGN KEY (`workout_id`,`exercise_position`) REFERENCES `workout_exercise`(`workout_id`,`position`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `weighted_set` (
	`workout_id` text NOT NULL,
	`exercise_position` integer NOT NULL,
	`position` integer NOT NULL,
	`target_reps_min` integer NOT NULL,
	`target_reps_max` integer NOT NULL,
	`weight_value` text NOT NULL,
	`weight_unit` text NOT NULL,
	`weight_kg` real NOT NULL,
	`effective_weight_kg` real NOT NULL,
	`rpe` real,
	`reps` integer,
	`completed_at` text,
	`completed_at_ms` integer,
	PRIMARY KEY(`workout_id`, `exercise_position`, `position`),
	FOREIGN KEY (`workout_id`,`exercise_position`) REFERENCES `workout_exercise`(`workout_id`,`position`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workout_exercise` (
	`workout_id` text NOT NULL,
	`position` integer NOT NULL,
	`kind` text NOT NULL,
	`movement_key` text NOT NULL,
	`progression_key` text NOT NULL,
	`latest_time_ms` integer,
	`notes` text,
	`blueprint` text NOT NULL,
	PRIMARY KEY(`workout_id`, `position`),
	FOREIGN KEY (`workout_id`) REFERENCES `workout`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workout_exercise_movement` ON `workout_exercise` (`movement_key`,`latest_time_ms`);--> statement-breakpoint
CREATE INDEX `workout_exercise_progression` ON `workout_exercise` (`progression_key`,`latest_time_ms`);--> statement-breakpoint
CREATE TABLE `workout` (
	`id` text PRIMARY KEY NOT NULL,
	`active` integer DEFAULT false NOT NULL,
	`blueprint_version` integer NOT NULL,
	`date` text NOT NULL,
	`name` text NOT NULL,
	`notes` text NOT NULL,
	`bodyweight_value` text,
	`bodyweight_unit` text,
	`reference_time_ms` integer NOT NULL,
	`volume_kg` real NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `single_active_workout` ON `workout` (`active`) WHERE "workout"."active" = 1;--> statement-breakpoint
CREATE INDEX `workout_date` ON `workout` (`date`);--> statement-breakpoint
CREATE INDEX `workout_reference_time` ON `workout` (`reference_time_ms`);--> statement-breakpoint
DROP TABLE `session`;