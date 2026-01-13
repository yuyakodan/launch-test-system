Launch Test System 開発用要件定義（Cloudflare→Neon移行前提／指摘反映）

Version 1.1

0. 目的

ヒアリング → 検証設計 → 生成（LP/バナー/広告文）→ 公開（Cloudflare）→（自動or手動）Meta配信 → 計測/停止条件 → 勝ち判定 → レポート → 次Run生成
を 1つの管理画面で完結させる。

Meta APIの審査/凍結リスクを前提に、審査前でも提供できる Manual Mode をシステム仕様として持つ。

初期はCloudflare（D1）で運用開始し、正式採用時に DBのみNeonへ段階移行する。

1. 前提（運用モード定義：Meta審査リスクを仕様化）
1.1 運用モード（必須）

本システムはRunごとに以下のモードを持つ（UIで選択可能）。

A) Manual Mode（審査前/凍結時のフォールバック）

Meta APIを 使わない

広告作成/編集/再審査は OperatorがAds Managerで手動

システムは以下を提供する

URL/UTMの自動発行（LP×バナー×広告文の組み合わせが追跡できる）

クリエイティブ・広告文の生成/管理/承認

手動入力またはCSVアップロードで「配信コスト/クリック/IMP」等を取り込み可能

自前イベント（pageview/cta/form_submit）で CVベースの比較は必ず成立させる（IMP/クリックが無くても結論は“方向性”として出す）

B) Hybrid Mode（読み取り中心）

Meta APIは「Insights取得」など 読み取り中心（作成は手動でも可）

目的：配信データの自動同期とダッシュボード化

C) Full Auto Mode（作成＋取得）

Meta APIでCampaign/AdSet/Ad/Creativeを作成し、配信開始/停止・Insights同期まで実施

要件：Manual Modeで“サービスが成立する”ことが最重要。Hybrid/Fullは審査・権限が整った後に同一UIで自然に移行できる。

2. 技術スタック（固定）
2.1 初期（Cloudflare完結）

UI：Cloudflare Pages

API：Cloudflare Workers

非同期：Cloudflare Queues

ストレージ：Cloudflare R2

DB：Cloudflare D1（SQLite）

排他制御：Durable Objects（Run単位）

定期実行：Cron Triggers

2.2 正式採用後（DB移行）

DB：Neon（Postgres）

接続：Hyperdrive（DB接続の安定化）

それ以外はCloudflare継続

3. 主要未確定点の“仕様化”（漏れ・矛盾を潰す）
3.1 フォーム送信先（必須：両対応）

LPのCTA→フォームは 3方式をサポートし、Project単位で既定値を設定できる。

Internal Form（内蔵）

システムがフォームを提供し、送信内容を受け取る

PIIは最小化（フィールド定義は最小＋保持期間設定）

送信後はWebhook/Emailでクライアントへ転送可能

External Redirect（外部）

クライアントの既存フォーム/CRMにリダイレクト

システムは「クリック/遷移」までを計測（CV完了はクライアント側で代替計測になる可能性あり）

Webhook Submit（外部API連携）

内蔵フォームの入力をクライアント指定のWebhookへPOST

成功/失敗をログ化し、失敗時は通知

要件：Manual ModeでもCV比較が成立するよう、Internal Formを推奨既定にする（外部フォームのみだとCVが取れない場合があるため、Run設計で警告を出す）。

3.2 課金/請求の範囲（システム側に含める）

SaaS利用料（テナント課金）：含める（Stripe等でサブスク）

広告費（Metaへの支払い）：含めない（クライアントの広告アカウントで直接決済）

ただし運用上必要なため、Runに「広告費上限」「予算消化状況（手動/自動）」は保持する

4. 権限（RBAC）と監査

ロール：Owner / Operator / Reviewer / Viewer
必須ガードレール：

ApprovedのRunは配信開始不可（Manualでも「開始チェックリスト未完了」なら不可）

budget_cap 未設定は開始不可

stop_rules 未設定は開始不可

重要操作（公開/配信開始/停止/承認/判定確定/外部連携）は監査ログ必須

監査ログ要件：

before/after JSON、actor、timestamp、request_id

追記型（削除不可）

改ざん検知用 hash チェーン（前レコードhashを含む）

5. Runステートマシン（運用モード込み）

Run Status：

Draft → Designing → Generating → ReadyForReview → Approved → Publishing → Live → (Running|Paused) → Completed → Archived

追加：Run Operation Mode（Manual/Hybrid/Auto）

遷移制約：

ApprovedなしでPublishing/Running不可

stop_rules/budget未設定でRunning不可

Manual Modeの場合も「手動開始チェックリスト」完了が必須

6. Meta連携：審査・凍結・Rejectedを前提にした要件
6.1 権限/審査リスクを踏まえた設計要件

App Review未通過でもManual Modeでサービス提供可能

App Reviewが必要な権限は、機能ごとに分離し、未承認ならUI上で該当機能を無効化する

APIが使えない/止まった時に「Runが完走できる」ことを最優先する

6.2 Rejected時のエスカレーションフロー（必須）

Meta審査Rejected（広告/クリエイティブ/アカウント）を「イベント」として扱い、以下をシステムフロー化する。

状態：Rejected（対象：Ad/Creative/Run）

記録：理由（手動入力 or APIから取得）、発生時刻、該当資産

自動アクション：

Running中なら 安全停止（Pause） し通知

オペレーション手順（UIにチェックリストとして実装）：

Rejected理由分類（文言/画像/ランディング/業種/規約など）

対象の差分修正（LP/バナー/広告文のどれを直すか）

Reviewer再承認

再提出（ManualならAds Managerで再審査／AutoならAPIで再開）

再発防止メモをProjectのNGルール/注意事項に反映

6.3 アカウント凍結・API停止時の運用手順（必須）

Incident を登録（Runに紐付く）

影響範囲（全Run/特定Run）と暫定対応（Manual Modeへ切替等）を記録

以後のRunは既定でManual Modeへフォールバック可能

7. QA：ブロッカー判定ロジックの具体化（必須）

QAは「ブロッカー（公開/配信不可）」と「警告（承認で明示）」で返す。

7.1 NG表現チェック（ルール管理）

project.ng_rules に以下を保持（UI編集可能）

blocked_terms: 単語リスト

blocked_patterns: 正規表現リスト

required_disclaimer: 免責文テンプレ（業種別）

claim_requires_evidence: 主張パターン → 必要根拠の型（例：数値/事例/第三者）

生成時・編集保存時・承認提出時に突合

ブロッカー条件例：

blocked_terms/pattern一致

claim_requires_evidenceに該当するのに根拠リンク/根拠メモが空

7.2 CV導線（スモークテスト）の実装

公開前に QA Smoke Test を必須実行し、結果がOKでないと公開不可（ブロッカー）。

実行方法（要件）：

POST /qa/smoke-test でジョブ投入

テストランナー（Playwright）は 外部実行基盤（CI/専用ランナー）で実行し、結果をWebhookで戻す
※Workers内でPlaywrightを動かす前提にはしない

テスト内容（最低限）：

LP URL 200

FV/CTA要素が存在（セレクタ）

CTAクリックでフォームに到達（Internal/Externalで判定方法を変える）

Internal Formの場合：送信→完了画面到達（テスト用ダミー）

UTMがURLに付与されている

自前イベント（pageview）が受信される（後述）

8. 最低サンプル・結論の強さ（統計の扱いを明文化）

「検証」と言いつつ結論が弱い問題を避けるため、**結論レベル（Confidence）**を必ず出す。

8.1 判定は3段階（必須）

Insufficient（データ不足）：結論不可。追加予算/追加期間提案

