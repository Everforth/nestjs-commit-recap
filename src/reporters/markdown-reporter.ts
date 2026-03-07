import type {
  AnalysisResult,
  EntityChange,
  ControllerChange,
  ModuleChange,
  ProviderChange,
  MiddlewareChange,
  EntityColumn,
  EntityRelation,
  EndpointInfo,
} from '../types/index.js';
import type { PRInfo } from '../git/pr-fetcher.js';

export class MarkdownReporter {
  generate(result: AnalysisResult): string {
    // ファイル移動（同じクラス名で追加と削除がある）を検出してフィルタリング
    const filteredResult = this.filterFileMoves(result);

    const lines: string[] = [];

    lines.push('# NestJS構造変化レポート');
    lines.push('');
    lines.push(`- **リポジトリ**: ${filteredResult.repoPath}`);
    lines.push(`- **期間**: ${filteredResult.startDate} ~ ${filteredResult.endDate}`);
    lines.push('');

    // サマリーセクション
    lines.push(...this.generateSummary(filteredResult));

    // 詳細セクション
    if (filteredResult.entities.length > 0) {
      lines.push(...this.generateEntityDetails(filteredResult.entities));
    }

    if (filteredResult.controllers.length > 0) {
      lines.push(...this.generateControllerDetails(filteredResult.controllers));
    }

    if (filteredResult.modules.length > 0) {
      lines.push(...this.generateModuleDetails(filteredResult.modules));
    }

    if (filteredResult.providers.length > 0) {
      lines.push(...this.generateProviderDetails(filteredResult.providers));
    }

    if (filteredResult.middlewares.length > 0) {
      lines.push(...this.generateMiddlewareDetails(filteredResult.middlewares));
    }

    return lines.join('\n');
  }

  private filterFileMoves(result: AnalysisResult): AnalysisResult {
    return {
      ...result,
      entities: this.filterEntityMoves(result.entities),
      controllers: this.filterControllerMoves(result.controllers),
      providers: this.filterProviderMoves(result.providers),
      middlewares: this.filterMiddlewareMoves(result.middlewares),
    };
  }

  private filterControllerMoves(controllers: ControllerChange[]): ControllerChange[] {
    const added = controllers.filter(c => c.changeType === 'added');
    const deleted = controllers.filter(c => c.changeType === 'deleted');

    const movedClassNames = new Set<string>();
    for (const add of added) {
      const del = deleted.find(d => d.className === add.className);
      if (del) {
        movedClassNames.add(add.className);
      }
    }

    return controllers.filter(c => !movedClassNames.has(c.className));
  }

  private filterEntityMoves(entities: EntityChange[]): EntityChange[] {
    const added = entities.filter(e => e.changeType === 'added');
    const deleted = entities.filter(e => e.changeType === 'deleted');

    // 同じクラス名で追加と削除がある場合、'moved' タイプに変換
    const movedClassNames = new Set<string>();
    const movedEntities: EntityChange[] = [];

    for (const add of added) {
      const del = deleted.find(d => d.className === add.className);
      if (del) {
        movedClassNames.add(add.className);
        // 移動として新しいエントリを作成
        movedEntities.push({
          ...add,
          oldFile: del.file,
          changeType: 'moved',
          columns: {
            before: del.columns.before,
            after: add.columns.after,
          },
          relations: {
            before: del.relations?.before ?? [],
            after: add.relations?.after ?? [],
          },
          relatedPRs: [...del.relatedPRs, ...add.relatedPRs],
        });
      }
    }

    // 移動されていない added, deleted, modified と、新しく作成した moved を結合
    // 既に changeType === 'moved' のものはそのまま含める
    return [
      ...entities.filter(e =>
        !movedClassNames.has(e.className) ||
        e.changeType === 'moved'
      ),
      ...movedEntities,
    ];
  }

  private filterProviderMoves(providers: ProviderChange[]): ProviderChange[] {
    const added = providers.filter(p => p.changeType === 'added');
    const deleted = providers.filter(p => p.changeType === 'deleted');

    const movedClassNames = new Set<string>();
    for (const add of added) {
      const del = deleted.find(d => d.info.className === add.info.className);
      if (del) {
        movedClassNames.add(add.info.className);
      }
    }

    return providers.filter(p => !movedClassNames.has(p.info.className));
  }

