# Launch Test System

A/Bテスト・広告効果検証プラットフォーム - Cloudflare Workers + Hono + React

## 概要

Launch Test Systemは、広告・LPの効果検証を自動化するプラットフォームです。

主な機能:
- **マルチテナント対応**: 組織ごとに独立した環境
- **Run（テスト実行）管理**: 複数のIntent（訴求）を比較するA/Bテスト
- **Variant管理**: LP・クリエイティブ・広告コピーのバリエーション管理
- **統計判定**: ベイズ推定による勝者判定
- **イベント計測**: クリック・CV計測とリアルタイム集計

## 技術スタック

### Backend
- **Runtime**: Cloudflare Workers
- **Framework**: Hono v4
- **Database**: D1 (SQLite)
- **Storage**: R2
- **Queue**: Cloudflare Queues

### Frontend
- **Framework**: React 19 + Vite 7
- **Styling**: Tailwind CSS v4
- **State**: TanStack Query
- **Routing**: React Router

## セットアップ

```bash
# 依存関係インストール
npm install

# 開発サーバー起動（バックエンド）
npm run dev

# フロントエンド開発サーバー
cd frontend && npm run dev

# TypeScriptビルド確認
npm run typecheck

# テスト実行
npm test
```

## 環境変数

`.env.example` を `.env` にコピーして設定:

```bash
cp .env.example .env
```

必須:
- `ANTHROPIC_API_KEY`: Anthropic APIキー（AI機能用）

## プロジェクト構造

```
launch-test-system/
├── src/                    # バックエンドソースコード
│   ├── routes/             # APIルート定義
│   ├── services/           # ビジネスロジック
│   ├── repositories/       # データアクセス層
│   ├── middleware/         # 認証・RBAC
│   ├── types/              # TypeScript型定義
│   └── worker.ts           # Workerエントリーポイント
├── frontend/               # フロントエンドソースコード
│   ├── src/
│   │   ├── pages/          # ページコンポーネント
│   │   ├── components/     # UIコンポーネント
│   │   ├── api/            # API呼び出し
│   │   └── types/          # フロントエンド型定義
│   └── index.html
├── migrations/             # D1マイグレーション
├── tests/                  # テストファイル
├── .github/                # GitHub Actions
└── wrangler.toml           # Cloudflare設定
```

## API エンドポイント

### 認証・テナント
- `GET /api/me` - 現在のユーザー取得
- `GET /api/tenant` - テナント情報取得
- `PATCH /api/tenant` - テナント更新

### プロジェクト管理
- `GET /api/projects` - プロジェクト一覧
- `POST /api/projects` - プロジェクト作成
- `GET /api/projects/:id` - プロジェクト詳細
- `PATCH /api/projects/:id` - プロジェクト更新

### Run（テスト実行）
- `GET /api/runs` - Run一覧
- `POST /api/runs` - Run作成
- `GET /api/runs/:id` - Run詳細
- `PATCH /api/runs/:id` - Run更新
- `POST /api/runs/:id/design` - テスト設計設定
- `POST /api/runs/:id/stop-dsl` - 停止条件設定
- `POST /api/runs/:id/launch` - Run開始
- `POST /api/runs/:id/pause` - Run一時停止
- `POST /api/runs/:id/stop` - Run停止

### Intent（訴求）
- `GET /api/runs/:runId/intents` - Intent一覧
- `POST /api/runs/:runId/intents` - Intent作成
- `PATCH /api/intents/:id` - Intent更新
- `GET /api/intents/:id/metrics` - メトリクス取得

### Variant
- `GET /api/intents/:intentId/lp-variants` - LP Variant一覧
- `POST /api/intents/:intentId/lp-variants` - LP Variant作成
- `GET /api/intents/:intentId/creative-variants` - Creative一覧
- `POST /api/intents/:intentId/creative-variants` - Creative作成
- `GET /api/intents/:intentId/ad-copies` - 広告コピー一覧
- `POST /api/intents/:intentId/ad-copies` - 広告コピー作成
- `PATCH /api/ad-copies/:id` - 広告コピー更新

### 判定・レポート
- `POST /api/runs/:id/decide` - 統計判定実行
- `GET /api/runs/:id/report` - レポート取得

### イベント計測
- `POST /e` - 単一イベント送信
- `POST /e/batch` - バッチイベント送信

## 開発コマンド

```bash
# TypeScript型チェック
npm run typecheck

# テスト実行
npm test

# Wrangler開発サーバー
npm run dev

# デプロイ
npm run deploy
```

## Miyabi コマンド

```bash
# ステータス確認
npx miyabi status

# 自動Issue処理
npx miyabi auto --max-issues 5

# テスト実行
npx miyabi test

# デプロイ
npx miyabi deploy
```

## ライセンス

All Rights Reserved
