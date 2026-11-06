CREATE TABLE `member_metadata` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trip_creations` (
	`id` text PRIMARY KEY NOT NULL,
	`creator` text NOT NULL,
	`name` text NOT NULL,
	`ends_at` text NOT NULL,
	`expires_at` integer NOT NULL,
	`vault` text,
	`transaction_hash` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trip_creations_transaction_hash_unique` ON `trip_creations` (`transaction_hash`);--> statement-breakpoint
CREATE TABLE `trip_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`trip_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`status` text NOT NULL,
	`claimed_by` text,
	`signature` text,
	`transaction_hash` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trip_invites_token_hash_unique` ON `trip_invites` (`token_hash`);--> statement-breakpoint
CREATE INDEX `trip_invites_trip` ON `trip_invites` (`trip_id`);