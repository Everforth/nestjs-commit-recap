# 機能追加 TODO

## 完了済み項目

- ✅ ts-morph 導入（全パーサーをASTベースに移行完了）
- ✅ Entity 詳細でカラムの変化がない場合、サマリーにも出さない
- ✅ リレーション（ManyToOne, OneToMany など）の変化も検出・表示
- ✅ DTO クラスの変更検出（class-validator デコレータベース）
- ✅ Enum の変更検出（内容ベース検出、複数Enum対応）

## 未実装機能

### Interface の変更検出

TypeScript Interfaceの変更を検出し、プロパティの追加・削除・型変更を表示する。

**実装内容:**
- `file-classifier.ts` に `interface` タイプを追加（または内容ベースで判定）
- `interface-analyzer.ts` を作成してInterfaceプロパティを解析
- `markdown-reporter.ts` でInterfaceセクションを追加

## 優先度

1. **中**: DTO クラスの変更検出（APIの入出力定義として重要）
2. **低**: Enum の変更検出
3. **低**: Interface の変更検出
