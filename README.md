# launch-test-system

Miyabi自律型開発フレームワークで構築されたプロジェクト

## セットアップ

```bash
# 依存関係をインストール
npm install

# 開発サーバー起動
npm run dev

# テスト実行
npm test

# ビルド
npm run build
```

## 環境変数

`.env.example` を `.env` にコピーして設定してください:

```bash
cp .env.example .env
```

必須の環境変数:
- `ANTHROPIC_API_KEY`: Anthropic APIキー

## プロジェクト構造

```
launch-test-system/
├── .github/            # GitHub Actions & テンプレート
├── .ai/                # AI実行ログ
├── .claude/            # Claude Code設定
├── src/                # ソースコード
├── tests/              # テストファイル
└── dist/               # ビルド出力
```

## Miyabi コマンド

```bash
# ステータス確認
npx miyabi status

# 自動モード起動
npx miyabi auto --max-issues 5

# テスト実行
npx miyabi test

# デプロイ
npx miyabi deploy
```

## ライセンス

All Rights Reserved
