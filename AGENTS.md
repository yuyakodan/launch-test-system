# AGENTS.md

サブエージェント向けの共有コンテキスト

## プロジェクト情報

- **リポジトリ**: yuyakodan/launch-test-system
- **言語**: TypeScript
- **テスト**: Vitest

## Agent体系

### Coordinator Agent
- タスク統括・並行実行制御
- DAGベースの自律オーケストレーション

### CodeGen Agent
- Claude Sonnet 4によるコード生成
- TDD準拠の実装

### Review Agent
- コード品質判定
- 静的解析・セキュリティスキャン

### Issue Agent
- Issue分析・ラベル管理
- 53ラベル体系による自動分類

### PR Agent
- Pull Request自動作成
- Conventional Commits準拠

### Deployment Agent
- CI/CDデプロイ自動化
- ヘルスチェック・自動Rollback

### Test Agent
- ユニット・統合・E2Eテスト
- カバレッジレポート生成

## 共通ルール

1. 53ラベル体系を遵守
2. Conventional Commits形式でコミット
3. テストカバレッジ80%以上を目標
4. PRはDraft作成からスタート
