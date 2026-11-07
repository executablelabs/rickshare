CREATE TABLE `world_proof_nullifiers` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`consumed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `world_proof_nullifiers_request_id_unique` ON `world_proof_nullifiers` (`request_id`);