  private filterMiddlewareMoves(middlewares: MiddlewareChange[]): MiddlewareChange[] {
    const added = middlewares.filter(m => m.changeType === 'added');
    const deleted = middlewares.filter(m => m.changeType === 'deleted');

    const movedClassNames = new Set<string>();
    for (const add of added) {
      const del = deleted.find(d => d.info.className === add.info.className);
      if (del) {
        movedClassNames.add(add.info.className);
      }
    }

    return middlewares.filter(m => !movedClassNames.has(m.info.className));
  }

  private generateSummary(result: AnalysisResult): string[] {
    const lines: string[] = [];
    lines.push('## サマリー');
    lines.push('');

    // Entity サマリー（削除のみは除外、変更がないものも除外）
    const entitiesToShow = result.entities.filter(e => {
      if (e.changeType === 'deleted') return false;
      if (e.changeType === 'added') return true;
      if (e.changeType === 'moved') return true;  // 移動は常に表示
      // modified の場合、実際に変更があるかチェック
      const addedColumns = this.getAddedColumns(e);
      const deletedColumns = this.getDeletedColumns(e);
      const modifiedColumns = this.getModifiedColumns(e);
      const addedRelations = this.getAddedRelations(e);
      const deletedRelations = this.getDeletedRelations(e);
      return addedColumns.length > 0 || deletedColumns.length > 0 ||
             modifiedColumns.length > 0 ||
             addedRelations.length > 0 || deletedRelations.length > 0;
    });
    if (entitiesToShow.length > 0) {
      lines.push('### Entity');
      lines.push('|   | 内容 |');
      lines.push('|---|------|');
      for (const entity of entitiesToShow) {
        const symbol = this.getChangeSymbol(entity.changeType);
        let content = `\`${entity.className}\``;

        if (entity.changeType === 'moved') {
          // 移動の場合、移動元と移動先のディレクトリを表示
          const oldDir = entity.oldFile ? this.getDirectory(entity.oldFile) : '';
          const newDir = this.getDirectory(entity.file);
          content += ` (${oldDir} → ${newDir})`;

          // 移動と同時にカラム/リレーション変更がある場合も表示
          const changes: string[] = [];
          const addedColumns = this.getAddedColumns(entity);
          const deletedColumns = this.getDeletedColumns(entity);
          const modifiedColumns = this.getModifiedColumns(entity);
          const addedRelations = this.getAddedRelations(entity);
          const deletedRelations = this.getDeletedRelations(entity);

          if (addedColumns.length > 0) {
            changes.push(`+${addedColumns.length} columns`);
          }
          if (deletedColumns.length > 0) {
            changes.push(`-${deletedColumns.length} columns`);
          }
          if (modifiedColumns.length > 0) {
            changes.push(`~${modifiedColumns.length} columns`);
          }
          if (addedRelations.length > 0) {
            changes.push(`+${addedRelations.length} relations`);
          }
          if (deletedRelations.length > 0) {
            changes.push(`-${deletedRelations.length} relations`);
          }

          if (changes.length > 0) {
            content += ` [${changes.join(', ')}]`;
          }
        } else if (entity.changeType === 'modified') {
          const changes: string[] = [];
          const addedColumns = this.getAddedColumns(entity);
          const deletedColumns = this.getDeletedColumns(entity);
          const modifiedColumns = this.getModifiedColumns(entity);
          const addedRelations = this.getAddedRelations(entity);
          const deletedRelations = this.getDeletedRelations(entity);

          if (addedColumns.length > 0) {
            changes.push(`+${addedColumns.length} columns: ${addedColumns.join(', ')}`);
          }
          if (deletedColumns.length > 0) {
            changes.push(`-${deletedColumns.length} columns: ${deletedColumns.join(', ')}`);
          }
          if (modifiedColumns.length > 0) {
            changes.push(`~${modifiedColumns.length} columns: ${modifiedColumns.join(', ')}`);
          }
          if (addedRelations.length > 0) {
            changes.push(`+${addedRelations.length} relations: ${addedRelations.join(', ')}`);
          }
          if (deletedRelations.length > 0) {
            changes.push(`-${deletedRelations.length} relations: ${deletedRelations.join(', ')}`);
          }

          if (changes.length > 0) {
            content += ` (${changes.join(', ')})`;
          }
        }

        lines.push(`| ${symbol} | ${content} |`);
      }
      lines.push('');
    }

    // Endpoint サマリー
    const endpointChanges = this.getEndpointChanges(result.controllers);
    if (endpointChanges.length > 0) {
      lines.push('### Endpoint');
      lines.push('|   | Method | Path |');
      lines.push('|---|--------|------|');
      for (const change of endpointChanges) {
        lines.push(`| ${change.symbol} | ${change.method} | \`${change.path}\` |`);
      }
      lines.push('');
    }

    // Module サマリー（削除のみ・変更なしは除外）
    const modulesToShow = result.modules.filter(mod => {
      if (mod.changeType === 'deleted') return false;
      const configChanges = this.getModuleConfigChanges(mod);
      const hasAdded = configChanges.some(c => c.symbol === '+');
      return configChanges.length > 0 && hasAdded;
    });
    if (modulesToShow.length > 0) {
      lines.push('### Module構成');
      lines.push('|   | Module | 内容 |');
      lines.push('|---|--------|------|');
      for (const mod of modulesToShow) {
        const symbol = this.getChangeSymbol(mod.changeType);
        const content = this.getModuleChangeSummary(mod);
        lines.push(`| ${symbol} | \`${mod.className}\` | ${content} |`);
      }
      lines.push('');
    }

    // Provider サマリー（削除のみは除外）
    const providersToShow = result.providers.filter(p => p.changeType !== 'deleted');
    if (providersToShow.length > 0) {
      lines.push('### Provider');
      lines.push('|   | 内容 |');
      lines.push('|---|------|');
      for (const provider of providersToShow) {
        const symbol = this.getChangeSymbol(provider.changeType);
        lines.push(`| ${symbol} | \`${provider.info.className}\` |`);
      }
      lines.push('');
    }

    // Middleware類 サマリー（削除のみは除外）
    const middlewaresToShow = result.middlewares.filter(m => m.changeType !== 'deleted');
    if (middlewaresToShow.length > 0) {
      lines.push('### Middleware類');
      lines.push('|   | 種別 | 内容 |');
      lines.push('|---|------|------|');
      for (const mw of middlewaresToShow) {
        const symbol = this.getChangeSymbol(mw.changeType);
        const typeLabel = this.getMiddlewareTypeLabel(mw.info.type);
        lines.push(`| ${symbol} | ${typeLabel} | \`${mw.info.className}\` |`);
      }
      lines.push('');
    }

    // 関連PR
    if (result.allPRs.length > 0) {
      const prLinks = result.allPRs.map(pr => `[#${pr.number}](${pr.url})`).join(', ');
      lines.push(`**関連PR**: ${prLinks}`);
      lines.push('');
    }

    lines.push('---');
    lines.push('');

    return lines;
  }

