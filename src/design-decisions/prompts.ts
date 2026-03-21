import type { DesignDecisionData } from "./types.js";

export function buildDesignDecisionPrompt(data: DesignDecisionData): string {
	const { period, commits, prs, targetChanges } = data;

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
	.map(
		(pr) => `### PR #${pr.number}: ${pr.title}
URL: ${pr.url}
マージ日: ${pr.mergedAt || pr.createdAt}

${pr.body || "(本文なし)"}

変更ファイル数: ${pr.files.length}
${pr.files
	.slice(0, 5)
	.map((f) => `  - ${f.path} (+${f.additions || 0}/-${f.deletions || 0})`)
	.join("\n")}
${pr.files.length > 5 ? `  ... 他 ${pr.files.length - 5}件` : ""}
`,
	)
	.join("\n---\n\n")}

## 対象変更の詳細（設計上の意思決定を含む変更）

対象変更数: ${targetChanges.length}件

${targetChanges
	.map(
		(change, idx) => `### 変更 ${idx + 1}
カテゴリ: ${getCategoryLabel(change.category)}
${change.prNumber ? `PR: #${change.prNumber}` : `Commit: ${change.commitHash.slice(0, 7)}`}
ファイル: ${change.files.join(", ")}

差分:
\`\`\`
${change.diff.slice(0, 5000)}${change.diff.length > 5000 ? "\n... (差分が大きいため省略)" : ""}
\`\`\`
`,
	)
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
