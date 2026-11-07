CREATE TABLE `world_scoped_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`address` text NOT NULL,
	`subject_hash` text NOT NULL,
	`linked_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `world_scoped_identities_subject_hash_unique` ON `world_scoped_identities` (`subject_hash`);