  private generateEntityDetails(entities: EntityChange[]): string[] {
    // 削除のみ・変更なしのEntityをフィルタリング
    const entitiesToShow = entities.filter(entity => {
      if (entity.changeType === 'deleted') return false;
      if (entity.changeType === 'added') return true;
      if (entity.changeType === 'moved') return true;  // 移動は常に表示
      const allColumns = this.mergeColumns(entity.columns.before, entity.columns.after);
      const changedColumns = allColumns.filter(col => col.changeType !== 'unchanged');
      const allRelations = this.mergeRelations(entity.relations?.before ?? [], entity.relations?.after ?? []);
      const changedRelations = allRelations.filter(rel => rel.changeType !== 'unchanged');
      return changedColumns.length > 0 || changedRelations.length > 0;
    });

    if (entitiesToShow.length === 0) {
      return [];
    }

    const lines: string[] = [];
    lines.push('## Entity の変更');
    lines.push('');

    for (const entity of entitiesToShow) {
      const fileName = entity.file.split('/').pop() ?? entity.file;
      lines.push(`### ${fileName}`);

      // 移動の場合、移動元パスを表示
      if (entity.changeType === 'moved' && entity.oldFile) {
        lines.push(`> 移動: \`${entity.oldFile}\` → \`${entity.file}\``);
        lines.push('');
      }

      const allColumns = this.mergeColumns(entity.columns.before, entity.columns.after);

      if (allColumns.length > 0) {
        lines.push('#### Columns');
        lines.push('|   | Column | 変更前 | 変更後 |');
        lines.push('|---|--------|--------|--------|');

        for (const col of allColumns) {
          const symbol = col.changeType === 'added' ? '+' :
                        col.changeType === 'deleted' ? '-' :
                        col.changeType === 'modified' ? '~' : '';
          const before = col.before?.type ?? '';
          const after = col.after?.type ?? '';
          lines.push(`| ${symbol} | ${col.name} | ${before} | ${after} |`);
        }
        lines.push('');
      }

      // Relations
      const allRelations = this.mergeRelations(entity.relations?.before ?? [], entity.relations?.after ?? []);

      if (allRelations.length > 0) {
        lines.push('#### Relations');
        lines.push('|   | Property | Type | Target |');
        lines.push('|---|----------|------|--------|');

        for (const rel of allRelations) {
          const symbol = rel.changeType === 'added' ? '+' :
                        rel.changeType === 'deleted' ? '-' :
                        rel.changeType === 'modified' ? '~' : '';
          const relationType = rel.after?.relationType ?? rel.before?.relationType ?? '';
          const target = rel.after?.targetEntity ?? rel.before?.targetEntity ?? '';
          lines.push(`| ${symbol} | ${rel.name} | ${relationType} | ${target} |`);
        }
        lines.push('');
      }

      if (entity.relatedPRs.length > 0) {
        lines.push(this.formatRelatedPRs(entity.relatedPRs));
        lines.push('');
      }

      lines.push('---');
      lines.push('');
    }

    return lines;
  }

