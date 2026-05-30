---
description: 直近 N 日のコード変更を解析し、CTO 向けの「設計意思決定キャッチアップ」 Markdown レポートを生成する
argument-hint: [--days <n>] [--output <path>]
allowed-tools: Bash, Read, Write, Grep, Glob
---

# /nest-recap

あなたはエンジニアリング組織のテクニカルアナリストです。
直近 N 日のコード変更を分析し、CTO が **設計上の意思決定をキャッチアップ**するための Markdown レポートを作成してください。
良し悪しの評価は不要です。「**何がどう決まったか**」を正確に記述することに集中してください。

レポートは Nest.js / TypeORM ベースの Nest.js プロジェクトを想定したフォーマットで出力します（Entity / DTO / Module / Controller / Service / Repository / Guard / Pipe / Filter / Interceptor / Middleware を識別）。

---

## 引数

`$ARGUMENTS` から以下のオプションを取り出してください。

- `--days <n>`: 解析対象期間（日数）。デフォルト `7`
- `--output <path>`: 出力する Markdown ファイルのパス。デフォルト `reports/weekly-nest-recap-YYYYMMDD.md`（`YYYYMMDD` は今日の日付）

引数がない場合は上記デフォルトを使用してください。

---

## Step 1: データ収集

すべて Bash ツール経由で実行してください。リポジトリのカレントディレクトリで動作します。

### 1-1. 期間と起点コミットの確定

```bash
DAYS=<引数で受け取った日数>
SINCE_DATE=$(date -u -v-${DAYS}d +%Y-%m-%d 2>/dev/null || date -u -d "${DAYS} days ago" +%Y-%m-%d)
# 起点コミット（since 時点で HEAD だった最新コミット）
SINCE_COMMIT=$(git log -1 --before="${SINCE_DATE}T00:00:00Z" --pretty=format:%H || git rev-list --max-parents=0 HEAD | head -1)
```

`SINCE_DATE` と `SINCE_COMMIT` を保存し、以降のステップで使い回します。

### 1-2. コミット一覧の取得

```bash
git log --since="${SINCE_DATE}" --pretty=format:'%h%x09%s%x09%an%x09%ad' --date=iso
```

タブ区切りで `hash / message / author / date` を得ます。総コミット数を `wc -l` でカウントしてください。

### 1-3. マージ済み PR の取得

`gh` CLI が使えることが前提です（CI には GH_TOKEN を渡しておくこと）。

```bash
gh pr list \
  --state merged \
  --search "merged:>=${SINCE_DATE}" \
  --limit 100 \
  --json number,title,url,mergedAt,createdAt,body,files
```

各 PR の `files` には `path / additions / deletions` が含まれます。

### 1-4. 変更ファイル一覧の取得

```bash
git diff --name-status "${SINCE_COMMIT}..HEAD"
```

ステータスは `A`/`M`/`D`/`R<score>` などです。`R` は rename — `from\tto` の形式で 2 列出ます。

### 1-5. ファイル分類

ファイル名のサフィックスで分類してください（拡張子 `.ts` のもののみ対象、それ以外は `other`）。

| サフィックス | 種別 |
|--------------|------|
| `*.entity.ts` | entity |
| `*.dto.ts` | dto |
| `*.module.ts` | module |
| `*.controller.ts` | controller |
| `*.service.ts` | service |
| `*.repository.ts` | repository |
| `*.middleware.ts` | middleware |
| `*.guard.ts` | guard |
| `*.interceptor.ts` | interceptor |
| `*.pipe.ts` | pipe |
| `*.filter.ts` | filter |
| 上記以外 | other |

---

## Step 2: エンティティ / DTO の差分抽出

### 2-1. Entity ファイルの差分抽出（**ts-morph 相当の構造化抽出**）

変更された `*.entity.ts` ファイルそれぞれについて、**変更前**と**変更後**の両方を取得し、以下の粒度で比較してください。

#### 旧版・新版の取得

```bash
# 変更後（現行ファイル） — Read ツールで読む
# 変更前
git show "${SINCE_COMMIT}:<path>"  # ファイルが存在しなかった場合は空
```

リネーム（`R`）の場合は変更前パスを `git show` の対象にしてください。

#### 抽出するデコレータと属性

