# パーサーリファクタリング TODO

## 概要

現在の正規表現ベースのパーサーは脆弱で、多くのエッジケースを処理できない。
`ts-morph` を使用してTypeScript ASTベースのパーサーに置き換える。

## 現状の問題点

### Entity パーサー (`entity-analyzer.ts`)

1. **複数行デコレータ引数の誤検出**
   - `@Column({ type: 'varchar', ... })` のような複数行デコレータで、引数内のプロパティ（`type:`, `name:` など）をEntityカラムとして誤検出する
   - `@JoinTable` 内の `joinColumn: {` などが誤検出される

2. **プロパティ探索範囲の制限**
   - デコレータからプロパティ定義までの距離が長い場合（25行以上）、見つけられない
   - `@ManyToMany` + `@JoinTable` のような長いデコレータチェーンで発生

3. **型の正確な抽出ができない**
   - `number | null` などの Union 型が正しく解析できない場合がある
   - ジェネリクス（`Promise<T>` など）の解析が不完全

### Controller パーサー (`controller-analyzer.ts`)

1. **複数行 `@Controller` デコレータ**
   - 対応済みだが、より複雑なケースで失敗する可能性

2. **デコレータ名の誤検出**
   - `ApiQuery`, `HttpCode` などのデコレータがメソッド名として誤検出される場合がある
   - 除外リストで対応しているが、網羅的ではない

### Module パーサー (`module-analyzer.ts`)

1. **配列プロパティの抽出が不完全**
   - `imports`, `providers` などの配列が複数行にわたる場合、正確に抽出できない
   - `TypeOrmModule.forFeature([...])` のようなネストした呼び出しの解析が不完全

## 解決策: ts-morph の導入

### インストール

```bash
npm install ts-morph
```

### 実装方針

1. **Project の作成**
   ```typescript
   import { Project } from 'ts-morph';
   const project = new Project();
   const sourceFile = project.createSourceFile('temp.ts', content);
   ```

2. **クラスの取得**
   ```typescript
   const classes = sourceFile.getClasses();
   for (const cls of classes) {
     const decorators = cls.getDecorators();
     // @Entity, @Controller, @Module などを判定
   }
   ```

3. **プロパティの取得**
   ```typescript
   const properties = cls.getProperties();
   for (const prop of properties) {
     const name = prop.getName();
     const type = prop.getType().getText();
     const decorators = prop.getDecorators();
   }
   ```

4. **メソッドの取得（Controller用）**
   ```typescript
   const methods = cls.getMethods();
   for (const method of methods) {
     const decorators = method.getDecorators();
     // @Get, @Post などを判定
   }
   ```

### 変更対象ファイル

- `src/analyzers/entity-analyzer.ts`
- `src/analyzers/controller-analyzer.ts`
- `src/analyzers/module-analyzer.ts`
- `src/analyzers/provider-analyzer.ts`
- `src/analyzers/middleware-analyzer.ts`

### 期待される効果

- デコレータとプロパティの関係を正確に把握できる
- 型情報を正確に抽出できる
- エッジケースの処理が不要になる
- コードの可読性・保守性が向上

## その他の TODO

### 出力の改善

- [ ] Entity 詳細でカラムの変化がない場合、サマリーにも出さない（現在は `~` で出ている）
- [ ] リレーション（ManyToOne, OneToMany など）の変化も検出・表示

### 機能追加

- [ ] DTO クラスの変更検出
- [ ] Enum の変更検出
- [ ] Interface の変更検出

## 優先度

1. **高**: ts-morph 導入（根本的な解決）
2. **中**: Entity 詳細の出力改善
3. **低**: 追加機能（DTO, Enum, Interface）
