CREATE TABLE `warmup_set` (
	`workout_id` text NOT NULL,
	`exercise_position` integer NOT NULL,
	`position` integer NOT NULL,
	`target_reps_min` integer NOT NULL,
	`target_reps_max` integer NOT NULL,
	`weight_value` text NOT NULL,
	`weight_unit` text NOT NULL,
	`reps` integer,
	`completed_at` text,
	PRIMARY KEY(`workout_id`, `exercise_position`, `position`),
	FOREIGN KEY (`workout_id`,`exercise_position`) REFERENCES `workout_exercise`(`workout_id`,`position`) ON UPDATE no action ON DELETE cascade
);
