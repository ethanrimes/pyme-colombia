CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`org` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_token` ON `devices` (`token_hash`);--> statement-breakpoint
CREATE INDEX `devices_org` ON `devices` (`org`);--> statement-breakpoint
CREATE TABLE `refunds` (
	`id` text PRIMARY KEY NOT NULL,
	`org` text NOT NULL,
	`sale_id` text NOT NULL,
	`amount` integer NOT NULL,
	`method` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `refunds_sale` ON `refunds` (`sale_id`);