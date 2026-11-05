CREATE TABLE `chain_cursors` (
	`id` text PRIMARY KEY NOT NULL,
	`block_number` text NOT NULL,
	`block_hash` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chain_events` (
	`id` text PRIMARY KEY NOT NULL,
	`vault` text NOT NULL,
	`block_number` text NOT NULL,
	`block_hash` text NOT NULL,
	`transaction_hash` text NOT NULL,
	`log_index` integer NOT NULL,
	`name` text NOT NULL,
	`proposal_id` text,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chain_events_vault_proposal` ON `chain_events` (`vault`,`proposal_id`);--> statement-breakpoint
CREATE TABLE `indexed_vaults` (
	`address` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`creator` text NOT NULL,
	`created_block` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `projected_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`proposal_id` text NOT NULL,
	`status` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `projected_proposals_trip` ON `projected_proposals` (`trip_id`);--> statement-breakpoint
CREATE TABLE `trip_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `trip_events_trip_id` ON `trip_events` (`trip_id`,`id`);--> statement-breakpoint
CREATE TABLE `trip_metadata` (
	`trip_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