Directional（方向性）：有意差は断言しないが、次の打ち手を提示できる

Confident（高確度）：統計的/経験則基準を満たし、勝ちを確定

8.2 デフォルト閾値（Run設計で変更可能）

Insufficient（例）：

総クリック < 200 かつ 総CV < 3

Directional（例）：

総クリック ≥ 200 または 総CV ≥ 5

Confident（例）：

総CV ≥ 20 かつ 上位案のCVRが優位（後述の簡易判定を満たす）

8.3 簡易有意性（実装方針）

統計エンジンは「難しくしすぎない」代わりに、表示を誤魔化さない。

CVR比較：各Variantの 比率差の信頼区間（例：Wilson） もしくは ベイズ（Beta-Binomial） のいずれかを採用

UI表示：

「差は大きいがデータ不足（Directional）」を明示

「統計的に強い（Confident）」を明示

Insufficient時：

追加予算提案のテンプレを自動生成（「あと何クリック/何CVでDirectional/Confidentに到達」）

9. 次Run生成：固定/探索の粒度を仕様化（必須）

固定可能な粒度（UIで選択可能）を定義する。

9.1 固定粒度（Operatorが選ぶ）

Intent固定：訴求軸を固定して差分は表現のみ

LP構成固定：ブロック並びと見出し構造を固定

ブロック固定：FV/根拠/FAQなど、ブロック単位で固定

コピー固定：FVの一文、CTA文言、見出しなどテキスト単位で固定

デザインテンプレ固定：バナーテンプレ、LPテーマ

バナー固定：画像構図は固定しテキスト差分だけ生成

9.2 探索対象（差分生成の範囲）

intentの追加/入替

FVコピーX案、CTA X案、FAQ入替

バナーのベネフィット表現の差分

LPの根拠提示の差分（順序/強調）

要件：

次Run生成は「固定された要素は一切変えない」

変える要素は差分生成のログ（何を変えたか）を残す

10. イベント計測：自前＋Pixelの二重計測（必須）

Pixelだけに依存しない（審査/ブラウザ制限/実装漏れがあるため）。

10.1 自前イベント（必須）

LPに軽量ビーコンを埋め込み、Workersの /e に送信

events（最小）：

pageview

cta_click

form_submit

form_success（Internal Form時）

取り込みキー：

run_id / intent_id / lp_variant_id

creative_variant_id（UTMから復元）

session_id（cookie/localStorage）

これでManual Modeでも「Variant別CV比較」が成立する

10.2 Pixel計測（任意だが推奨）

Meta Pixel埋め込み＋標準イベント（Lead等）を発火

Pixel発火の“完全検証”はMeta側依存になりやすいので、システム上は：

Pixelコードが存在すること

fbqがロードされた形跡（フロント側チェック）

自前イベントとの整合（後述）
を「準検証」として扱う

10.3 欠落検知（必須）

例：UTMありで流入があるのに pageview が来ない → ブロッカー（計測欠落）

cta_click はあるが form_submit が0 → 警告（導線/フォーム問題の可能性）

Pixelはあるのに自前イベントが無い → ブロッカー（自前が主）

自前CVがあるのにMeta側CVが0 → 警告（Pixel/イベント設定ズレ）

11. データ設計（DB切替前提：Repository層必須）
11.1 方針

Repository層で D1Repository と NeonRepository を切替

SQL差（SQLite/Postgres）を吸収するクエリ設計

画像/スナップショット/生成物はR2へ（DB肥大を防ぐ）

大量ログはDBに溜めない：DBは「集計・状態・紐付け」中心

11.2 テーブル（論理）

tenants, users, memberships

projects, project_assets, project_ng_rules

runs, intents

lp_variants, creative_variants, ad_copies

approvals（hash含む）

deployments（公開スナップショット参照）

meta_connections, meta_entities, ad_bundles（Manual時は remote_id が空でも成立）

events（自前計測）

insights_hourly/daily（ManualはCSV取り込みでも可）

decisions（confidence含む）

incidents（凍結/Rejected等）

audit_logs（hash chain）

jobs, notifications

12. DB移行（D1→Neon）要件

段階移行（止めない前提）：

Neonにスキーマ作成

D1→Neon移送（バッチ）

短期Dual-write（任意。難しければ“Run単位で切替”）

読み取りをNeonへ

書き込みもNeonへ

D1はキャッシュ/縮退

要件：

tenant単位またはrun単位で切替できるFeature Flagを持つ

移行中のRunning Runは「完了してから切替」推奨（整合性を簡単にする）

13. 受け入れテスト（指摘反映版）
13.1 Manual Mode E2E（必須）

Project作成（CV/NG/フォーム方式）

Run設計（予算/停止条件/最低サンプル/判定ルール）

生成→QA（NG突合）→ smoke-test（Playwright）→承認

公開→自前イベントpageview受信確認

OperatorがAds Managerで広告作成（手順書）→ systemへAd情報を登録（manual）

CV計測がVariant別に集計される

cost/click/impをCSVアップロード→CPA等が算出される

Rejected発生を登録→Incident化→修正→再承認→再提出チェック完了

Decision確定（confidence表示）→レポート→次Run生成（固定粒度が反映）

13.2 Full Auto/Hybrid（可能なら）

OAuth→entity作成→running→insights同期→停止条件→rejected検知→修正→再審査

13.3 ガードレール

Approvedなしで開始不可

stop_rules/budgetなしで開始不可

計測欠落（pageview未受信）で公開不可

NG一致で承認提出不可（ブロッカー）

14. 実装の固定ルール（ブレ防止）

Manual Modeで完走できる＝「Meta審査に依存しない」

CV比較は自前イベントで成立させる

QAはロジック（辞書/パターン/スモーク）まで実装する

判定は“強さ”を必ず出す（Insufficient/Directional/Confident）

次Runは固定粒度を明確に選べる


（前提：まず Workers + D1 でバックエンド着手 → 正式採用で DBだけNeon に差し替え）

(1) D1 DDL全文（SQLite / Cloudflare D1）
-- =========================================
-- Launch Test System (D1 / SQLite) Schema v1.1
-- IDs are TEXT (ULID/UUID string generated by app)
-- JSON is stored as TEXT (validate in application layer)
-- Timestamps: ISO8601 UTC string by default
-- =========================================

PRAGMA foreign_keys = ON;

