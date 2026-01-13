# CLAUDE.md

## プロジェクト概要

- **名前**: launch-test-system
- **説明**: Miyabi自律型開発フレームワークで構築されたプロジェクト
- **技術スタック**: TypeScript, Node.js, Vitest

## 開発ルール

### コード規約
- TypeScript strict modeを使用
- ESLint + Prettierでフォーマット
- テストはVitestを使用

### Git規約
- Conventional Commits準拠
- PRはDraft作成 → レビュー → マージ
- mainブランチへの直接コミット禁止

### AI Agent連携
- 53ラベル体系でIssue管理
- GitHub Projects V2でカンバン管理
- 7種類のAgentが自律的に動作

## コマンド

```bash
npm run dev       # 開発サーバー
npm test          # テスト実行
npm run build     # ビルド
npm run lint      # Lint実行
npm run typecheck # 型チェック
```

## 重要な設計判断

（ここに重要な設計判断を記録）

## 注意事項

（ここにプロジェクト固有の注意事項を記録）
