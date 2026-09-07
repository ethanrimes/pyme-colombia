ALTER TABLE `purchase_items` ADD `tax_rate` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_items` ADD `tax` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `purchases` ADD `subtotal` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `purchases` ADD `tax` integer DEFAULT 0 NOT NULL;