- **クラス検出**: `@Entity` デコレータを持つクラスのみが Entity の対象。
- **カラム**: 以下のいずれかのデコレータが付いたプロパティ
  - `@Column`, `@PrimaryColumn`, `@PrimaryGeneratedColumn`, `@CreateDateColumn`, `@UpdateDateColumn`, `@DeleteDateColumn`
  - 抽出: プロパティ名 / 型 / `nullable` の真偽
    - `nullable` は ① `?` 記号、② 型に `| null` が含まれる、③ デコレータ第1引数の `{ nullable: true }` のいずれかで判定
- **リレーション**: 以下のいずれかのデコレータが付いたプロパティ
  - `@ManyToOne`, `@OneToMany`, `@OneToOne`, `@ManyToMany`
  - 抽出: プロパティ名 / `relationType`（左記4つのいずれか）/ `targetEntity`（`() => User` または `User` から導出。配列なら `[]` を剥がす、`Promise<T>` なら `T` を取り出す）
- **インデックス**: クラスレベル `@Index(...)` デコレータ
  - 第1引数: カラム名の配列または文字列 → `columns: string[]`
  - 第2引数（オプション）: `{ unique?: boolean, name?: string }`
- **外部キー**: `@ManyToOne` または `@OneToOne` が付いたプロパティ（`@OneToMany` / `@ManyToMany` は対象外）
  - デコレータ第2引数 `{ onDelete?: string, onUpdate?: string }` を抽出

抽出はファイル全体を `Read` で読んだうえで、目視 + grep でデコレータと引数を読み取って構造化してください。`ts-morph` のような完璧な AST ではないため、迷ったら `Read` で再確認します。

#### 型文字列の正規化

- `import("path").TypeName` → `TypeName`
- リテラル型 `"active"` → `string`, `123` → `number`
- ユニオン型はパーツをアルファベット順にソート

#### 変更タイプ判定

- 旧版 null & 新版あり → `added`
- 旧版あり & 新版 null → `deleted`
- どちらもあり & rename → `moved`
- どちらもあり & 内容差分 → `modified`

#### 内部表現

各 entity について以下の形で内部メモを作ってから次のステップに進むと正確になります（ファイルには出さなくて良い、思考用）。

```
file: <path>
className: <name>
changeType: added | deleted | modified | moved
columns:
  added:   [{name, type, nullable}]
  removed: [{name, type, nullable}]
  changed: [{name, before, after}]
relations:
  added:   [{name, relationType, targetEntity}]
  removed: [{name, ...}]
indexes:
  added:   [{columns, unique, name}]
  removed: [{...}]
foreignKeys:
  added:   [{relationName, relationType, targetEntity, onDelete, onUpdate}]
  removed: [{...}]
  constraintChanged: [{relationName, onDelete: before→after, onUpdate: before→after}]
relatedPRs: [PR の番号 / URL]
```

### 2-2. DTO ファイルの扱い

DTO（`*.dto.ts`）は**コンテキスト理解用**として読んでも構いませんが、**最終レポートには DTO 由来の情報を一切含めないでください**。これは現行の `filterOutDTOFiles` ルールと同じ意図です。

---

## Step 3: 設計的に意味のある変更の抽出

「設計上の意思決定を含む変更」と判断する基準（カテゴリ）:

- `db-schema` — Entity の追加・削除・カラム/リレーション/インデックス/FK 変更
- `api-endpoint` — Controller のルート追加・変更
- `domain-model` — Service / ドメイン層の責務移動
- `state-management` — 状態管理・データフロー・キャッシュ・ジョブキュー
- `external-integration` — 外部サービス連携（決済・通知・ストレージなど）
- `refactoring` — 設計を変えるリファクタリング（命名変更だけのものは除外）
- `other` — 上記に当てはまらない設計判断

純粋な lint / フォーマット / 依存パッケージのバージョン上げ / ファイル名変更だけ / テストのみの変更は対象外として除外してください。

---

## Step 4: レポート出力

以下のフォーマットで Markdown を組み立て、`Write` ツールで `--output` パスへ書き出してください。

### 文体ガイド（全セクション共通）

