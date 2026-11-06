CREATE TABLE `chat_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`actor` text NOT NULL,
	`request_id` text NOT NULL,
	`text` text NOT NULL,
	`status` text NOT NULL,
	`run_id` text NOT NULL,
	`result` text,
	`error_code` text
);
--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `client_request_id` text;