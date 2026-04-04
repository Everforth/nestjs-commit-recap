import type {
	EntityChange,
	EntityColumn,
	EntityForeignKey,
	EntityIndex,
	EntityRelation,
} from "../types/index.js";
import type { DesignDecisionData } from "./types.js";

export function buildDesignDecisionPrompt(data: DesignDecisionData): string {
	const { period, commits, prs, targetChanges } = data;

	// DTOファイルを除外するヘルパー関数
	const filterOutDTOFiles = <T extends { path: string }>(files: T[]): T[] => {
		return files.filter((f) => !f.path.toLowerCase().includes("dto"));
	};

	return `あなたはエンジニアリング組織のテクニカルアナリストです。
直近1週間のコード変更を分析し、CTOが設計上の意思決定をキャッチアップするためのレポートを作成してください。
良し悪しの評価は不要です。「何がどう決まったか」を正確に記述することに集中してください。

## 分析対象期間
**${period.startDate} 〜 ${period.endDate}**

## コミット情報
全コミット数: ${commits.length}件

${commits
	.slice(0, 20)
	.map((c) => `- ${c.hash.slice(0, 7)}: ${c.message} (${c.author}, ${c.date})`)
	.join("\n")}
${commits.length > 20 ? `\n... 他 ${commits.length - 20}件` : ""}

## PR情報
マージ済みPR数: ${prs.length}件

${prs
	.map((pr) => {
		const nonDtoFiles = filterOutDTOFiles(pr.files);
		return `### PR #${pr.number}: ${pr.title}
URL: ${pr.url}
マージ日: ${pr.mergedAt || pr.createdAt}

${pr.body || "(本文なし)"}

変更ファイル数: ${nonDtoFiles.length}
${nonDtoFiles
	.slice(0, 5)
	.map((f) => `  - ${f.path} (+${f.additions || 0}/-${f.deletions || 0})`)
	.join("\n")}
${nonDtoFiles.length > 5 ? `  ... 他 ${nonDtoFiles.length - 5}件` : ""}
`;
	})
	.join("\n---\n\n")}

## 対象変更の詳細（設計上の意思決定を含む変更）

対象変更数: ${targetChanges.length}件

${targetChanges
	.map((change, idx) => {
		// エンティティ変更データがあれば構造化データを使用
		const entityChange = data.entityChanges?.find((e) =>
			change.files.includes(e.file),
		);

		if (entityChange) {
			return `### 変更 ${idx + 1}
カテゴリ: ${getCategoryLabel(change.category)}
${change.prNumber ? `PR: #${change.prNumber}` : `Commit: ${change.commitHash.slice(0, 7)}`}

${formatEntityChange(entityChange)}
`;
		}

		// 構造化データがなければ従来の生diff
		return `### 変更 ${idx + 1}
カテゴリ: ${getCategoryLabel(change.category)}
${change.prNumber ? `PR: #${change.prNumber}` : `Commit: ${change.commitHash.slice(0, 7)}`}
ファイル: ${change.files.join(", ")}

差分:
\`\`\`
${change.diff.slice(0, 5000)}${change.diff.length > 5000 ? "\n... (差分が大きいため省略)" : ""}
\`\`\`
`;
	})
	.join("\n---\n\n")}

## 指示

上記の情報を元に、以下の手順で整理してください。

### Step 1: 変更をドメイン/コンテキストに分類
各変更をドメイン（例：決済、ユーザー認証、通知）に分類してください。

### Step 2: 4カテゴリに振り分け
同じドメインに属する変更を束ねて、以下の4カテゴリに振り分けてください:
- **確定したビジネスルール**: バリデーション・制約・ロジックとして実装された決定
- **データ構造の変化**: スキーマ・型・インターフェースの変更
- **責務・境界の変化**: モジュール・サービス・レイヤー間の割り当ての変化
- **新たな概念・用語**: 新たに登場したドメイン用語・状態名・クラス名とその意味

### Step 3: レポート出力

以下のフォーマットで Markdown レポートを出力してください。

---

# 週次設計意思決定キャッチアップ
**対象期間:** ${period.startDate} 〜 ${period.endDate}
**生成日時:** ${new Date().toISOString().split("T")[0]}
**対象PR/Commit数:** ${prs.length + commits.length}件 → N ドメインの変更に整理

---

## 今週の概観

（どのドメインで何が決まったかを3〜5文で概述。評価せず事実として記述する）

---

## ドメイン別 意思決定サマリー

### [ドメイン名]

