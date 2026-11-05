CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`role` text NOT NULL,
	`author` text,
	`text` text NOT NULL,
	`proposal_ids` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chat_messages_trip_created_idx` ON `chat_messages` (`trip_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `itinerary_items` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`starts_at` text NOT NULL,
	`title` text NOT NULL,
	`location` text NOT NULL,
	`proposal_id` text,
	`ticket_urls` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `itinerary_items_trip_starts_idx` ON `itinerary_items` (`trip_id`,`starts_at`);