- 各 bullet は 1 文・40〜80 字程度を目安とし、長文化を避ける
- 冗長な定型句（「〜になった」「〜を前提としている」など）の機械的な反復を避け、語尾にバリエーションを持たせる（体言止め可）
- 同じ事実を別のセクションで重複させない（最も適切な 1 箇所のみに記載する）
- 実装の細部（新規メソッド名・依存パッケージの追加・環境変数名・ファイル名など）は、それ自体が設計判断でない限り省略する
- 主要セクションで既に登場した固有名詞（クラス名・enum 名・env 名など）を別セクションで再掲しない

### 主要セクション構成

Entity に関する変更 (`added` / `modified` / `deleted` / `moved` のいずれか) が**存在する場合**は 3 セクション + 補足、**存在しない場合**は 2 セクション + 補足とします。

1. **責務・境界の変化**: モジュール・サービス・レイヤー間の割り当ての変化（最優先）
2. **この設計が前提としていること**: 暗黙の仮定・現時点での制限・将来変わりうる前提
3. **データ構造の変化**（Entity の変更がある場合のみ）: Entity のスキーマ変更を扱う。**新規テーブル (`added`) はテキスト 1 文で**、既存テーブルの変更 (`modified` / `deleted` / `moved`) は**カラム / インデックス / FK を表で**記載する。**DTO は含めない**
4. **その他補足**: 上記で言及していない事項（バリデーション・新概念・Nest.js ベストプラクティス違反など）

---

### Markdown 出力テンプレート

```markdown
# 週次設計意思決定キャッチアップ
**対象期間:** {SINCE_DATE} 〜 {今日の日付}
**生成日時:** {今日の日付}
**対象PR/Commit数:** {PR数 + Commit数}件 → {ドメイン数} ドメインの変更に整理

---

## 今週の概観

（どのドメインで何が決まったかを 3〜5 文で概述。評価せず事実として記述する）

---

## ドメイン別 意思決定サマリー

### [ドメイン名]
**関連PR:** [#番号](url) , [#番号](url)   （※ 参照PRが1〜2件のドメインのみこの行を出力。3件以上なら省略して各 bullet に付与する）

#### 責務・境界の変化
- （どの処理がどこからどこへ移ったか、または新たにどこに置かれたか）   *← [#PR番号](url)*   （※ 参照PRが3件以上のドメインのみ各 bullet 末尾に付与）
- ...

#### この設計が前提としていること
- （暗黙の仮定・現時点での制限・将来変わりうる前提を読み取れる範囲で記述）
- 例: 「S3 バケット名は環境変数で指定（環境ごとに設定要）」
- 例: 「ファイル種別判定はファイル名ベース → 命名規則の遵守が必須」
- 例: 「`hasCost` フィルタは cost / costWithMargin のいずれかが設定済みのときのみ true」

#### データ構造の変化
（↑ このセクションは、当該ドメインに **Entity の変更 (`added` / `modified` / `deleted` / `moved`) が存在する場合のみ** 出力。該当変更がなければセクションヘッダごと省略し、「変更なし」等のプレースホルダ記載は禁止）

**新規テーブル (`added`)**: テキストの箇条書きで記載する（表は使わない）。
- `XxxEntity` テーブル追加 — 1 文で目的を補足（例: 「`PaymentLog` テーブル追加 — 決済履歴を永続化」）

**既存テーブルの変更 (`modified` / `deleted` / `moved`)**: 以下の表で記載する。

| 対象 | 変更前 | 変更後 |
|------|--------|--------|
| テーブル名.カラム名 | 旧定義 | 新定義 |
| インデックス: (カラム名) | - | [UNIQUE/複合/通常] (カラムリスト) [インデックス名] |
| 外部キー: relationName | - | targetEntity [N→1/1→N等] (ON DELETE 制約, ON UPDATE 制約) |

#### その他補足
- （上記セクションで言及していない決定事項・用語・ベストプラクティス違反を箇条書き）
- （カテゴリ見出しは使用せず、統一された箇条書きとする）

---

（以降、ドメインごとに繰り返し）

---

## 把握できなかった意図

**注意: 把握できなかった意図が特にない場合は、このセクション自体を出力しない**

PR 説明不足などで意思決定の背景が読み取れなかった変更を以下に列挙します。担当者への確認を推奨します。

| PR/Commit | 変更内容 | 不明な点 |
|-----------|----------|----------|
| #番号 | 概要 | 何が読み取れなかったか |
```

---

### 「データ構造の変化」セクションの記載方法（重要）