  private mergeRelations(
    before: EntityRelation[],
    after: EntityRelation[]
  ): Array<{
    name: string;
    changeType: 'added' | 'deleted' | 'modified' | 'unchanged';
    before?: EntityRelation;
    after?: EntityRelation;
  }> {
    const result: Array<{
      name: string;
      changeType: 'added' | 'deleted' | 'modified' | 'unchanged';
      before?: EntityRelation;
      after?: EntityRelation;
    }> = [];

    const beforeMap = new Map(before.map(r => [r.name, r]));
    const afterMap = new Map(after.map(r => [r.name, r]));
    const allNames = new Set([...beforeMap.keys(), ...afterMap.keys()]);

    for (const name of allNames) {
      const b = beforeMap.get(name);
      const a = afterMap.get(name);

      if (!b && a) {
        result.push({ name, changeType: 'added', after: a });
      } else if (b && !a) {
        result.push({ name, changeType: 'deleted', before: b });
      } else if (b && a) {
        const changed = b.relationType !== a.relationType || b.targetEntity !== a.targetEntity;
        result.push({
          name,
          changeType: changed ? 'modified' : 'unchanged',
          before: b,
          after: a,
        });
      }
    }

    return result;
  }

  private generateControllerDetails(controllers: ControllerChange[]): string[] {
    // 削除のみ・変更なしのコントローラをフィルタリング
    const controllersToShow = controllers.filter(controller => {
      if (controller.changeType === 'deleted') return false;
      const allEndpoints = this.mergeEndpoints(controller.endpoints.before, controller.endpoints.after);
      const changedEndpoints = allEndpoints.filter(ep => ep.changeType !== 'unchanged');
      // 全て削除の場合も出さない
      const hasAddedOrModified = changedEndpoints.some(ep => ep.changeType === 'added');
      return changedEndpoints.length > 0 && hasAddedOrModified;
    });

    if (controllersToShow.length === 0) {
      return [];
    }

    const lines: string[] = [];
    lines.push('## Endpoint の変更');
    lines.push('');

    for (const controller of controllersToShow) {
      const fileName = controller.file.split('/').pop() ?? controller.file;
      lines.push(`### ${fileName}`);

      const allEndpoints = this.mergeEndpoints(controller.endpoints.before, controller.endpoints.after);

      lines.push('|   | Method | Path | 変更前 | 変更後 |');
      lines.push('|---|--------|------|--------|--------|');

      for (const ep of allEndpoints) {
        const symbol = ep.changeType === 'added' ? '+' :
                      ep.changeType === 'deleted' ? '-' : '';
        const before = ep.before?.handlerName ? `${ep.before.handlerName}()` : '';
        const after = ep.after?.handlerName ? `${ep.after.handlerName}()` : '';
        const fullPath = this.buildFullPath(controller.basePath, ep.path);
        lines.push(`| ${symbol} | ${ep.method} | \`${fullPath}\` | ${before} | ${after} |`);
      }

      if (controller.relatedPRs.length > 0) {
        lines.push('');
        lines.push(this.formatRelatedPRs(controller.relatedPRs));
      }

      lines.push('');
      lines.push('---');
      lines.push('');
    }

    return lines;
  }

