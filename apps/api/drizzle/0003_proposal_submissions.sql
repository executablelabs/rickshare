CREATE TABLE `proposal_submissions` (
	`quote_hash` text PRIMARY KEY NOT NULL,
	`vault` text NOT NULL,
	`intent` text NOT NULL,
	`status` text NOT NULL,
	`transaction_hash` text,
	`proposal_id` text
);
