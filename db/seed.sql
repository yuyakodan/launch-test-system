-- =========================================
-- Launch Test System - Seed Data for Development/Testing
-- =========================================

-- Note: Run this after 0001_initial_schema.sql
-- IDs use ULID format (26 characters)

-- ---------------------------
-- Tenants
-- ---------------------------
INSERT INTO tenants (id, name, slug, plan_key, settings_json) VALUES
  ('01HTEST0000TENANT00000001', 'Demo Company', 'demo', 'starter', '{"locale": "ja-JP", "timezone": "Asia/Tokyo"}'),
  ('01HTEST0000TENANT00000002', 'Test Agency', 'test-agency', 'professional', '{"locale": "ja-JP", "timezone": "Asia/Tokyo"}');

-- ---------------------------
-- Users
-- ---------------------------
INSERT INTO users (id, email, name) VALUES
  ('01HTEST0000USER000000001', 'admin@demo.example.com', 'Demo Admin'),
  ('01HTEST0000USER000000002', 'operator@demo.example.com', 'Demo Operator'),
  ('01HTEST0000USER000000003', 'reviewer@demo.example.com', 'Demo Reviewer'),
  ('01HTEST0000USER000000004', 'viewer@demo.example.com', 'Demo Viewer');

-- ---------------------------
-- Memberships
-- ---------------------------
INSERT INTO memberships (tenant_id, user_id, role, status) VALUES
  ('01HTEST0000TENANT00000001', '01HTEST0000USER000000001', 'owner', 'active'),
  ('01HTEST0000TENANT00000001', '01HTEST0000USER000000002', 'operator', 'active'),
  ('01HTEST0000TENANT00000001', '01HTEST0000USER000000003', 'reviewer', 'active'),
  ('01HTEST0000TENANT00000001', '01HTEST0000USER000000004', 'viewer', 'active'),
  ('01HTEST0000TENANT00000002', '01HTEST0000USER000000001', 'owner', 'active');

-- ---------------------------
-- Projects
-- ---------------------------
INSERT INTO projects (id, tenant_id, name, offer_json, cv_definition_json, ng_rules_json, form_config_json, default_disclaimer) VALUES
  ('01HTEST0000PROJECT000001', '01HTEST0000TENANT00000001', 'サンプルLPテストプロジェクト',
   '{"product_name": "Sample Product", "target_audience": "30-40 male business owners", "unique_value": "Time saving automation"}',
   '{"primary_cv": "form_submit", "secondary_cv": ["cta_click"]}',
   '{"version": "1.0", "blocked_terms": ["guaranteed", "100% success"], "blocked_patterns": [], "claim_requires_evidence": [], "required_disclaimer": ["This is a sample disclaimer"]}',
   '{"type": "internal", "fields": ["name", "email", "company"]}',
   'This is a sample disclaimer for testing purposes.');

-- ---------------------------
-- Runs
-- ---------------------------
INSERT INTO runs (id, project_id, name, status, operation_mode, run_design_json, stop_dsl_json, fixed_granularity_json, created_by_user_id) VALUES
  ('01HTEST0000RUN0000000001', '01HTEST0000PROJECT000001', '初回A/Bテスト', 'Draft', 'manual',
   '{"version": "1.0", "operation_mode": "manual", "kpi": {"primary": "cvr", "secondary": ["cpa"]}, "budget": {"currency": "JPY", "total_cap": 100000, "daily_cap": 10000}, "compare_axis": {"mode": "intent"}, "sample_thresholds": {"insufficient": {"min_total_clicks": 200, "min_total_cvs": 3}, "directional": {"min_total_clicks": 200, "min_total_cvs": 5}, "confident": {"min_total_cvs": 20, "min_per_variant_cvs": 5}}, "confidence_thresholds": {"method": "wilson", "alpha": 0.05, "min_effect": 0.0}, "form_mode": {"type": "internal"}, "utm_policy": {"source": "meta", "medium": "paid_social", "campaign_key": "run_{run_id}", "content_key": "intent_{intent_id}_lp_{lp_variant_id}_cr_{creative_variant_id}"}}',
   '{"version": "1.0", "evaluation_interval_sec": 300, "safe_mode_on_error": true, "rules": [{"id": "cap-total", "enabled": true, "scope": "run", "type": "spend_total_cap", "gating": {"min_elapsed_sec": 0}, "params": {"cap": 100000, "currency": "JPY"}, "action": {"type": "pause_run", "notify": true, "message": "Total budget cap reached"}}]}',
   '{"version": "1.0", "fixed": {"intent": {"lock_intent_ids": []}, "lp": {"lock_structure": false, "lock_theme": false, "lock_blocks": [], "lock_copy_paths": []}, "banner": {"lock_template": false, "lock_image_layout": false, "lock_text_layers": false, "lock_sizes": []}, "ad_copy": {"lock_primary_text": false, "lock_headline": false, "lock_description": false}}, "explore": {"intent": {"max_new_intents": 1, "allow_replace_intents": true}, "lp": {"max_new_fv_copies": 3, "max_new_cta_copies": 2, "allow_block_reorder": false}, "banner": {"max_new_text_variants": 6, "allow_new_templates": true}}}',
   '01HTEST0000USER000000002');

