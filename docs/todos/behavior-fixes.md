# 挙動修正タスク

## 検証方法

```bash
node dist/index.js /path/to/nestjs-repo --no-pr
```

実際のNestJSリポジトリで実行し、出力を確認する。

---

## 1. ファイル移動の重複除外

### 問題
同じクラス名で `+`（追加）と `-`（削除）が並ぶ。ファイル移動やリネームの場合、実質変更がないのに両方表示される。

### 期待する挙動
同じクラス名で追加と削除が両方ある場合、ファイル移動として検出し、両方を除外する。

### 検証方法
```
### Entity
|   | 内容 |
|---|------|
| + | `SocialContent` |
| - | `SocialContent` |
```
↑ このような重複が出ないこと。

### ステータス
✅ 完了（`filterFileMoves` で実装）

---

## 2. Endpoint のフルパス表示

### 問題
Endpoint のパスが `/` や `/companies/my/campaigns` だけで表示され、`:publicId/social-accounts` などのサブパスが欠落する。

### 期待する挙動
`/companies/my/campaigns/:publicId/social-accounts` のようにフルパスで表示される。

### 検証方法
```
| + | POST | `/companies/my/campaigns/:publicId/social-accounts` |
```
↑ パスパラメータを含むフルパスが表示されること。

### ステータス
✅ 完了（`mergeEndpoints` で `:` を含むパスの分割を修正）

---

## 3. 削除のみの表を出さない

### 問題
ファイル削除やエンドポイント全削除の場合、詳細セクションに空の表や削除のみの表が出る。

### 期待する挙動
- サマリー: 削除項目も表示（変更の全体像を把握するため）
- 詳細: 削除のみの項目は表示しない（詳細を見ても意味がないため）

### 検証方法
詳細セクションで以下が出ないこと:
- 全カラムが `-` のEntity表
- 全エンドポイントが `-` のController表
- 全項目が `-` のModule表

### ステータス
✅ 完了（各 `generate*Details` メソッドでフィルタリング）

---

## 4. Entity 詳細のカラム変化表

### 問題
サマリーで Entity が `~`（modified）として表示されているのに、詳細セクションにカラム変化表が出ない。

### 原因
正規表現ベースのパーサーがカラムを正確に抽出できていない:
- 複数行デコレータ引数（`@Column({ type: 'varchar', ... })`）の誤検出
- `@JoinTable` 内の `joinColumn: {` などの誤検出
- デコレータからプロパティ定義までの距離が長い場合の検出漏れ

### 期待する挙動
```markdown
### campaign-social-account.entity.ts
|   | Column | 変更前 | 変更後 |
|---|--------|--------|--------|
| + | newColumn |  | string |
| - | oldColumn | number |  |
| ~ | status | string | StatusEnum |
```

カラムの追加・削除・型変更が正確に検出・表示される。

### 検証方法
1. Entity ファイルを変更（カラム追加など）してコミット
2. ツールを実行
3. 詳細セクションにカラム変化表が出ることを確認

### 解決策
`ts-morph` を導入してTypeScript ASTベースのパーサーに置き換える。
→ `docs/todos/parser-refactoring.md` 参照

### ステータス
✅ 完了

**修正内容**:
- `entity-analyzer.ts`: 型推論を使用するように `extractColumnFromProperty` を修正
- `entity-analyzer.ts`: `normalizeType()` ヘルパーを追加（import()ラッパー除去、リテラル型正規化、Union型ソート）
- `markdown-reporter.ts`: `getModifiedColumns()` ヘルパーを追加
- `markdown-reporter.ts`: サマリーのフィルタ条件と表示に型変更（`~`）を追加

---

## まとめ

| # | 問題 | ステータス |
|---|------|-----------|
| 1 | ファイル移動の重複除外 | ✅ 完了 |
| 2 | Endpoint のフルパス表示 | ✅ 完了 |
| 3 | 削除のみの表を出さない | ✅ 完了 |
| 4 | Entity 詳細のカラム変化表 | ✅ 完了 |

**全タスク完了**