#### 確定したビジネスルール
- （決定内容）　*← [#PR番号](url) など複数PRがあれば併記*
- ...

#### データ構造の変化
| 対象 | 変更前 | 変更後 |
|------|--------|--------|
| テーブル名.カラム名 など | 旧定義 | 新定義 |
| インデックス: (カラム名) | - | [UNIQUE/複合/通常] (カラムリスト) [インデックス名] |
| 外部キー: relationName | - | targetEntity [N→1/1→N等] (ON DELETE 制約, ON UPDATE 制約) |

#### 責務・境界の変化
- （どの処理がどこからどこへ移ったか、または新たにどこに置かれたか）
- ...

#### 新たな概念・用語
| 用語 | 意味・定義 |
|------|-----------|
| 用語名 | この変更における意味 |

#### この設計が前提としていること
- （暗黙の仮定・現時点での制限・将来変わりうる前提を読み取れる範囲で記述）

---

（以降、ドメインごとに繰り返し）

---

## 把握できなかった意図

PR説明不足などで意思決定の背景が読み取れなかった変更を以下に列挙します。担当者への確認を推奨します。

| PR/Commit | 変更内容 | 不明な点 |
|-----------|----------|----------|
| #番号 | 概要 | 何が読み取れなかったか |

---

## データ構造の変化セクションでの記載方法

エンティティ変更情報には、カラム・リレーション・インデックス・外部キー制約が含まれています。
「データ構造の変化」セクションでは、以下の形式でテーブル行に追加してください：

**カラム変更:**
| カラム名 | 旧型 | 新型 |

**インデックス:**
| インデックス: (カラム名) | - | [UNIQUE/複合/通常] (カラムリスト) [インデックス名] |

例:
| インデックス: (email) | - | [UNIQUE] (email) [idx_email_unique] |
| インデックス: (userId, createdAt) | - | [複合] (userId, createdAt) |

**外部キー:**
| 外部キー: relationName | - | targetEntity [N→1/1→N等] (ON DELETE 制約, ON UPDATE 制約) |

例:
| 外部キー: department | - | Department [N→1] (ON DELETE CASCADE) |
| 外部キー制約変更: manager | ON DELETE RESTRICT | ON DELETE CASCADE |

**重要な注意:**
- DTOの変更情報は提供されていますが、レポートには含めないでください（俯瞰用のデータです）
- インデックスと外部キー制約は必ず記載してください
- インデックス・外部キーの追加/削除/変更をすべて明記してください

---

上記のフォーマットに従って、レポートを生成してください。`;
}

function getCategoryLabel(category: string): string {
	const labels: Record<string, string> = {
		"db-schema": "DB スキーマ変更",
		"api-endpoint": "API エンドポイント",
		"domain-model": "ドメインモデル・エンティティ",
		"state-management": "状態管理・データフロー",
		"external-integration": "外部サービス連携",
		refactoring: "リファクタリング",
		other: "その他",
	};
	return labels[category] || category;
}

/**
 * エンティティ変更を構造化してフォーマット（インデックス・外部キー含む）
 */
function formatEntityChange(change: EntityChange): string {
	const lines: string[] = [];

	lines.push(`エンティティ: ${change.className} (${change.file})`);
	lines.push(`変更タイプ: ${change.changeType}`);

	// カラム変更
	const columnChanges = getColumnChanges(
		change.columns.before,
		change.columns.after,
	);
	if (columnChanges.length > 0) {
		lines.push("\n**カラム変更:**");
		lines.push(...columnChanges);
	}

	// リレーション変更
	if (change.relations) {
		const relationChanges = getRelationChanges(
			change.relations.before,
			change.relations.after,
		);
		if (relationChanges.length > 0) {
			lines.push("\n**リレーション変更:**");
			lines.push(...relationChanges);
		}
	}

	// インデックス変更
	if (change.indexes) {
		const indexChanges = getIndexChanges(
			change.indexes.before,
			change.indexes.after,
		);
		if (indexChanges.length > 0) {
			lines.push("\n**インデックス変更:**");
			lines.push(...indexChanges);
		}
	}

	// 外部キー変更
	if (change.foreignKeys) {
		const fkChanges = getForeignKeyChanges(
			change.foreignKeys.before,
			change.foreignKeys.after,
		);
		if (fkChanges.length > 0) {
			lines.push("\n**外部キー変更:**");
			lines.push(...fkChanges);
		}
	}

	return lines.join("\n");
}

/**
 * カラム変更を取得
 */
function getColumnChanges(
	before: EntityColumn[],
	after: EntityColumn[],
): string[] {
	const changes: string[] = [];

	// 追加されたカラム
	const added = after.filter((a) => !before.find((b) => b.name === a.name));
	for (const col of added) {
		changes.push(
			`- 追加: ${col.name} (${col.type}${col.nullable ? ", nullable" : ""})`,
		);
	}

	// 削除されたカラム
	const deleted = before.filter((b) => !after.find((a) => a.name === b.name));
	for (const col of deleted) {
		changes.push(`- 削除: ${col.name}`);
	}

	// 変更されたカラム
	for (const b of before) {
		const a = after.find((col) => col.name === b.name);
		if (a && (a.type !== b.type || a.nullable !== b.nullable)) {
			changes.push(
				`- 変更: ${b.name} (${b.type} → ${a.type}${a.nullable !== b.nullable ? `, nullable: ${b.nullable} → ${a.nullable}` : ""})`,
			);
		}
	}

	return changes;
}

/**
 * リレーション変更を取得
 */
function getRelationChanges(
	before: EntityRelation[],
	after: EntityRelation[],
): string[] {
	const changes: string[] = [];

	const added = after.filter((a) => !before.find((b) => b.name === a.name));
	for (const rel of added) {
		changes.push(
			`- 追加: ${rel.name} → ${rel.targetEntity} [${rel.relationType}]`,
		);
	}

	const deleted = before.filter((b) => !after.find((a) => a.name === b.name));
	for (const rel of deleted) {
		changes.push(`- 削除: ${rel.name}`);
	}

	return changes;
}

/**
 * インデックス変更を取得
 */
function getIndexChanges(
	before: EntityIndex[],
	after: EntityIndex[],
): string[] {
	const changes: string[] = [];

	// 追加されたインデックス
	const added = after.filter(
		(a) =>
			!before.find(
				(b) =>
					JSON.stringify(b.columns.sort()) ===
						JSON.stringify(a.columns.sort()) && b.unique === a.unique,
			),
	);
	for (const idx of added) {
		const type = idx.unique
			? "UNIQUE"
			: idx.columns.length > 1
				? "複合"
				: "通常";
		const name = idx.name ? ` [${idx.name}]` : "";
		changes.push(`- 追加: (${idx.columns.join(", ")}) [${type}]${name}`);
	}

	// 削除されたインデックス
	const deleted = before.filter(
		(b) =>
			!after.find(
				(a) =>
					JSON.stringify(a.columns.sort()) ===
						JSON.stringify(b.columns.sort()) && a.unique === b.unique,
			),
	);
	for (const idx of deleted) {
		const type = idx.unique
			? "UNIQUE"
			: idx.columns.length > 1
				? "複合"
				: "通常";
		changes.push(`- 削除: (${idx.columns.join(", ")}) [${type}]`);
	}

	return changes;
}

/**
 * 外部キー変更を取得
 */
function getForeignKeyChanges(
	before: EntityForeignKey[],
	after: EntityForeignKey[],
): string[] {
	const changes: string[] = [];

	// 追加された外部キー
	const added = after.filter(
		(a) => !before.find((b) => b.relationName === a.relationName),
	);
	for (const fk of added) {
		const relType = getRelationSymbol(fk.relationType);
		const constraints = formatConstraints(fk);
		changes.push(
			`- 追加: ${fk.relationName} → ${fk.targetEntity} [${relType}]${constraints}`,
		);
	}

	// 削除された外部キー
	const deleted = before.filter(
		(b) => !after.find((a) => a.relationName === b.relationName),
	);
	for (const fk of deleted) {
		const relType = getRelationSymbol(fk.relationType);
		changes.push(
			`- 削除: ${fk.relationName} → ${fk.targetEntity} [${relType}]`,
		);
	}

	// 制約変更された外部キー
	for (const b of before) {
		const a = after.find((fk) => fk.relationName === b.relationName);
		if (a && (a.onDelete !== b.onDelete || a.onUpdate !== b.onUpdate)) {
			const constraintChanges = [];
			if (a.onDelete !== b.onDelete) {
				constraintChanges.push(
					`ON DELETE: ${b.onDelete || "なし"} → ${a.onDelete || "なし"}`,
				);
			}
			if (a.onUpdate !== b.onUpdate) {
				constraintChanges.push(
					`ON UPDATE: ${b.onUpdate || "なし"} → ${a.onUpdate || "なし"}`,
				);
			}
			changes.push(
				`- 制約変更: ${b.relationName} (${constraintChanges.join(", ")})`,
			);
		}
	}

	return changes;
}

/**
 * リレーション種別を記号に変換
 */
function getRelationSymbol(type: string): string {
	const map: Record<string, string> = {
		ManyToOne: "N→1",
		OneToMany: "1→N",
		OneToOne: "1↔1",
		ManyToMany: "N↔M",
	};
	return map[type] || type;
}

/**
 * 外部キー制約をフォーマット
 */
function formatConstraints(fk: EntityForeignKey): string {
	const parts: string[] = [];
	if (fk.onDelete) parts.push(`ON DELETE ${fk.onDelete}`);
	if (fk.onUpdate) parts.push(`ON UPDATE ${fk.onUpdate}`);
	return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}
