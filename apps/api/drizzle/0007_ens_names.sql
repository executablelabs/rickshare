CREATE TABLE `ens_members` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`address` text NOT NULL,
	`label` text NOT NULL,
	`ready` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ens_members_trip_label` ON `ens_members` (`trip_id`,`label`);--> statement-breakpoint
CREATE TABLE `ens_trips` (
	`trip_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`registry` text,
	`resolver` text,
	`itinerary_hash` text,
	`error_code` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ens_trips_name_unique` ON `ens_trips` (`name`);