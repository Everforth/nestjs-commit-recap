import { BaseAnalyzer } from './base-analyzer.js';
import type { ProviderChange, ProviderInfo } from '../types/index.js';
import { classifyFile, isProviderFile } from '../utils/file-classifier.js';

export class ProviderAnalyzer extends BaseAnalyzer {
  async analyze(): Promise<ProviderChange[]> {
    const changes: ProviderChange[] = [];

    const { added, deleted, modified } = await this.repo.getDiffFiles(
      this.options.days,
      this.options.branch
    );

    const providerFiles = [...added, ...deleted, ...modified].filter(isProviderFile);

    for (const file of providerFiles) {
      const beforeContent = await this.getFileContent(file, 'before');
      const afterContent = await this.getFileContent(file, 'after');

      if (!this.isProviderContent(beforeContent) && !this.isProviderContent(afterContent)) {
        continue;
      }

      const changeType = this.determineChangeType(beforeContent, afterContent);
      const className =
        this.extractProviderClassName(afterContent) ??
        this.extractProviderClassName(beforeContent) ??
        'Unknown';

      const fileType = classifyFile(file);
      const providerType =
        fileType === 'service' ? 'service' :
        fileType === 'repository' ? 'repository' :
        'other';

      this.log(`Found provider: ${className} (${changeType})`);

      const info: ProviderInfo = {
        file,
        className,
        type: providerType,
      };

      changes.push({
        info,
        changeType,
        relatedPRs: this.getPRsForFile(file),
      });
    }

    return changes;
  }

  private isProviderContent(content: string | null): boolean {
    if (!content) return false;
    try {
      const sourceFile = this.parseContent(content, 'provider-check.ts');
      const cls = this.findClassWithDecorator(sourceFile, 'Injectable');
      return cls !== undefined;
    } catch {
      return false;
    }
  }

  private extractProviderClassName(content: string | null): string | null {
    if (!content) return null;
    try {
      const sourceFile = this.parseContent(content, 'provider-extract.ts');
      const cls = this.findClassWithDecorator(sourceFile, 'Injectable');
      return cls?.getName() ?? null;
    } catch {
      return null;
    }
  }
}