- **per-domain ルール**: 「データ構造の変化」セクションは、当該ドメインに **Entity の変更 (`added` / `modified` / `deleted` / `moved`)** が**存在する場合のみ**出力。該当変更がないドメインではセクションヘッダ（`#### データ構造の変化`）ごと省略。「変更なし」「Entity 変更なし」「（このドメインでは Entity 変更なし）」等のプレースホルダ記載は**禁止**。
- **DTO 除外**: DTO（`*.dto.ts`）に関する変更は一切含めない。
- **新規テーブル (`added`)**: **表ではなくテキストの箇条書き**で記載。1 行 1 テーブルで「`XxxEntity` テーブル追加 — 目的を 1 文」程度。カラム・インデックス・外部キーの詳細は**列挙しない**（情報密度を高く保つため）。
  - 例: `- PaymentLog テーブル追加 — 決済履歴を永続化し、後段の集計バッチに渡す`
  - 例: `- AuditEvent テーブル追加 — 管理画面操作の追跡用`
- **既存テーブルの変更 (`modified` / `deleted` / `moved`)**: 以下の表でカラム / インデックス / 外部キーをそれぞれ行で記載。
  - カラム: `| カラム名 | 旧型 | 新型 |`
  - インデックス: `| インデックス: (カラム名) | - | [UNIQUE/複合/通常] (カラムリスト) [インデックス名] |`
    - 例: `| インデックス: (email) | - | [UNIQUE] (email) [idx_email_unique] |`
    - 例: `| インデックス: (userId, createdAt) | - | [複合] (userId, createdAt) |`
  - 外部キー: `| 外部キー: relationName | - | targetEntity [N→1/1→N等] (ON DELETE 制約, ON UPDATE 制約) |`
    - 例: `| 外部キー: department | - | Department [N→1] (ON DELETE CASCADE) |`
    - 例: `| 外部キー制約変更: manager | ON DELETE RESTRICT | ON DELETE CASCADE |`
- **必ず記載**: 既存テーブルに対するインデックスと外部キー制約の追加 / 削除 / 変更はすべて明記。
- **新規テーブル + 既存変更が混在する場合**: まずテキスト箇条書きで新規テーブルを列挙、次に表で既存変更を記載する（順序: 箇条書き → 表）。
- relationType の表記: `ManyToOne` = `N→1`, `OneToMany` = `1→N`, `OneToOne` = `1↔1`, `ManyToMany` = `N↔M`

---

### 「その他補足」セクションの記載方法

「その他補足」セクションは、主要セクション（責務・境界 / 前提 / データ構造）で**既に言及された情報を含めない**でください。

#### 記載内容（**カテゴリ見出しなし**で統一された箇条書き、1 ドメインあたり最大 4 項目を目安）

1. 上記セクションで言及していない、新たに確定したバリデーション・制約・ロジック
2. 上記セクションで言及していない、新規に登場したドメイン用語・状態名・クラス名
3. **Nest.js ベストプラクティス違反**（発見した場合は必ず記載）
   - Service に直接 HTTP 通信が含まれる（HttpModule を使うべき）
   - Controller にビジネスロジックが含まれる（Service に移すべき）
   - Entity に計算ロジックが含まれる（ドメインサービスまたは ValueObject に移すべき）
   - DTO と Entity を直接変換している（mapper または専用の変換関数を使うべき）
   - ValidationPipe を使わず手動でバリデーションしている
   - Guard ではなくミドルウェアで認証処理をしている
   - 循環依存（Circular Dependency）が発生している
   - その他、Nest.js の推奨パターンから逸脱している実装

#### 除外条件（「その他補足」に記載してはいけないもの）

以下は実装の詳細であり、それ自体が設計判断でない限り**記載しない**:

- 単なる新規メソッド・関数の追加（例: 「Service に X メソッドが追加された」）
- 依存パッケージの追加・バージョン変更（例: 「multer 2.1.1 が追加された」）
- 環境変数の追加（主要セクションで既に言及されている場合は再掲しない）
- ファイル名・ディレクトリ名の追加・移動・削除
- 主要セクションで既に言及した固有名詞（クラス名・env 名・enum 名・migration 名など）の再掲

#### 出力例

