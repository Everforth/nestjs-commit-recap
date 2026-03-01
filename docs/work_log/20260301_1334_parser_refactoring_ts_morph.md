# パーサーリファクタリング: ts-morph 導入

## 作業日時
2026-03-01 13:34

## 概要
正規表現ベースのパーサーを ts-morph を使った AST ベースのパーサーにリファクタリング。
これにより、複数行デコレータ引数、ネストした構造、複雑なTypeScript構文を正確に解析できるようになった。

## 変更内容

### 1. ts-morph インストール
- `package.json` に ts-morph を追加

### 2. BaseAnalyzer に AST ユーティリティ追加
**ファイル:** `src/analyzers/base-analyzer.ts`

追加したメソッド:
- `parseContent(content, fileName)` - 文字列から AST SourceFile を生成
- `findClassWithDecorator(sourceFile, decoratorName)` - 特定デコレータを持つクラスを検索
- `findAllClassesWithDecorator(sourceFile, decoratorName)` - 同上（複数）
- `getDecorator(node, decoratorName)` - ノードからデコレータを取得
- `getDecoratorStringArgument(decorator)` - デコレータの文字列引数を抽出
- `getDecoratorObjectArgument(decorator)` - デコレータのオブジェクト引数を抽出
- `classImplements(cls, interfaceName)` - クラスが特定インターフェースを実装しているか確認

### 3. 各アナライザーのリファクタリング

#### provider-analyzer.ts
- `@Injectable` デコレータの検出を AST ベースに変更
- クラス名の抽出を AST ベースに変更

#### middleware-analyzer.ts
- `implements NestMiddleware` などの検出を AST ベースに変更
- `classImplements()` メソッドを使用

#### controller-analyzer.ts
- `@Controller` デコレータの検出を AST ベースに変更
- `extractBasePath()` を AST ベースに変更（オブジェクト形式 `{ path: 'xxx' }` も対応）
- `extractEndpoints()` を AST ベースに変更（`cls.getMethods()` + デコレータ走査）

#### module-analyzer.ts
- `@Module` デコレータの検出を AST ベースに変更
- `extractModuleConfig()` を AST ベースに変更
- 複数行配列、ネスト呼び出し（`TypeOrmModule.forFeature([...])`）も正確にパース

#### entity-analyzer.ts
- `@Entity` デコレータの検出を AST ベースに変更
- `extractColumns()` を AST ベースに変更
- **新機能:** リレーション検出 (`@ManyToOne`, `@OneToMany`, `@OneToOne`, `@ManyToMany`)

### 4. 型定義の更新
**ファイル:** `src/types/index.ts`

追加した型:
```typescript
export interface EntityRelation {
  name: string;
  relationType: 'ManyToOne' | 'OneToMany' | 'OneToOne' | 'ManyToMany';
  targetEntity: string;
}
```

`EntityChange` に `relations` フィールドを追加。

### 5. Markdown Reporter の改善
**ファイル:** `src/reporters/markdown-reporter.ts`

- Entity サマリーで変更がない場合は非表示
- リレーション変更の表示を追加
- Entity 詳細セクションに Relations テーブルを追加

## 解決した問題

1. **Entity**: 複数行デコレータ引数の誤検出が解消
2. **Entity**: 型の正確な抽出（`| null` の処理など）
3. **Controller**: デコレータ名がメソッド名として誤検出される問題が解消
4. **Module**: 複数行配列・ネスト呼び出しの不完全なパースが解消
5. **Entity**: リレーション変更の検出・表示を追加

## 変更ファイル一覧

| ファイル | 変更概要 |
|---------|---------|
| `package.json` | ts-morph 依存追加 |
| `src/analyzers/base-analyzer.ts` | AST ユーティリティメソッド追加 |
| `src/analyzers/provider-analyzer.ts` | AST ベースにリファクタリング |
| `src/analyzers/middleware-analyzer.ts` | AST ベースにリファクタリング |
| `src/analyzers/controller-analyzer.ts` | AST ベースにリファクタリング |
| `src/analyzers/module-analyzer.ts` | AST ベースにリファクタリング |
| `src/analyzers/entity-analyzer.ts` | AST ベースにリファクタリング + リレーション検出 |
| `src/types/index.ts` | EntityRelation 型追加 |
| `src/reporters/markdown-reporter.ts` | 出力改善（リレーション表示、変更なし非表示） |

## 検証

```bash
npm run build    # ビルド成功
npm run typecheck  # 型チェック成功
```

## 互換性

既存の出力インターフェースは維持:
- `EntityColumn[]`
- `EndpointInfo[]`
- `ModuleConfig`
- `ProviderInfo`
- `MiddlewareInfo`

`EntityChange` に `relations` フィールドを追加（オプショナル）。
