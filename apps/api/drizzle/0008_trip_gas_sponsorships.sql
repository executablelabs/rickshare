CREATE TABLE `trip_gas_sponsorships` (
  `creation_id` text PRIMARY KEY NOT NULL,
  `recipient` text NOT NULL,
  `day` text NOT NULL,
  `amount` text NOT NULL,
  `wallet_transaction` text NOT NULL,
  `signed_transaction` text,
  `transaction_hash` text,
  `confirmed` integer DEFAULT false NOT NULL,
  `error_code` text
);
