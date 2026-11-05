CREATE TABLE `world_flows` (
	`id` text PRIMARY KEY NOT NULL,
	`address` text NOT NULL,
	`session_hash` text NOT NULL,
	`nonce` text NOT NULL,
	`verifier` text NOT NULL,
	`kind` text NOT NULL,
	`vault` text,
	`proposal_id` text,
	`expires_at` integer NOT NULL,
	`status` text NOT NULL,
	`result` text,
	`error_code` text
);
--> statement-breakpoint
CREATE INDEX `world_flows_expiry` ON `world_flows` (`expires_at`);--> statement-breakpoint
CREATE TABLE `world_identities` (
	`address` text PRIMARY KEY NOT NULL,
	`subject_hash` text NOT NULL,
	`linked_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `world_identities_subject_hash_unique` ON `world_identities` (`subject_hash`);