```markdown
#### その他補足
- メール送信は非同期ジョブで実行される
- `RefreshToken`: JWT 更新用のトークン（30 日有効）
- UserService 内で HTTP クライアント（axios）を直接使用している → HttpModule のインジェクションを推奨
```

---

### PR リンク記載ルール

- ドメイン内で参照する PR が **1〜2 件** の場合: ドメイン見出し直下に `**関連PR:** [#番号](url)[, [#番号](url)]` の形式で 1 行に集約し、各 bullet からは省略する
- ドメイン内で参照する PR が **3 件以上** の場合のみ: 各 bullet 末尾に `*← [#番号](url)*` を付与する
- 同じ PR リンクを同一ドメイン内で 5 回以上反復しない

---

## Step 5: 書き出しと完了報告

1. `mkdir -p $(dirname <output_path>)` で出力ディレクトリを作成
2. `Write` ツールで Markdown を `<output_path>` に保存
3. **Step 5.5 の機械検証を必ず実行**
4. 標準出力に `Report written to: <output_path>` の 1 行を出力して終了

---

## Step 5.5: 出力検証（必須・違反したら修正して再書き出し）

書き出した Markdown を Bash + grep で機械チェックします。**1 つでも該当したら違反**として原因を修正し、再度 `Write` で上書きしてから本ステップを再実行してください（パスしたら次へ進む）。

### 検証 A: 新規テーブル (`added`) ブロックに表が混入していないか

`#### データ構造の変化` セクション内に「新規テーブル」ブロックがある場合、そのブロック内に表記号 `|` を含む行があれば違反です（新規テーブルは**テキスト箇条書き 1 文**のみで、表は使わない）。

```bash
# データ構造の変化セクションを抽出し、新規テーブル ブロックに | が含まれる行があるかチェック
awk '
  /^#### データ構造の変化/ { in_section=1; in_added=0; next }
  /^#### / && in_section { in_section=0 }
  in_section && /新規テーブル|テーブル追加/ { in_added=1 }
  in_section && /^\| / { in_added=0 }            # 表ヘッダで added ブロックは終了
  in_section && in_added && /\|/ { print FILENAME ":" NR ": " $0 }
' <output_path>
```

→ 何か出力されたら違反。該当箇所を `- XxxEntity テーブル追加 — 目的を 1 文` の形式に書き直す。

### 検証 B: プレースホルダ文言が残っていないか

「変更なし」「Entity 変更なし」「該当なし」「（このドメインでは Entity 変更なし）」等のプレースホルダ記載は禁止です。該当する場合はセクションヘッダごと省略してください。

```bash
grep -n -E '変更なし|該当なし|Entity 変更なし|変更はありません' <output_path>
```

→ 何か出力されたら違反。該当セクションヘッダごと削除する。

### 検証 C: DTO 由来の記述が「データ構造の変化」セクションに混入していないか

```bash
awk '
  /^#### データ構造の変化/ { in_section=1; next }
  /^#### / && in_section { in_section=0 }
  in_section && /\.dto\.ts|DTO|Dto/ { print FILENAME ":" NR ": " $0 }
' <output_path>
```

→ 何か出力されたら違反。DTO 関連の行を削除する。

### 検証 D: 必須セクションの存在

- `# 週次設計意思決定キャッチアップ` で始まるタイトル行があるか
- `## ドメイン別 意思決定サマリー` のセクションがあるか

```bash
grep -c -E '^# 週次設計意思決定キャッチアップ' <output_path>   # 1 であること
grep -c -E '^## ドメイン別 意思決定サマリー' <output_path>     # 1 であること
```

→ 0 件 / 2 件以上なら違反。テンプレートに沿って構成を直す。

### 全検証通過後

4 つの検証コマンドすべてが「該当なし（出力なし or 必須セクション数 1）」になったら Step 5 の最終ステップ (`Report written to: ...` の出力) へ進みます。

---

## 補助コマンド集（参考）

```bash
# 直近 N 日の変更ファイル一覧
git diff --name-only "${SINCE_COMMIT}..HEAD"

# 旧版ファイルの取得（存在しないファイルは exit 128）
git show "${SINCE_COMMIT}:path/to/file.entity.ts" 2>/dev/null

# 特定ファイルの PR 紐付け
gh pr list --state merged --search "merged:>=${SINCE_DATE} <path>" --json number,title,url
```
