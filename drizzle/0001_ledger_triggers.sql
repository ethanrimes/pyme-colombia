-- Ledger writes and stock updates share the enclosing D1 transaction.
CREATE TRIGGER movements_apply_stock AFTER INSERT ON movements BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM products WHERE id=NEW.product_id AND org=NEW.org) OR NOT EXISTS(SELECT 1 FROM locations WHERE id=NEW.location_id AND org=NEW.org) THEN RAISE(ABORT,'Invalid inventory owner') END;
  INSERT INTO stock(org,product_id,location_id,quantity) VALUES(NEW.org,NEW.product_id,NEW.location_id,0) ON CONFLICT(product_id,location_id) DO NOTHING;
  UPDATE stock SET quantity=quantity+NEW.quantity WHERE product_id=NEW.product_id AND location_id=NEW.location_id AND org=NEW.org;
END;
--> statement-breakpoint
CREATE TRIGGER sale_items_inventory AFTER INSERT ON sale_items BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM sales WHERE id=NEW.sale_id AND org=NEW.org) THEN RAISE(ABORT,'Invalid sale owner') END;
  INSERT INTO movements(id,org,product_id,location_id,quantity,unit_cost,kind,reference,note,created_at)
  SELECT NEW.id||'-sale',NEW.org,NEW.product_id,s.location_id,-NEW.quantity,NEW.unit_cost,'sale',s.id,'Venta '||s.number,s.created_at FROM sales s WHERE s.id=NEW.sale_id;
END;
--> statement-breakpoint
CREATE TRIGGER sales_return_inventory AFTER UPDATE OF status ON sales WHEN NEW.status='voided' AND OLD.status!='voided' BEGIN
  INSERT INTO movements(id,org,product_id,location_id,quantity,unit_cost,kind,reference,note,created_at)
  SELECT i.id||'-return',NEW.org,i.product_id,NEW.location_id,i.quantity,i.unit_cost,'return',NEW.id,'Devolución '||NEW.number,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM sale_items i WHERE i.sale_id=NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER payment_apply AFTER INSERT ON payments BEGIN
  SELECT CASE WHEN (NEW.sale_id IS NULL)=(NEW.purchase_id IS NULL) THEN RAISE(ABORT,'Payment must have exactly one document') END;
  SELECT CASE WHEN NEW.sale_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sales WHERE id=NEW.sale_id AND org=NEW.org AND status!='voided') THEN RAISE(ABORT,'Invalid sale payment') END;
  SELECT CASE WHEN NEW.purchase_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM purchases WHERE id=NEW.purchase_id AND org=NEW.org AND status='received') THEN RAISE(ABORT,'Invalid purchase payment') END;
  UPDATE sales SET paid=paid+NEW.amount WHERE id=NEW.sale_id AND org=NEW.org;
  UPDATE purchases SET paid=paid+NEW.amount WHERE id=NEW.purchase_id AND org=NEW.org;
END;
--> statement-breakpoint
CREATE TRIGGER purchase_receive AFTER UPDATE OF status ON purchases WHEN NEW.status='received' AND OLD.status='ordered' BEGIN
  UPDATE products SET cost=CAST(ROUND((cost*COALESCE((SELECT SUM(quantity) FROM stock WHERE product_id=products.id),0)+(SELECT SUM(quantity*unit_cost) FROM purchase_items WHERE purchase_id=NEW.id AND product_id=products.id))*1.0/(COALESCE((SELECT SUM(quantity) FROM stock WHERE product_id=products.id),0)+(SELECT SUM(quantity) FROM purchase_items WHERE purchase_id=NEW.id AND product_id=products.id))) AS INTEGER) WHERE id IN (SELECT product_id FROM purchase_items WHERE purchase_id=NEW.id) AND org=NEW.org;
  INSERT INTO movements(id,org,product_id,location_id,quantity,unit_cost,kind,reference,note,created_at)
  SELECT i.id||'-receipt',NEW.org,i.product_id,NEW.location_id,i.quantity,i.unit_cost,'purchase',NEW.id,'Recepción '||NEW.number,NEW.received_at FROM purchase_items i WHERE i.purchase_id=NEW.id;
END;
