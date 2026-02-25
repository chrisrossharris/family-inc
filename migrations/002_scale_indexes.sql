CREATE INDEX IF NOT EXISTS idx_transactions_tenant_date ON transactions(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_entity_date ON transactions(tenant_id, entity, date);
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_category_date ON transactions(tenant_id, category, date);
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_vendor ON transactions(tenant_id, vendor);
CREATE INDEX IF NOT EXISTS idx_imports_tenant_imported_at ON imports(tenant_id, imported_at);