-- ---------------------------
-- Intents
-- ---------------------------
INSERT INTO intents (id, run_id, title, hypothesis, evidence_json, priority, status) VALUES
  ('01HTEST0000INTENT0000001', '01HTEST0000RUN0000000001', 'Time Saving Appeal', 'Users who value time savings will convert at higher rates', '{"type": "internal_data", "summary": "Previous campaigns showed 20% higher CVR with time-saving messaging"}', 1, 'active'),
  ('01HTEST0000INTENT0000002', '01HTEST0000RUN0000000001', 'Cost Reduction Appeal', 'Users who focus on cost will respond better to ROI messaging', '{"type": "case_study", "summary": "Industry benchmark shows cost-focused messaging works for SMBs"}', 2, 'active');

-- ---------------------------
-- LP Variants
-- ---------------------------
INSERT INTO lp_variants (id, intent_id, version, status, blocks_json, theme_json, approval_status) VALUES
  ('01HTEST0000LPVARIANT0001', '01HTEST0000INTENT0000001', 1, 'draft',
   '{"fv": {"headline": "Save 10 hours per week", "subheadline": "Automate your daily tasks"}, "empathy": {"text": "Tired of repetitive work?"}, "solution": {"text": "Our solution automates everything"}, "cta": {"text": "Start Free Trial"}}',
   '{"primary_color": "#2563eb", "secondary_color": "#1e40af", "font_family": "Noto Sans JP"}',
   'draft'),
  ('01HTEST0000LPVARIANT0002', '01HTEST0000INTENT0000002', 1, 'draft',
   '{"fv": {"headline": "Cut costs by 30%", "subheadline": "See ROI in 30 days"}, "empathy": {"text": "Spending too much on manual processes?"}, "solution": {"text": "Our solution reduces operational costs"}, "cta": {"text": "Calculate Your Savings"}}',
   '{"primary_color": "#059669", "secondary_color": "#047857", "font_family": "Noto Sans JP"}',
   'draft');

-- ---------------------------
-- Creative Variants
-- ---------------------------
INSERT INTO creative_variants (id, intent_id, size, version, status, text_layers_json, image_r2_key, approval_status) VALUES
  ('01HTEST0000CREATIVE00001', '01HTEST0000INTENT0000001', '1:1', 1, 'draft',
   '{"headline": "Save Time Now", "body": "10 hours/week back", "cta": "Learn More"}',
   'creatives/01HTEST0000CREATIVE00001/1x1.png',
   'draft'),
  ('01HTEST0000CREATIVE00002', '01HTEST0000INTENT0000001', '4:5', 1, 'draft',
   '{"headline": "Save Time Now", "body": "10 hours/week back", "cta": "Learn More"}',
   'creatives/01HTEST0000CREATIVE00002/4x5.png',
   'draft'),
  ('01HTEST0000CREATIVE00003', '01HTEST0000INTENT0000002', '1:1', 1, 'draft',
   '{"headline": "Cut Costs", "body": "30% reduction guaranteed", "cta": "Calculate ROI"}',
   'creatives/01HTEST0000CREATIVE00003/1x1.png',
   'draft');

-- ---------------------------
-- Ad Copies
-- ---------------------------
INSERT INTO ad_copies (id, intent_id, version, status, primary_text, headline, description, approval_status) VALUES
  ('01HTEST0000ADCOPY000001', '01HTEST0000INTENT0000001', 1, 'draft',
   'Tired of wasting time on repetitive tasks? Our automation solution gives you back 10+ hours every week. Join thousands of businesses already saving time.',
   'Save 10 Hours Every Week',
   'Automate your daily tasks and focus on what matters.',
   'draft'),
  ('01HTEST0000ADCOPY000002', '01HTEST0000INTENT0000002', 1, 'draft',
   'Stop overspending on manual processes. Our clients see 30% cost reduction within the first month. Calculate your potential savings today.',
   'Reduce Costs by 30%',
   'See ROI in just 30 days with our proven solution.',
   'draft');