  private buildFullPath(basePath: string, endpointPath: string): string {
    const base = basePath.replace(/\/$/, '');
    const endpoint = endpointPath.replace(/^\//, '');
    if (!endpoint) {
      return base || '/';
    }
    return `${base}/${endpoint}`;
  }

  private generateModuleDetails(modules: ModuleChange[]): string[] {
    // 削除のみ・変更なしのモジュールをフィルタリング
    const modulesToShow = modules.filter(mod => {
      if (mod.changeType === 'deleted') return false;
      const configChanges = this.getModuleConfigChanges(mod);
      // 全て削除の場合も出さない
      const hasAdded = configChanges.some(c => c.symbol === '+');
      return configChanges.length > 0 && hasAdded;
    });

    if (modulesToShow.length === 0) {
      return [];
    }

    const lines: string[] = [];
    lines.push('## Module 構成の変更');
    lines.push('');

    for (const mod of modulesToShow) {
      const fileName = mod.file.split('/').pop() ?? mod.file;
      const configChanges = this.getModuleConfigChanges(mod);

      lines.push(`### ${fileName}`);
      lines.push('|   | 項目 | 変更前 | 変更後 |');
      lines.push('|---|------|--------|--------|');

      for (const change of configChanges) {
        lines.push(`| ${change.symbol} | ${change.key} | ${change.before} | ${change.after} |`);
      }

      if (mod.relatedPRs.length > 0) {
        lines.push('');
        lines.push(this.formatRelatedPRs(mod.relatedPRs));
      }

      lines.push('');
      lines.push('---');
      lines.push('');
    }

    return lines;
  }

  private generateProviderDetails(providers: ProviderChange[]): string[] {
    // 削除のみのProviderは出さない
    const providersToShow = providers.filter(p => p.changeType !== 'deleted');

    if (providersToShow.length === 0) {
      return [];
    }

    const lines: string[] = [];
    lines.push('## Provider の変更');
    lines.push('');
    lines.push('|   | ファイル | クラス名 |');
    lines.push('|---|----------|----------|');

    for (const provider of providersToShow) {
      const symbol = this.getChangeSymbol(provider.changeType);
      const fileName = provider.info.file.split('/').pop() ?? provider.info.file;
      lines.push(`| ${symbol} | ${fileName} | ${provider.info.className} |`);
    }

    const allPRs = this.collectPRs(providersToShow.map(p => p.relatedPRs));
    if (allPRs.length > 0) {
      lines.push('');
      lines.push(this.formatRelatedPRs(allPRs));
    }

    lines.push('');
    lines.push('---');
    lines.push('');

    return lines;
  }

  private generateMiddlewareDetails(middlewares: MiddlewareChange[]): string[] {
    // 削除のみのMiddlewareは出さない
    const middlewaresToShow = middlewares.filter(m => m.changeType !== 'deleted');

    if (middlewaresToShow.length === 0) {
      return [];
    }

    const lines: string[] = [];
    lines.push('## Middleware類 の変更');
    lines.push('');
    lines.push('|   | ファイル | 種別 | クラス名 |');
    lines.push('|---|----------|------|----------|');

    for (const mw of middlewaresToShow) {
      const symbol = this.getChangeSymbol(mw.changeType);
      const fileName = mw.info.file.split('/').pop() ?? mw.info.file;
      const typeLabel = this.getMiddlewareTypeLabel(mw.info.type);
      lines.push(`| ${symbol} | ${fileName} | ${typeLabel} | ${mw.info.className} |`);
    }

    const allPRs = this.collectPRs(middlewaresToShow.map(m => m.relatedPRs));
    if (allPRs.length > 0) {
      lines.push('');
      lines.push(this.formatRelatedPRs(allPRs));
    }

    lines.push('');

    return lines;
  }

  private getChangeSymbol(changeType: 'added' | 'deleted' | 'modified' | 'moved'): string {
    switch (changeType) {
      case 'added': return '+';
      case 'deleted': return '-';
      case 'modified': return '~';
      case 'moved': return '→';
    }
  }

  private getAddedColumns(entity: EntityChange): string[] {
    const beforeNames = new Set(entity.columns.before.map(c => c.name));
    return entity.columns.after
      .filter(c => !beforeNames.has(c.name))
      .map(c => c.name);
  }

  private getDeletedColumns(entity: EntityChange): string[] {
    const afterNames = new Set(entity.columns.after.map(c => c.name));
    return entity.columns.before
      .filter(c => !afterNames.has(c.name))
      .map(c => c.name);
  }

  private getModifiedColumns(entity: EntityChange): string[] {
    const beforeMap = new Map(entity.columns.before.map(c => [c.name, c]));
    const result: string[] = [];
    for (const after of entity.columns.after) {
      const before = beforeMap.get(after.name);
      if (before && (before.type !== after.type || before.nullable !== after.nullable)) {
        result.push(after.name);
      }
    }
    return result;
  }

  private getAddedRelations(entity: EntityChange): string[] {
    if (!entity.relations) return [];
    const beforeNames = new Set(entity.relations.before.map(r => r.name));
    return entity.relations.after
      .filter(r => !beforeNames.has(r.name))
      .map(r => r.name);
  }

  private getDeletedRelations(entity: EntityChange): string[] {
    if (!entity.relations) return [];
    const afterNames = new Set(entity.relations.after.map(r => r.name));
    return entity.relations.before
      .filter(r => !afterNames.has(r.name))
      .map(r => r.name);
  }

  private getEndpointChanges(controllers: ControllerChange[]): Array<{
    symbol: string;
    method: string;
    path: string;
  }> {
    const changes: Array<{ symbol: string; method: string; path: string }> = [];

    for (const controller of controllers) {
      const merged = this.mergeEndpoints(controller.endpoints.before, controller.endpoints.after);
      for (const ep of merged) {
        if (ep.changeType === 'added' || ep.changeType === 'deleted') {
          changes.push({
            symbol: ep.changeType === 'added' ? '+' : '-',
            method: ep.method,
            path: this.buildFullPath(controller.basePath, ep.path),
          });
        }
      }
    }

    return changes;
  }

  private getModuleChangeSummary(mod: ModuleChange): string {
    const parts: string[] = [];

    const addedImports = this.getAddedItems(mod.config.before.imports, mod.config.after.imports);
    if (addedImports.length > 0) {
      parts.push(`+imports: ${addedImports.join(', ')}`);
    }

    const addedProviders = this.getAddedItems(mod.config.before.providers, mod.config.after.providers);
    if (addedProviders.length > 0) {
      parts.push(`+providers: ${addedProviders.join(', ')}`);
    }

    const addedExports = this.getAddedItems(mod.config.before.exports, mod.config.after.exports);
    if (addedExports.length > 0) {
      parts.push(`+exports: ${addedExports.join(', ')}`);
    }

    const addedControllers = this.getAddedItems(mod.config.before.controllers, mod.config.after.controllers);
    if (addedControllers.length > 0) {
      parts.push(`+controllers: ${addedControllers.join(', ')}`);
    }

    return parts.join(', ') || '変更あり';
  }

  private getAddedItems(before: Array<{ name: string }>, after: Array<{ name: string }>): string[] {
    const beforeNames = new Set(before.map(i => i.name));
    return after.filter(i => !beforeNames.has(i.name)).map(i => i.name);
  }

  private getMiddlewareTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      middleware: 'Middleware',
      guard: 'Guard',
      interceptor: 'Interceptor',
      pipe: 'Pipe',
      filter: 'Filter',
    };
    return labels[type] ?? type;
  }

  private mergeColumns(
    before: EntityColumn[],
    after: EntityColumn[]
  ): Array<{
    name: string;
    changeType: 'added' | 'deleted' | 'modified' | 'unchanged';
    before?: EntityColumn;
    after?: EntityColumn;
  }> {
    const result: Array<{
      name: string;
      changeType: 'added' | 'deleted' | 'modified' | 'unchanged';
      before?: EntityColumn;
      after?: EntityColumn;
    }> = [];

    const beforeMap = new Map(before.map(c => [c.name, c]));
    const afterMap = new Map(after.map(c => [c.name, c]));
    const allNames = new Set([...beforeMap.keys(), ...afterMap.keys()]);

    for (const name of allNames) {
      const b = beforeMap.get(name);
      const a = afterMap.get(name);

      if (!b && a) {
        result.push({ name, changeType: 'added', after: a });
      } else if (b && !a) {
        result.push({ name, changeType: 'deleted', before: b });
      } else if (b && a) {
        const changed = b.type !== a.type || b.nullable !== a.nullable;
        result.push({
          name,
          changeType: changed ? 'modified' : 'unchanged',
          before: b,
          after: a,
        });
      }
    }

    return result;
  }

  private mergeEndpoints(
    before: EndpointInfo[],
    after: EndpointInfo[]
  ): Array<{
    method: string;
    path: string;
    changeType: 'added' | 'deleted' | 'unchanged';
    before?: EndpointInfo;
    after?: EndpointInfo;
  }> {
    const result: Array<{
      method: string;
      path: string;
      changeType: 'added' | 'deleted' | 'unchanged';
      before?: EndpointInfo;
      after?: EndpointInfo;
    }> = [];

    const key = (ep: EndpointInfo) => `${ep.method}:${ep.path}`;
    const beforeMap = new Map(before.map(ep => [key(ep), ep]));
    const afterMap = new Map(after.map(ep => [key(ep), ep]));
    const allKeys = new Set([...beforeMap.keys(), ...afterMap.keys()]);

    for (const k of allKeys) {
      const b = beforeMap.get(k);
      const a = afterMap.get(k);
      // パスに : が含まれる場合があるので、最初の : だけで分割
      const colonIndex = k.indexOf(':');
      const method = k.substring(0, colonIndex);
      const path = k.substring(colonIndex + 1);

      if (!b && a) {
        result.push({ method, path, changeType: 'added', after: a });
      } else if (b && !a) {
        result.push({ method, path, changeType: 'deleted', before: b });
      } else if (b && a) {
        result.push({ method, path, changeType: 'unchanged', before: b, after: a });
      }
    }

    return result;
  }

  private getModuleConfigChanges(mod: ModuleChange): Array<{
    symbol: string;
    key: string;
    before: string;
    after: string;
  }> {
    const changes: Array<{ symbol: string; key: string; before: string; after: string }> = [];

    const keys = ['imports', 'providers', 'exports', 'controllers'] as const;
    for (const key of keys) {
      const beforeItems = mod.config.before[key].map(i => i.name);
      const afterItems = mod.config.after[key].map(i => i.name);

      const allItems = new Set([...beforeItems, ...afterItems]);

      for (const item of allItems) {
        const inBefore = beforeItems.includes(item);
        const inAfter = afterItems.includes(item);

        if (!inBefore && inAfter) {
          changes.push({ symbol: '+', key, before: '', after: item });
        } else if (inBefore && !inAfter) {
          changes.push({ symbol: '-', key, before: item, after: '' });
        } else {
          // 変更なし
          changes.push({ symbol: '', key, before: item, after: item });
        }
      }
    }

    return changes;
  }

  private formatRelatedPRs(prs: PRInfo[]): string {
    if (prs.length === 0) return '';
    const links = prs.map(pr => `[#${pr.number}](${pr.url})`).join(', ');
    return `**関連PR**: ${links}`;
  }

  private collectPRs(prArrays: PRInfo[][]): PRInfo[] {
    const seen = new Set<number>();
    const result: PRInfo[] = [];

    for (const prs of prArrays) {
      for (const pr of prs) {
        if (!seen.has(pr.number)) {
          seen.add(pr.number);
          result.push(pr);
        }
      }
    }

    return result;
  }

  /**
   * ファイルパスからディレクトリ部分を取得
   */
  private getDirectory(filePath: string): string {
    const parts = filePath.split('/');
    parts.pop(); // ファイル名を除去
    return parts.join('/') || '/';
  }
}
