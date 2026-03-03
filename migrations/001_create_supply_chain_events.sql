-- Supply chain events table
CREATE TABLE IF NOT EXISTS supply_chain_events (
  transaction_id VARCHAR PRIMARY KEY,
  date DATE,
  event_type VARCHAR,
  supplier_id VARCHAR,
  supplier_name VARCHAR,
  facility_id VARCHAR,
  facility_name VARCHAR,
  facility_region VARCHAR,
  product_line VARCHAR,
  material_id VARCHAR,
  material_name VARCHAR,
  unit_cost NUMERIC(12,2),
  quantity INTEGER,
  total_cost NUMERIC(12,2),
  lead_time_days INTEGER,
  quality_score NUMERIC(5,1),
  defect_rate NUMERIC(5,3),
  on_time BOOLEAN,
  shipping_mode VARCHAR,
  shipping_cost NUMERIC(12,2),
  priority VARCHAR
);

CREATE INDEX IF NOT EXISTS idx_sce_date ON supply_chain_events(date);
CREATE INDEX IF NOT EXISTS idx_sce_region ON supply_chain_events(facility_region);
CREATE INDEX IF NOT EXISTS idx_sce_product ON supply_chain_events(product_line);
CREATE INDEX IF NOT EXISTS idx_sce_event ON supply_chain_events(event_type);