-- ---------------------------
-- Ad Bundles
-- ---------------------------
INSERT INTO ad_bundles (id, run_id, intent_id, lp_variant_id, creative_variant_id, ad_copy_id, utm_string, status) VALUES
  ('01HTEST0000BUNDLE000001', '01HTEST0000RUN0000000001', '01HTEST0000INTENT0000001', '01HTEST0000LPVARIANT0001', '01HTEST0000CREATIVE00001', '01HTEST0000ADCOPY000001',
   'utm_source=meta&utm_medium=paid_social&utm_campaign=run_01HTEST0000RUN0000000001&utm_content=intent_01HTEST0000INTENT0000001_lp_01HTEST0000LPVARIANT0001_cr_01HTEST0000CREATIVE00001',
   'ready'),
  ('01HTEST0000BUNDLE000002', '01HTEST0000RUN0000000001', '01HTEST0000INTENT0000002', '01HTEST0000LPVARIANT0002', '01HTEST0000CREATIVE00003', '01HTEST0000ADCOPY000002',
   'utm_source=meta&utm_medium=paid_social&utm_campaign=run_01HTEST0000RUN0000000001&utm_content=intent_01HTEST0000INTENT0000002_lp_01HTEST0000LPVARIANT0002_cr_01HTEST0000CREATIVE00003',
   'ready');

-- ---------------------------
-- Tenant Flags (for feature toggles)
-- ---------------------------
INSERT INTO tenant_flags (tenant_id, flag_key, value_json) VALUES
  ('01HTEST0000TENANT00000001', 'db_backend', '{"value": "d1"}'),
  ('01HTEST0000TENANT00000001', 'meta_api_enabled', '{"value": false}'),
  ('01HTEST0000TENANT00000002', 'db_backend', '{"value": "d1"}'),
  ('01HTEST0000TENANT00000002', 'meta_api_enabled', '{"value": true}');

-- ---------------------------
-- Sample Events (for testing metrics)
-- ---------------------------
INSERT INTO events (id, tenant_id, run_id, intent_id, lp_variant_id, creative_variant_id, ad_bundle_id, event_type, ts_ms, session_id, page_url, referrer, meta_json) VALUES
  ('01HTEST0000EVENT00000001', '01HTEST0000TENANT00000001', '01HTEST0000RUN0000000001', '01HTEST0000INTENT0000001', '01HTEST0000LPVARIANT0001', '01HTEST0000CREATIVE00001', '01HTEST0000BUNDLE000001', 'pageview', 1704067200000, 'sess_001', 'https://lp.example.com/time-saving?utm_source=meta', 'https://www.facebook.com/', '{"device": {"w": 390, "h": 844}}'),
  ('01HTEST0000EVENT00000002', '01HTEST0000TENANT00000001', '01HTEST0000RUN0000000001', '01HTEST0000INTENT0000001', '01HTEST0000LPVARIANT0001', '01HTEST0000CREATIVE00001', '01HTEST0000BUNDLE000001', 'cta_click', 1704067260000, 'sess_001', 'https://lp.example.com/time-saving?utm_source=meta', 'https://www.facebook.com/', '{"button_id": "main_cta"}'),
  ('01HTEST0000EVENT00000003', '01HTEST0000TENANT00000001', '01HTEST0000RUN0000000001', '01HTEST0000INTENT0000001', '01HTEST0000LPVARIANT0001', '01HTEST0000CREATIVE00001', '01HTEST0000BUNDLE000001', 'form_submit', 1704067320000, 'sess_001', 'https://lp.example.com/time-saving?utm_source=meta', 'https://www.facebook.com/', '{"form_id": "contact_form"}'),
  ('01HTEST0000EVENT00000004', '01HTEST0000TENANT00000001', '01HTEST0000RUN0000000001', '01HTEST0000INTENT0000002', '01HTEST0000LPVARIANT0002', '01HTEST0000CREATIVE00003', '01HTEST0000BUNDLE000002', 'pageview', 1704067400000, 'sess_002', 'https://lp.example.com/cost-saving?utm_source=meta', 'https://www.facebook.com/', '{"device": {"w": 1920, "h": 1080}}');

-- End of seed data