-- ---------------------------
-- Core: tenants / users / memberships
-- ---------------------------
CREATE TABLE IF NOT EXISTS tenants (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,              -- used for subdomain or tenant key
  plan_key        TEXT NOT NULL DEFAULT 'free',
  settings_json   TEXT NOT NULL DEFAULT '{}',
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  name            TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- role: owner|operator|reviewer|viewer
-- status: active|invited|disabled
CREATE TABLE IF NOT EXISTS memberships (
  tenant_id       TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('owner','operator','reviewer','viewer')),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','disabled')),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (tenant_id, user_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_tenant ON memberships(tenant_id);

-- ---------------------------
-- Projects
-- ---------------------------
CREATE TABLE IF NOT EXISTS projects (
  id                 TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL,
  name               TEXT NOT NULL,

  -- business config
  offer_json          TEXT NOT NULL DEFAULT '{}',
  cv_definition_json  TEXT NOT NULL DEFAULT '{}',

  -- requested JSON schema target
  ng_rules_json       TEXT NOT NULL DEFAULT '{}',

  -- optional
  brand_json          TEXT NOT NULL DEFAULT '{}',

  -- form config: internal|external_redirect|webhook_submit
  form_config_json    TEXT NOT NULL DEFAULT '{}',

  default_disclaimer  TEXT NOT NULL DEFAULT '',

  archived_at         TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects(tenant_id);

-- project assets stored in R2
CREATE TABLE IF NOT EXISTS project_assets (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  asset_type    TEXT NOT NULL,             -- e.g. logo|evidence|image|pdf|other
  r2_key        TEXT NOT NULL,
  meta_json     TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_project_assets_project ON project_assets(project_id);

-- ---------------------------
-- Runs / Intents
-- ---------------------------
-- status: Draft|Designing|Generating|ReadyForReview|Approved|Publishing|Live|Running|Paused|Completed|Archived
-- operation_mode: manual|hybrid|auto
CREATE TABLE IF NOT EXISTS runs (
  id                     TEXT PRIMARY KEY,
  project_id              TEXT NOT NULL,
  name                   TEXT NOT NULL,

  status                 TEXT NOT NULL DEFAULT 'Draft',
  operation_mode         TEXT NOT NULL DEFAULT 'manual' CHECK (operation_mode IN ('manual','hybrid','auto')),

  start_at               TEXT,
  end_at                 TEXT,

  -- requested JSON schema target
  run_design_json        TEXT NOT NULL DEFAULT '{}',

  -- Stop Condition DSL (JSON)
  stop_dsl_json          TEXT NOT NULL DEFAULT '{}',

  -- Fixed/Explore granularity config (JSON)
  fixed_granularity_json TEXT NOT NULL DEFAULT '{}',

  -- decision config (JSON), optional
  decision_rules_json    TEXT NOT NULL DEFAULT '{}',

  created_by_user_id     TEXT,
  created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  approved_at            TEXT,
  published_at           TEXT,
  launched_at            TEXT,
  completed_at           TEXT,

  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_mode ON runs(operation_mode);

-- status: active|paused|archived
CREATE TABLE IF NOT EXISTS intents (
  id             TEXT PRIMARY KEY,
  run_id         TEXT NOT NULL,
  title          TEXT NOT NULL,
  hypothesis     TEXT NOT NULL DEFAULT '',
  evidence_json  TEXT NOT NULL DEFAULT '{}',
  faq_json       TEXT NOT NULL DEFAULT '{}',
  priority       INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_intents_run ON intents(run_id);
CREATE INDEX IF NOT EXISTS idx_intents_priority ON intents(run_id, priority);

-- ---------------------------
-- Variants: LP / Creative / Ad Copy
-- ---------------------------
-- approval_status: draft|submitted|approved|rejected
CREATE TABLE IF NOT EXISTS lp_variants (
  id               TEXT PRIMARY KEY,
  intent_id         TEXT NOT NULL,
  version           INTEGER NOT NULL DEFAULT 1,
  status            TEXT NOT NULL DEFAULT 'draft',     -- draft|ready|published|archived
  blocks_json       TEXT NOT NULL DEFAULT '{}',
  theme_json        TEXT NOT NULL DEFAULT '{}',
  qa_result_json    TEXT NOT NULL DEFAULT '{}',

  approval_status   TEXT NOT NULL DEFAULT 'draft' CHECK (approval_status IN ('draft','submitted','approved','rejected')),
  approved_hash     TEXT,                              -- hash of the approved content snapshot

  published_url     TEXT,
  snapshot_r2_key   TEXT,                              -- manifest/html snapshot key
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  FOREIGN KEY (intent_id) REFERENCES intents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lp_variants_intent ON lp_variants(intent_id);
CREATE INDEX IF NOT EXISTS idx_lp_variants_approval ON lp_variants(approval_status);

CREATE TABLE IF NOT EXISTS creative_variants (
  id               TEXT PRIMARY KEY,
  intent_id         TEXT NOT NULL,
  size              TEXT NOT NULL CHECK (size IN ('1:1','4:5','9:16')),
  version           INTEGER NOT NULL DEFAULT 1,
  status            TEXT NOT NULL DEFAULT 'draft',     -- draft|ready|archived
  text_layers_json  TEXT NOT NULL DEFAULT '{}',
  image_r2_key      TEXT NOT NULL,                    -- required
  qa_result_json    TEXT NOT NULL DEFAULT '{}',

  approval_status   TEXT NOT NULL DEFAULT 'draft' CHECK (approval_status IN ('draft','submitted','approved','rejected')),
  approved_hash     TEXT,

  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  FOREIGN KEY (intent_id) REFERENCES intents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_creative_variants_intent ON creative_variants(intent_id);
CREATE INDEX IF NOT EXISTS idx_creative_variants_size ON creative_variants(size);
CREATE INDEX IF NOT EXISTS idx_creative_variants_approval ON creative_variants(approval_status);

CREATE TABLE IF NOT EXISTS ad_copies (
  id               TEXT PRIMARY KEY,
  intent_id         TEXT NOT NULL,
  version           INTEGER NOT NULL DEFAULT 1,
  status            TEXT NOT NULL DEFAULT 'draft',
  primary_text      TEXT NOT NULL DEFAULT '',
  headline          TEXT NOT NULL DEFAULT '',
  description       TEXT NOT NULL DEFAULT '',
  qa_result_json    TEXT NOT NULL DEFAULT '{}',

  approval_status   TEXT NOT NULL DEFAULT 'draft' CHECK (approval_status IN ('draft','submitted','approved','rejected')),
  approved_hash     TEXT,

  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  FOREIGN KEY (intent_id) REFERENCES intents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ad_copies_intent ON ad_copies(intent_id);
CREATE INDEX IF NOT EXISTS idx_ad_copies_approval ON ad_copies(approval_status);

-- Approval records (auditable)
-- target_type: run|lp_variant|creative_variant|ad_copy|deployment|meta_config
CREATE TABLE IF NOT EXISTS approvals (
  id              TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL,
  target_type      TEXT NOT NULL,
  target_id        TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('submitted','approved','rejected')),
  reviewer_user_id TEXT,
  comment          TEXT NOT NULL DEFAULT '',
  target_hash      TEXT NOT NULL, -- content hash at approval time
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewer_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_approvals_target ON approvals(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_approvals_tenant ON approvals(tenant_id);

-- ---------------------------
-- Deployments / URLs
-- ---------------------------
CREATE TABLE IF NOT EXISTS deployments (
  id                      TEXT PRIMARY KEY,
  run_id                  TEXT NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'draft', -- draft|published|rolled_back|archived
  urls_json               TEXT NOT NULL DEFAULT '{}',
  snapshot_manifest_r2_key TEXT,  -- points to published snapshot manifest
  created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_deployments_run ON deployments(run_id);

-- ---------------------------
-- Meta connections / entities / bundles
-- ---------------------------
-- status: active|revoked|error
CREATE TABLE IF NOT EXISTS meta_connections (
  id               TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','error')),
  token_ref        TEXT NOT NULL,         -- reference to encrypted token in secret store / KV
  ad_account_id    TEXT,
  pixel_id         TEXT,
  page_id          TEXT,
  ig_user_id       TEXT,
  scopes_json      TEXT NOT NULL DEFAULT '[]',
  meta_json        TEXT NOT NULL DEFAULT '{}',
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meta_connections_tenant ON meta_connections(tenant_id);

-- entity_type: campaign|adset|ad|creative
CREATE TABLE IF NOT EXISTS meta_entities (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL,
  intent_id     TEXT,
  entity_type   TEXT NOT NULL CHECK (entity_type IN ('campaign','adset','ad','creative')),
  local_ref     TEXT NOT NULL,      -- internal logical key for mapping
  remote_id     TEXT,               -- may be NULL in Manual Mode
  status        TEXT NOT NULL DEFAULT 'draft',
  meta_json     TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
  FOREIGN KEY (intent_id) REFERENCES intents(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_meta_entities_run ON meta_entities(run_id);
CREATE INDEX IF NOT EXISTS idx_meta_entities_remote ON meta_entities(remote_id);

-- Ad Bundle ties LP + Creative + Copy (+ optional Meta IDs) + UTM
CREATE TABLE IF NOT EXISTS ad_bundles (
  id                  TEXT PRIMARY KEY,
  run_id              TEXT NOT NULL,
  intent_id           TEXT NOT NULL,
  lp_variant_id       TEXT NOT NULL,
  creative_variant_id TEXT NOT NULL,
  ad_copy_id          TEXT NOT NULL,

  utm_string          TEXT NOT NULL, -- canonical UTM string for tracking
  status              TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','running','paused','archived')),

  -- optional meta mapping (NULL allowed for Manual Mode)
  meta_campaign_id    TEXT,
  meta_adset_id       TEXT,
  meta_ad_id          TEXT,

  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
  FOREIGN KEY (intent_id) REFERENCES intents(id) ON DELETE CASCADE,
  FOREIGN KEY (lp_variant_id) REFERENCES lp_variants(id) ON DELETE CASCADE,
  FOREIGN KEY (creative_variant_id) REFERENCES creative_variants(id) ON DELETE CASCADE,
  FOREIGN KEY (ad_copy_id) REFERENCES ad_copies(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ad_bundles_run ON ad_bundles(run_id);
CREATE INDEX IF NOT EXISTS idx_ad_bundles_meta_ad ON ad_bundles(meta_ad_id);

-- ---------------------------
-- Events (first-party) + Insights (Meta or Manual import)
-- ---------------------------
-- event_type: pageview|cta_click|form_submit|form_success
CREATE TABLE IF NOT EXISTS events (
  id                  TEXT PRIMARY KEY,  -- event_id for dedupe
  tenant_id            TEXT NOT NULL,
  run_id              TEXT NOT NULL,
  intent_id           TEXT,
  lp_variant_id       TEXT NOT NULL,
  creative_variant_id TEXT,
  ad_bundle_id        TEXT,              -- optional, can be resolved by utm
  event_type          TEXT NOT NULL CHECK (event_type IN ('pageview','cta_click','form_submit','form_success')),
  ts_ms               INTEGER NOT NULL,  -- epoch ms

  session_id          TEXT NOT NULL,
  page_url            TEXT NOT NULL,
  referrer            TEXT,
  user_agent          TEXT,
  ip_hash             TEXT,              -- optional (hash server-side)

  meta_json           TEXT NOT NULL DEFAULT '{}',

  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
  FOREIGN KEY (intent_id) REFERENCES intents(id) ON DELETE SET NULL,
  FOREIGN KEY (lp_variant_id) REFERENCES lp_variants(id) ON DELETE CASCADE,
  FOREIGN KEY (creative_variant_id) REFERENCES creative_variants(id) ON DELETE SET NULL,
  FOREIGN KEY (ad_bundle_id) REFERENCES ad_bundles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_events_run_ts ON events(run_id, ts_ms);
CREATE INDEX IF NOT EXISTS idx_events_lp_ts ON events(lp_variant_id, ts_ms);
CREATE INDEX IF NOT EXISTS idx_events_session_ts ON events(session_id, ts_ms);

-- Hourly metrics per bundle (from Meta Insights OR manual import)
CREATE TABLE IF NOT EXISTS insights_hourly (
  ad_bundle_id   TEXT NOT NULL,
  ts_hour        TEXT NOT NULL,          -- ISO hour: 2026-01-13T10:00:00Z
  metrics_json   TEXT NOT NULL DEFAULT '{}',
  source         TEXT NOT NULL DEFAULT 'meta' CHECK (source IN ('meta','manual')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (ad_bundle_id, ts_hour),
  FOREIGN KEY (ad_bundle_id) REFERENCES ad_bundles(id) ON DELETE CASCADE
);

-- Daily metrics per bundle
CREATE TABLE IF NOT EXISTS insights_daily (
  ad_bundle_id   TEXT NOT NULL,
  date_yyyy_mm_dd TEXT NOT NULL,         -- 2026-01-13
  metrics_json   TEXT NOT NULL DEFAULT '{}',
  source         TEXT NOT NULL DEFAULT 'meta' CHECK (source IN ('meta','manual')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (ad_bundle_id, date_yyyy_mm_dd),
  FOREIGN KEY (ad_bundle_id) REFERENCES ad_bundles(id) ON DELETE CASCADE
);

-- Manual import audit
CREATE TABLE IF NOT EXISTS manual_imports (
  id           TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  run_id       TEXT NOT NULL,
  import_type  TEXT NOT NULL CHECK (import_type IN ('insights_csv','mapping_csv')),
  file_r2_key  TEXT NOT NULL,
  summary_json TEXT NOT NULL DEFAULT '{}',
  created_by_user_id TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_manual_imports_run ON manual_imports(run_id);

-- ---------------------------
-- Decisions / Incidents
-- ---------------------------
-- confidence: insufficient|directional|confident
CREATE TABLE IF NOT EXISTS decisions (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final')),
  confidence    TEXT NOT NULL DEFAULT 'insufficient' CHECK (confidence IN ('insufficient','directional','confident')),
  winner_json   TEXT NOT NULL DEFAULT '{}',
  ranking_json  TEXT NOT NULL DEFAULT '{}',
  stats_json    TEXT NOT NULL DEFAULT '{}',      -- e.g. CI/Bayes results, thresholds
  rationale     TEXT NOT NULL DEFAULT '',
  decided_at    TEXT,
  created_by_user_id TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_decisions_run ON decisions(run_id);

-- incident_type: meta_rejected|meta_account_issue|api_outage|measurement_issue|other
-- severity: low|medium|high|critical
-- status: open|mitigating|resolved
CREATE TABLE IF NOT EXISTS incidents (
  id            TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  run_id        TEXT,
  incident_type TEXT NOT NULL,
  severity      TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','mitigating','resolved')),
  reason        TEXT NOT NULL DEFAULT '',
  meta_json     TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  resolved_at   TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_incidents_tenant ON incidents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_incidents_run ON incidents(run_id);

-- ---------------------------
-- Audit logs / Jobs / Notifications / Feature Flags
-- ---------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id             TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  actor_user_id  TEXT,
  action         TEXT NOT NULL,          -- e.g. run.launch, approval.approve
  target_type    TEXT NOT NULL,
  target_id      TEXT NOT NULL,

  before_json    TEXT NOT NULL DEFAULT '{}',
  after_json     TEXT NOT NULL DEFAULT '{}',

  prev_hash      TEXT,
  hash           TEXT NOT NULL,
  request_id     TEXT NOT NULL,

  ts_ms          INTEGER NOT NULL,
  ip_hash        TEXT,
  user_agent     TEXT,

  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_ts ON audit_logs(tenant_id, ts_ms);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_request ON audit_logs(request_id);

-- job_type: generate|qa_smoke|publish|meta_sync|stop_eval|report|notify|import_parse
-- status: queued|running|succeeded|failed|cancelled
CREATE TABLE IF NOT EXISTS jobs (
  id            TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  job_type      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  payload_json  TEXT NOT NULL DEFAULT '{}',
  result_json   TEXT NOT NULL DEFAULT '{}',
  attempts      INTEGER NOT NULL DEFAULT 0,
  max_attempts  INTEGER NOT NULL DEFAULT 10,
  last_error    TEXT NOT NULL DEFAULT '',
  scheduled_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_jobs_tenant_status ON jobs(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_type_status ON jobs(job_type, status);

-- channel: email|slack|webhook
-- status: pending|sent|failed
CREATE TABLE IF NOT EXISTS notifications (
  id           TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  channel      TEXT NOT NULL CHECK (channel IN ('email','slack','webhook')),
  event_type   TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  sent_at      TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_tenant_status ON notifications(tenant_id, status);

-- Feature flags for gradual DB migration / mode toggles
CREATE TABLE IF NOT EXISTS tenant_flags (
  tenant_id    TEXT NOT NULL,
  flag_key     TEXT NOT NULL,
  value_json   TEXT NOT NULL DEFAULT '{}',
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (tenant_id, flag_key),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

(2) Neon DDL全文（Postgres / Neon）
-- =========================================
-- Launch Test System (Neon / Postgres) Schema v1.1
-- IDs are TEXT (same as D1) to simplify migration.
-- JSON uses JSONB.
-- =========================================

-- Optional but useful:
-- CREATE EXTENSION IF NOT EXISTS citext;
-- CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------
-- tenants / users / memberships
-- ---------------------------
CREATE TABLE IF NOT EXISTS tenants (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  plan_key        TEXT NOT NULL DEFAULT 'free',
  settings_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  name            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('owner','operator','reviewer','viewer')),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','disabled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_tenant ON memberships(tenant_id);

-- ---------------------------
-- projects / assets
-- ---------------------------
CREATE TABLE IF NOT EXISTS projects (
  id                 TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,

  offer_json          JSONB NOT NULL DEFAULT '{}'::jsonb,
  cv_definition_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  ng_rules_json       JSONB NOT NULL DEFAULT '{}'::jsonb,
  brand_json          JSONB NOT NULL DEFAULT '{}'::jsonb,
  form_config_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_disclaimer  TEXT NOT NULL DEFAULT '',

  archived_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects(tenant_id);

CREATE TABLE IF NOT EXISTS project_assets (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  asset_type    TEXT NOT NULL,
  r2_key        TEXT NOT NULL,
  meta_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_assets_project ON project_assets(project_id);

-- ---------------------------
-- runs / intents
-- ---------------------------
CREATE TABLE IF NOT EXISTS runs (
  id                     TEXT PRIMARY KEY,
  project_id              TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name                   TEXT NOT NULL,

  status                 TEXT NOT NULL DEFAULT 'Draft',
  operation_mode         TEXT NOT NULL DEFAULT 'manual' CHECK (operation_mode IN ('manual','hybrid','auto')),

  start_at               TIMESTAMPTZ,
  end_at                 TIMESTAMPTZ,

  run_design_json        JSONB NOT NULL DEFAULT '{}'::jsonb,
  stop_dsl_json          JSONB NOT NULL DEFAULT '{}'::jsonb,
  fixed_granularity_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  decision_rules_json    JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_by_user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  approved_at            TIMESTAMPTZ,
  published_at           TIMESTAMPTZ,
  launched_at            TIMESTAMPTZ,
  completed_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_mode ON runs(operation_mode);

CREATE TABLE IF NOT EXISTS intents (
  id             TEXT PRIMARY KEY,
  run_id         TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  hypothesis     TEXT NOT NULL DEFAULT '',
  evidence_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  faq_json       JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority       INT NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intents_run ON intents(run_id);
CREATE INDEX IF NOT EXISTS idx_intents_priority ON intents(run_id, priority);

-- ---------------------------
-- variants
-- ---------------------------
CREATE TABLE IF NOT EXISTS lp_variants (
  id               TEXT PRIMARY KEY,
  intent_id         TEXT NOT NULL REFERENCES intents(id) ON DELETE CASCADE,
  version           INT NOT NULL DEFAULT 1,
  status            TEXT NOT NULL DEFAULT 'draft',
  blocks_json       JSONB NOT NULL DEFAULT '{}'::jsonb,
  theme_json        JSONB NOT NULL DEFAULT '{}'::jsonb,
  qa_result_json    JSONB NOT NULL DEFAULT '{}'::jsonb,

  approval_status   TEXT NOT NULL DEFAULT 'draft' CHECK (approval_status IN ('draft','submitted','approved','rejected')),
  approved_hash     TEXT,

  published_url     TEXT,
  snapshot_r2_key   TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lp_variants_intent ON lp_variants(intent_id);
CREATE INDEX IF NOT EXISTS idx_lp_variants_approval ON lp_variants(approval_status);

CREATE TABLE IF NOT EXISTS creative_variants (
  id               TEXT PRIMARY KEY,
  intent_id         TEXT NOT NULL REFERENCES intents(id) ON DELETE CASCADE,
  size              TEXT NOT NULL CHECK (size IN ('1:1','4:5','9:16')),
  version           INT NOT NULL DEFAULT 1,
  status            TEXT NOT NULL DEFAULT 'draft',
  text_layers_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  image_r2_key      TEXT NOT NULL,
  qa_result_json    JSONB NOT NULL DEFAULT '{}'::jsonb,

  approval_status   TEXT NOT NULL DEFAULT 'draft' CHECK (approval_status IN ('draft','submitted','approved','rejected')),
  approved_hash     TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creative_variants_intent ON creative_variants(intent_id);
CREATE INDEX IF NOT EXISTS idx_creative_variants_size ON creative_variants(size);
CREATE INDEX IF NOT EXISTS idx_creative_variants_approval ON creative_variants(approval_status);

CREATE TABLE IF NOT EXISTS ad_copies (
  id               TEXT PRIMARY KEY,
  intent_id         TEXT NOT NULL REFERENCES intents(id) ON DELETE CASCADE,
  version           INT NOT NULL DEFAULT 1,
  status            TEXT NOT NULL DEFAULT 'draft',
  primary_text      TEXT NOT NULL DEFAULT '',
  headline          TEXT NOT NULL DEFAULT '',
  description       TEXT NOT NULL DEFAULT '',
  qa_result_json    JSONB NOT NULL DEFAULT '{}'::jsonb,

  approval_status   TEXT NOT NULL DEFAULT 'draft' CHECK (approval_status IN ('draft','submitted','approved','rejected')),
  approved_hash     TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_copies_intent ON ad_copies(intent_id);
CREATE INDEX IF NOT EXISTS idx_ad_copies_approval ON ad_copies(approval_status);

CREATE TABLE IF NOT EXISTS approvals (
  id              TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  target_type      TEXT NOT NULL,
  target_id        TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('submitted','approved','rejected')),
  reviewer_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  comment          TEXT NOT NULL DEFAULT '',
  target_hash      TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approvals_target ON approvals(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_approvals_tenant ON approvals(tenant_id);

-- ---------------------------
-- deployments
-- ---------------------------
CREATE TABLE IF NOT EXISTS deployments (
  id                      TEXT PRIMARY KEY,
  run_id                  TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  status                  TEXT NOT NULL DEFAULT 'draft',
  urls_json               JSONB NOT NULL DEFAULT '{}'::jsonb,
  snapshot_manifest_r2_key TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deployments_run ON deployments(run_id);

-- ---------------------------
-- meta
-- ---------------------------
CREATE TABLE IF NOT EXISTS meta_connections (
  id               TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','error')),
  token_ref        TEXT NOT NULL,
  ad_account_id    TEXT,
  pixel_id         TEXT,
  page_id          TEXT,
  ig_user_id       TEXT,
  scopes_json      JSONB NOT NULL DEFAULT '[]'::jsonb,
  meta_json        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_connections_tenant ON meta_connections(tenant_id);

CREATE TABLE IF NOT EXISTS meta_entities (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  intent_id     TEXT REFERENCES intents(id) ON DELETE SET NULL,
  entity_type   TEXT NOT NULL CHECK (entity_type IN ('campaign','adset','ad','creative')),
  local_ref     TEXT NOT NULL,
  remote_id     TEXT,
  status        TEXT NOT NULL DEFAULT 'draft',
  meta_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_entities_run ON meta_entities(run_id);
CREATE INDEX IF NOT EXISTS idx_meta_entities_remote ON meta_entities(remote_id);

CREATE TABLE IF NOT EXISTS ad_bundles (
  id                  TEXT PRIMARY KEY,
  run_id              TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  intent_id           TEXT NOT NULL REFERENCES intents(id) ON DELETE CASCADE,
  lp_variant_id       TEXT NOT NULL REFERENCES lp_variants(id) ON DELETE CASCADE,
  creative_variant_id TEXT NOT NULL REFERENCES creative_variants(id) ON DELETE CASCADE,
  ad_copy_id          TEXT NOT NULL REFERENCES ad_copies(id) ON DELETE CASCADE,

  utm_string          TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','running','paused','archived')),

  meta_campaign_id    TEXT,
  meta_adset_id       TEXT,
  meta_ad_id          TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_bundles_run ON ad_bundles(run_id);
CREATE INDEX IF NOT EXISTS idx_ad_bundles_meta_ad ON ad_bundles(meta_ad_id);

-- ---------------------------
-- first-party events / insights / manual imports
-- ---------------------------
CREATE TABLE IF NOT EXISTS events (
  id                  TEXT PRIMARY KEY,
  tenant_id            TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_id              TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  intent_id           TEXT REFERENCES intents(id) ON DELETE SET NULL,
  lp_variant_id       TEXT NOT NULL REFERENCES lp_variants(id) ON DELETE CASCADE,
  creative_variant_id TEXT REFERENCES creative_variants(id) ON DELETE SET NULL,
  ad_bundle_id        TEXT REFERENCES ad_bundles(id) ON DELETE SET NULL,

  event_type          TEXT NOT NULL CHECK (event_type IN ('pageview','cta_click','form_submit','form_success')),
  ts                 TIMESTAMPTZ NOT NULL,

  session_id          TEXT NOT NULL,
  page_url            TEXT NOT NULL,
  referrer            TEXT,
  user_agent          TEXT,
  ip_hash             TEXT,
  meta_json           JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_events_run_ts ON events(run_id, ts);
CREATE INDEX IF NOT EXISTS idx_events_lp_ts ON events(lp_variant_id, ts);
CREATE INDEX IF NOT EXISTS idx_events_session_ts ON events(session_id, ts);

CREATE TABLE IF NOT EXISTS insights_hourly (
  ad_bundle_id   TEXT NOT NULL REFERENCES ad_bundles(id) ON DELETE CASCADE,
  ts_hour        TIMESTAMPTZ NOT NULL,
  metrics_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  source         TEXT NOT NULL DEFAULT 'meta' CHECK (source IN ('meta','manual')),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ad_bundle_id, ts_hour)
);

CREATE TABLE IF NOT EXISTS insights_daily (
  ad_bundle_id   TEXT NOT NULL REFERENCES ad_bundles(id) ON DELETE CASCADE,
  date_yyyy_mm_dd DATE NOT NULL,
  metrics_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  source         TEXT NOT NULL DEFAULT 'meta' CHECK (source IN ('meta','manual')),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ad_bundle_id, date_yyyy_mm_dd)
);

CREATE TABLE IF NOT EXISTS manual_imports (
  id           TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_id       TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  import_type  TEXT NOT NULL CHECK (import_type IN ('insights_csv','mapping_csv')),
  file_r2_key  TEXT NOT NULL,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_manual_imports_run ON manual_imports(run_id);

-- ---------------------------
-- decisions / incidents
-- ---------------------------
CREATE TABLE IF NOT EXISTS decisions (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final')),
  confidence    TEXT NOT NULL DEFAULT 'insufficient' CHECK (confidence IN ('insufficient','directional','confident')),
  winner_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  ranking_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  stats_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  rationale     TEXT NOT NULL DEFAULT '',
  decided_at    TIMESTAMPTZ,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decisions_run ON decisions(run_id);

CREATE TABLE IF NOT EXISTS incidents (
  id            TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_id        TEXT REFERENCES runs(id) ON DELETE SET NULL,
  incident_type TEXT NOT NULL,
  severity      TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','mitigating','resolved')),
  reason        TEXT NOT NULL DEFAULT '',
  meta_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_incidents_tenant ON incidents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_incidents_run ON incidents(run_id);

-- ---------------------------
-- audit / jobs / notifications / flags
-- ---------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id             TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_user_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  action         TEXT NOT NULL,
  target_type    TEXT NOT NULL,
  target_id      TEXT NOT NULL,

  before_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_json     JSONB NOT NULL DEFAULT '{}'::jsonb,

  prev_hash      TEXT,
  hash           TEXT NOT NULL,
  request_id     TEXT NOT NULL,

  ts             TIMESTAMPTZ NOT NULL,
  ip_hash        TEXT,
  user_agent     TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_ts ON audit_logs(tenant_id, ts);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_request ON audit_logs(request_id);

CREATE TABLE IF NOT EXISTS jobs (
  id            TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_type      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  payload_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts      INT NOT NULL DEFAULT 0,
  max_attempts  INT NOT NULL DEFAULT 10,
  last_error    TEXT NOT NULL DEFAULT '',
  scheduled_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_tenant_status ON jobs(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_type_status ON jobs(job_type, status);

CREATE TABLE IF NOT EXISTS notifications (
  id           TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel      TEXT NOT NULL CHECK (channel IN ('email','slack','webhook')),
  event_type   TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  sent_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_tenant_status ON notifications(tenant_id, status);

CREATE TABLE IF NOT EXISTS tenant_flags (
  tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  flag_key     TEXT NOT NULL,
  value_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, flag_key)
);

(3) JSONスキーマ（ng_rules / run_design / fixed_granularity）

以下は JSON Schema 2020-12 です（Workers側でAjv等で検証する想定）。

3-a) ng_rules JSON Schema
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.com/schemas/ng_rules.schema.json",
  "title": "ng_rules",
  "type": "object",
  "additionalProperties": false,
  "required": ["version", "blocked_terms", "blocked_patterns", "claim_requires_evidence", "required_disclaimer"],
  "properties": {
    "version": { "type": "string", "pattern": "^1\\.(0|[1-9]\\d*)$" },

    "blocked_terms": {
      "type": "array",
      "items": { "type": "string", "minLength": 1 },
      "default": []
    },

    "blocked_patterns": {
      "type": "array",
      "default": [],
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["pattern", "severity"],
        "properties": {
          "pattern": { "type": "string", "minLength": 1 },
          "flags": { "type": "string", "default": "i" },
          "reason": { "type": "string", "default": "" },
          "severity": { "type": "string", "enum": ["blocker", "warn"], "default": "blocker" }
        }
      }
    },

    "allowlist_terms": {
      "type": "array",
      "items": { "type": "string", "minLength": 1 },
      "default": []
    },

    "required_disclaimer": {
      "description": "Must be present somewhere in LP (exact match OR normalized match defined by app).",
      "type": "array",
      "items": { "type": "string", "minLength": 1 },
      "default": []
    },

    "claim_requires_evidence": {
      "type": "array",
      "default": [],
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["pattern", "evidence_types", "severity"],
        "properties": {
          "pattern": { "type": "string", "minLength": 1 },
          "flags": { "type": "string", "default": "i" },
          "evidence_types": {
            "type": "array",
            "items": { "type": "string", "enum": ["number", "case_study", "testimonial", "third_party", "internal_policy", "other"] },
            "minItems": 1
          },
          "message": { "type": "string", "default": "根拠の提示が必要な主張です。" },
          "severity": { "type": "string", "enum": ["blocker", "warn"], "default": "warn" }
        }
      }
    },

    "normalization": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "ignore_whitespace": { "type": "boolean", "default": true },
        "ignore_punctuation": { "type": "boolean", "default": true },
        "case_insensitive": { "type": "boolean", "default": true }
      },
      "default": { "ignore_whitespace": true, "ignore_punctuation": true, "case_insensitive": true }
    }
  }
}

3-b) run_design JSON Schema
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.com/schemas/run_design.schema.json",
  "title": "run_design",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "version",
    "operation_mode",
    "kpi",
    "budget",
    "compare_axis",
    "sample_thresholds",
    "confidence_thresholds",
    "form_mode",
    "utm_policy"
  ],
  "properties": {
    "version": { "type": "string", "pattern": "^1\\.(0|[1-9]\\d*)$" },

    "operation_mode": { "type": "string", "enum": ["manual", "hybrid", "auto"] },

    "timezone": { "type": "string", "default": "Asia/Tokyo" },

    "kpi": {
      "type": "object",
      "additionalProperties": false,
      "required": ["primary"],
      "properties": {
        "primary": { "type": "string", "enum": ["cpa", "cv", "cvr"] },
        "secondary": {
          "type": "array",
          "items": { "type": "string", "enum": ["cpa", "cv", "cvr", "ctr", "cpc", "cpm", "spend"] },
          "default": []
        },
        "optimization_event": {
          "description": "Meta optimization event when in hybrid/auto",
          "type": "string",
          "default": "Lead"
        }
      }
    },

    "budget": {
      "type": "object",
      "additionalProperties": false,
      "required": ["currency", "total_cap"],
      "properties": {
        "currency": { "type": "string", "default": "JPY" },
        "total_cap": { "type": "number", "minimum": 0 },
        "daily_cap": { "type": "number", "minimum": 0, "nullable": true }
      }
    },

    "compare_axis": {
      "type": "object",
      "additionalProperties": false,
      "required": ["mode"],
      "properties": {
        "mode": { "type": "string", "enum": ["intent", "lp_variant", "creative_variant", "bundle"] },
        "notes": { "type": "string", "default": "" }
      }
    },

    "form_mode": {
      "type": "object",
      "additionalProperties": false,
      "required": ["type"],
      "properties": {
        "type": { "type": "string", "enum": ["internal", "external_redirect", "webhook_submit"] },
        "external_url": { "type": "string", "format": "uri", "nullable": true },
        "webhook_url": { "type": "string", "format": "uri", "nullable": true }
      }
    },

    "sample_thresholds": {
      "description": "最低サンプル（結論の強さ判定に使用）",
      "type": "object",
      "additionalProperties": false,
      "required": ["insufficient", "directional", "confident"],
      "properties": {
        "insufficient": {
          "type": "object",
          "additionalProperties": false,
          "required": ["min_total_clicks", "min_total_cvs"],
          "properties": {
            "min_total_clicks": { "type": "integer", "minimum": 0, "default": 200 },
            "min_total_cvs": { "type": "integer", "minimum": 0, "default": 3 }
          }
        },
        "directional": {
          "type": "object",
          "additionalProperties": false,
          "required": ["min_total_clicks", "min_total_cvs"],
          "properties": {
            "min_total_clicks": { "type": "integer", "minimum": 0, "default": 200 },
            "min_total_cvs": { "type": "integer", "minimum": 0, "default": 5 }
          }
        },
        "confident": {
          "type": "object",
          "additionalProperties": false,
          "required": ["min_total_cvs", "min_per_variant_cvs"],
          "properties": {
            "min_total_cvs": { "type": "integer", "minimum": 0, "default": 20 },
            "min_per_variant_cvs": { "type": "integer", "minimum": 0, "default": 5 }
          }
        }
      }
    },

    "confidence_thresholds": {
      "description": "簡易統計の方針（Wilson CI or Bayes）と表示ルール",
      "type": "object",
      "additionalProperties": false,
      "required": ["method", "alpha", "min_effect"],
      "properties": {
        "method": { "type": "string", "enum": ["wilson", "bayes"], "default": "wilson" },
        "alpha": { "type": "number", "minimum": 0.0001, "maximum": 0.2, "default": 0.05 },
        "min_effect": {
          "description": "差が小さすぎる勝ちを避けるための最小効果量（CVR差など）",
          "type": "number",
          "minimum": 0,
          "default": 0.0
        }
      }
    },

    "utm_policy": {
      "type": "object",
      "additionalProperties": false,
      "required": ["source", "medium", "campaign_key", "content_key"],
      "properties": {
        "source": { "type": "string", "default": "meta" },
        "medium": { "type": "string", "default": "paid_social" },
        "campaign_key": { "type": "string", "default": "run_{run_id}" },
        "content_key": {
          "description": "Must be resolvable to (intent/lp/creative/bundle)",
          "type": "string",
          "default": "intent_{intent_id}_lp_{lp_variant_id}_cr_{creative_variant_id}"
        }
      }
    }
  }
}

3-c) fixed_granularity JSON Schema
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.com/schemas/fixed_granularity.schema.json",
  "title": "fixed_granularity",
  "type": "object",
  "additionalProperties": false,
  "required": ["version", "fixed", "explore"],
  "properties": {
    "version": { "type": "string", "pattern": "^1\\.(0|[1-9]\\d*)$" },

    "fixed": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "intent": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "lock_intent_ids": {
              "description": "次Runでも同じ訴求軸を維持する",
              "type": "array",
              "items": { "type": "string", "minLength": 1 },
              "default": []
            }
          },
          "default": { "lock_intent_ids": [] }
        },

        "lp": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "lock_structure": { "type": "boolean", "default": false },
            "lock_theme": { "type": "boolean", "default": false },
            "lock_blocks": {
              "description": "ブロック単位固定（例：fv, proof, faq など）",
              "type": "array",
              "items": { "type": "string", "enum": ["fv", "empathy", "solution", "proof", "steps", "faq", "cta", "disclaimer"] },
              "default": []
            },
            "lock_copy_paths": {
              "description": "JSONPath風の指定（例：blocks.fv.headline）",
              "type": "array",
              "items": { "type": "string", "minLength": 1 },
              "default": []
            }
          },
          "default": { "lock_structure": false, "lock_theme": false, "lock_blocks": [], "lock_copy_paths": [] }
        },

        "banner": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "lock_template": { "type": "boolean", "default": false },
            "lock_image_layout": { "type": "boolean", "default": false },
            "lock_text_layers": { "type": "boolean", "default": false },
            "lock_sizes": {
              "type": "array",
              "items": { "type": "string", "enum": ["1:1", "4:5", "9:16"] },
              "default": []
            }
          },
          "default": { "lock_template": false, "lock_image_layout": false, "lock_text_layers": false, "lock_sizes": [] }
        },

        "ad_copy": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "lock_primary_text": { "type": "boolean", "default": false },
            "lock_headline": { "type": "boolean", "default": false },
            "lock_description": { "type": "boolean", "default": false }
          },
          "default": { "lock_primary_text": false, "lock_headline": false, "lock_description": false }
        }
      },
      "default": {}
    },

    "explore": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "intent": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "max_new_intents": { "type": "integer", "minimum": 0, "default": 1 },
            "allow_replace_intents": { "type": "boolean", "default": true }
          },
          "default": { "max_new_intents": 1, "allow_replace_intents": true }
        },
        "lp": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "max_new_fv_copies": { "type": "integer", "minimum": 0, "default": 3 },
            "max_new_cta_copies": { "type": "integer", "minimum": 0, "default": 2 },
            "allow_block_reorder": { "type": "boolean", "default": false }
          },
          "default": { "max_new_fv_copies": 3, "max_new_cta_copies": 2, "allow_block_reorder": false }
        },
        "banner": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "max_new_text_variants": { "type": "integer", "minimum": 0, "default": 6 },
            "allow_new_templates": { "type": "boolean", "default": true }
          },
          "default": { "max_new_text_variants": 6, "allow_new_templates": true }
        }
      },
      "default": {}
    }
  }
}

(4) 停止条件DSL（Stop Condition DSL）仕様
定義（Runの stop_dsl_json で保持）

停止条件は ルール集合。Cron（例：5分/15分間隔）で評価し、必要なら RunまたはBundleをPause する。

ルールは「gating（適用条件）」と「threshold（閾値）」と「action（実行）」で構成。

DSLフォーマット（JSON）
{
  "version": "1.0",
  "evaluation_interval_sec": 300,
  "safe_mode_on_error": true,
  "rules": [
    {
      "id": "cap-total",
      "enabled": true,
      "scope": "run",
      "type": "spend_total_cap",
      "gating": { "min_elapsed_sec": 0 },
      "params": { "cap": 50000, "currency": "JPY" },
      "action": { "type": "pause_run", "notify": true, "message": "総額上限に達したため停止" }
    }
  ]
}

ルールタイプ（必須実装）

spend_total_cap（総額上限）

spend_daily_cap（日額上限）

cpa_cap（CPA上限：最低サンプル到達後に適用）

cv_zero_duration（CVゼロ継続：N分/時間）

measurement_anomaly（計測欠落：UTM流入あるのにpageview等が来ない）

meta_rejected（Rejected検知時：安全停止＋Incident化）

sync_failure_streak（Insights同期失敗が連続）

Scope（作用範囲）

run：Run全体をPause

bundle：Ad Bundle単位でPause（auto/hybrid時）

notify_only：通知のみ（Manual Modeで有効）

gating（適用条件）の標準キー

min_elapsed_sec：開始からの経過秒

min_total_clicks / min_total_cvs

min_impressions（Hybrid/Autoのみ）

min_spend（通貨はrun_design.budget.currency）

action（実行）タイプ

pause_run

pause_bundle

notify_only

create_incident（必ず meta_json を残す）

(7) 自前イベント /e ペイロード仕様（First-party tracking）
定義

LPに埋め込まれたビーコンが Workers API の /e に送るイベント。
Manual ModeでもCV比較が成立することが目的（Pixelは補助）。

エンドポイント

POST /e（単発）

POST /e/batch（まとめ）

共通仕様

Content-Type: application/json

CORS：LP配信ドメインからのみ許可（Origin/Refererチェック推奨）

冪等性：event_id で重複排除（events.idがPK）

サーバ側で付与/補完：

user_agent（Header）

ip_hash（IPをソルト付きでハッシュ。生IPは保存しない）

received_at（ログ用）

POST /e Request Body
{
  "v": "1",
  "event_id": "01J3...ULID",
  "ts_ms": 1768320000000,
  "event_type": "pageview",
  "session_id": "s_01J3...",

  "run_id": "01J3RUN...",
  "lp_variant_id": "01J3LP...",
  "intent_id": "01J3INT...", 
  "creative_variant_id": "01J3CR...", 
  "ad_bundle_id": "01J3BUNDLE...",

  "page_url": "https://t.example.com/r/...?...utm_...",
  "referrer": "https://www.facebook.com/",
  "meta": {
    "utm": {
      "utm_source": "meta",
      "utm_medium": "paid_social",
      "utm_campaign": "run_01J3RUN...",
      "utm_content": "intent_..._lp_..._cr_..."
    },
    "device": { "w": 390, "h": 844, "dpr": 3 },
    "locale": "ja-JP"
  }
}

必須フィールド

v, event_id, ts_ms, event_type, session_id, run_id, lp_variant_id, page_url

任意フィールド（可能なら送る）

intent_id（lp_variantから復元できるが、送ると集計が速い）

creative_variant_id（UTMから復元できるが、送ると速い）

ad_bundle_id（UTM→bundle解決があるため任意）

referrer, meta

event_type

pageview

cta_click

form_submit

form_success（Internal Form推奨時に必ず送る）

POST /e/batch Request Body
{
  "v": "1",
  "events": [
    { "event_id": "01...", "ts_ms": 0, "event_type": "pageview", "session_id": "s1", "run_id": "r", "lp_variant_id": "lp", "page_url": "..." }
  ]
}

レスポンス（共通）
{
  "ok": true,
  "ingested": 10,
  "deduped": 2
}

(8) API仕様（主要エンドポイント一覧）

「まずWorkers + D1でバックエンドを書き始める」ための最小セット。
（Auth方式は Magic Link/OAuth どちらでも良いが、ここは Bearer前提で列挙）

認証・基本

GET /me：自分のユーザー情報＋所属テナント一覧

POST /auth/logout

テナント/ユーザー/RBAC

GET /tenant：現在テナント設定取得

PATCH /tenant：テナント設定更新

POST /memberships/invite：ユーザー招待（role指定）

PATCH /memberships/{user_id}：role/status更新

プロジェクト

GET /projects

POST /projects

GET /projects/{project_id}

PATCH /projects/{project_id}

POST /projects/{project_id}/assets：R2アップロード用の署名URL発行 or 直接登録

GET /projects/{project_id}/assets

Run（設計〜完走）

GET /runs

POST /runs

GET /runs/{run_id}

PATCH /runs/{run_id}（基本情報）

POST /runs/{run_id}/design：run_design_json 保存（Schema検証必須）

POST /runs/{run_id}/stop-dsl：stop_dsl_json 保存（DSL検証必須）

POST /runs/{run_id}/fixed-granularity：固定粒度 保存（Schema検証必須）

Intent

GET /runs/{run_id}/intents

POST /runs/{run_id}/intents

PATCH /intents/{intent_id}

DELETE /intents/{intent_id}（論理削除推奨）

生成（Queues投入）

POST /runs/{run_id}/generate：LP/バナー/広告文 生成ジョブ投入

GET /runs/{run_id}/jobs

POST /jobs/{job_id}/retry

QA

POST /qa/smoke-test：公開前スモーク（外部ランナー想定）

GET /qa/smoke-test/{job_id}：結果取得

POST /runs/{run_id}/submit-review：承認依頼

承認

POST /approvals：submitted作成（target_hash必須）

POST /approvals/{approval_id}/approve

POST /approvals/{approval_id}/reject

公開

POST /runs/{run_id}/publish：公開（URL/UTM発行＋スナップショット保存）

POST /runs/{run_id}/rollback：ロールバック

GET /runs/{run_id}/deployment

Manual Mode（審査前でも必須）

POST /manual/ad-bundles/register：手動で作った広告の紐付け登録（UTM/命名）

POST /manual/metrics/import：CSVアップロード→insightsに反映（source=manual）

GET /runs/{run_id}/metrics：自前events＋insightsを統合表示

Meta連携（Hybrid/Auto）

POST /meta/connect/start

POST /meta/connect/callback

GET /meta/connections

POST /runs/{run_id}/launch：Auto配信開始（Manualならチェックリスト完了扱い）

POST /runs/{run_id}/pause

POST /runs/{run_id}/stop（理由必須）

停止条件（内部）

POST /internal/stop-rules/evaluate（Cron/Queue起点）

POST /internal/insights/sync（Hybrid/Auto）

POST /internal/report/generate

判定・レポート・次Run

POST /runs/{run_id}/decide：Decision確定（confidence必須）

GET /runs/{run_id}/report

POST /runs/{run_id}/next-run：fixed/exploreに基づき次Run生成