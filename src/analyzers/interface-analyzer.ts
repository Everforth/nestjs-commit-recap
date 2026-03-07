import { BaseAnalyzer } from './base-analyzer.js';
import type { InterfaceChange, InterfaceProperty } from '../types/index.js';
import { InterfaceDeclaration } from 'ts-morph';

interface InterfaceInfo {
  properties: InterfaceProperty[];
  extendsInterfaces: string[];
}

export class InterfaceAnalyzer extends BaseAnalyzer {
  async analyze(): Promise<InterfaceChange[]> {
    const changes: InterfaceChange[] = [];

    const { added, deleted, modified, renamed } = await this.repo.getDiffFiles(
      this.options.days,
      this.options.branch
    );

    // 通常のファイル（追加、削除、変更）を処理
    // すべての .ts ファイルを対象とする
    const allFiles = [...added, ...deleted, ...modified].filter(file => file.endsWith('.ts'));

    for (const file of allFiles) {
      const beforeContent = await this.getFileContent(file, 'before');
      const afterContent = await this.getFileContent(file, 'after');

      const beforeInterfaces = this.extractInterfaces(beforeContent);
      const afterInterfaces = this.extractInterfaces(afterContent);

      // ファイル内のすべてのInterfaceを個別に追跡
      const allInterfaceNames = new Set([...beforeInterfaces.keys(), ...afterInterfaces.keys()]);

      for (const interfaceName of allInterfaceNames) {
        const beforeInfo = beforeInterfaces.get(interfaceName);
        const afterInfo = afterInterfaces.get(interfaceName);

        const changeType = this.determineChangeType(
          beforeInfo ? 'has-content' : null,
          afterInfo ? 'has-content' : null
        );

        this.log(`Found Interface: ${interfaceName} in ${file} (${changeType})`);

        changes.push({
          file,
          interfaceName,
          changeType,
          properties: {
            before: beforeInfo?.properties || [],
            after: afterInfo?.properties || [],
          },
          extendsInterfaces: {
            before: beforeInfo?.extendsInterfaces || [],
            after: afterInfo?.extendsInterfaces || [],
          },
          relatedPRs: this.getPRsForFile(file),
        });
      }
    }

    // 移動（renamed）ファイルを処理
    for (const { from, to } of renamed) {
      if (!to.endsWith('.ts')) continue;

      const beforeContent = await this.getFileContentAtPath(from, 'before');
      const afterContent = await this.getFileContent(to, 'after');

      const beforeInterfaces = this.extractInterfaces(beforeContent);
      const afterInterfaces = this.extractInterfaces(afterContent);

      // Interface名でマッチングして moved を検出
      const allInterfaceNames = new Set([...beforeInterfaces.keys(), ...afterInterfaces.keys()]);

      for (const interfaceName of allInterfaceNames) {
        const beforeInfo = beforeInterfaces.get(interfaceName);
        const afterInfo = afterInterfaces.get(interfaceName);

        // 両方に存在する場合は moved
        if (beforeInfo && afterInfo) {
          this.log(`Found Interface: ${interfaceName} (moved: ${from} -> ${to})`);

          changes.push({
            file: to,
            oldFile: from,
            interfaceName,
            changeType: 'moved',
            properties: {
              before: beforeInfo.properties,
              after: afterInfo.properties,
            },
            extendsInterfaces: {
              before: beforeInfo.extendsInterfaces,
              after: afterInfo.extendsInterfaces,
            },
            relatedPRs: [...this.getPRsForFile(from), ...this.getPRsForFile(to)],
          });
        } else if (beforeInfo) {
          // 旧ファイルにのみ存在（削除）
          this.log(`Found Interface: ${interfaceName} in ${from} (deleted)`);
          changes.push({
            file: from,
            interfaceName,
            changeType: 'deleted',
            properties: {
              before: beforeInfo.properties,
              after: [],
            },
            extendsInterfaces: {
              before: beforeInfo.extendsInterfaces,
              after: [],
            },
            relatedPRs: this.getPRsForFile(from),
          });
        } else if (afterInfo) {
          // 新ファイルにのみ存在（追加）
          this.log(`Found Interface: ${interfaceName} in ${to} (added)`);
          changes.push({
            file: to,
            interfaceName,
            changeType: 'added',
            properties: {
              before: [],
              after: afterInfo.properties,
            },
            extendsInterfaces: {
              before: [],
              after: afterInfo.extendsInterfaces,
            },
            relatedPRs: this.getPRsForFile(to),
          });
        }
      }
    }

    return changes;
  }

  /**
   * 指定したパスでファイルの内容を取得（移動元ファイル用）
   */
  private async getFileContentAtPath(filePath: string, timing: 'before' | 'after'): Promise<string | null> {
    if (timing === 'before') {
      return this.repo.getFileContentBefore(filePath, this.options.days, this.options.branch);
    } else {
      return this.repo.getCurrentFileContent(filePath);
    }
  }

  /**
   * ファイルからすべてのInterfaceを抽出
   * @returns Map<interfaceName, InterfaceInfo>
   */
  private extractInterfaces(content: string | null): Map<string, InterfaceInfo> {
    const result = new Map<string, InterfaceInfo>();
    if (!content) return result;

    try {
      const sourceFile = this.parseContent(content, 'interface-extract.ts');
      const interfaces = sourceFile.getInterfaces();

      for (const iface of interfaces) {
        const interfaceName = iface.getName();
        const properties = this.extractInterfaceProperties(iface);
        const extendsInterfaces = this.extractExtendsInterfaces(iface);

        result.set(interfaceName, {
          properties,
          extendsInterfaces,
        });
      }

      return result;
    } catch (error) {
      this.log(`Failed to parse interface content: ${error}`);
      return result;
    }
  }

  /**
   * InterfaceDeclarationからプロパティを抽出
   */
  private extractInterfaceProperties(iface: InterfaceDeclaration): InterfaceProperty[] {
    const properties: InterfaceProperty[] = [];

    for (const prop of iface.getProperties()) {
      const name = prop.getName();
      const isOptional = prop.hasQuestionToken();
      const isReadonly = prop.isReadonly();

      // 型を取得
      const typeNode = prop.getTypeNode();
      let type = typeNode?.getText() || 'unknown';
      type = this.normalizeType(type);

      properties.push({
        name,
        type,
        optional: isOptional,
        readonly: isReadonly,
      });
    }

    return properties;
  }

  /**
   * InterfaceDeclarationから継承情報を抽出
   */
  private extractExtendsInterfaces(iface: InterfaceDeclaration): string[] {
    const extendsClause = iface.getExtends();
    return extendsClause.map(e => e.getText());
  }

  /**
   * 型文字列を正規化する
   * - import() ラッパー除去
   * - リテラル型の正規化
   * - Union型のソート
   */
  private normalizeType(rawType: string): string {
    let type = rawType;

    // import() ラッパー除去: import("path").TypeName → TypeName
    type = type.replace(/import\([^)]+\)\./g, '');

    // リテラル型の正規化: "active" → string, 123 → number
    if (/^["'`].*["'`]$/.test(type)) type = 'string';
    if (/^\d+$/.test(type)) type = 'number';

    // Union型のソート: B | A → A | B
    if (type.includes('|')) {
      type = type.split('|').map(p => p.trim()).sort().join(' | ');
    }

    return type.trim();
  }
}
