import { BaseAnalyzer } from './base-analyzer.js';
import type { MiddlewareChange, MiddlewareInfo, MiddlewareType } from '../types/index.js';
import { classifyFile, isMiddlewareTypeFile, fileTypeToMiddlewareType } from '../utils/file-classifier.js';

export class MiddlewareAnalyzer extends BaseAnalyzer {
  async analyze(): Promise<MiddlewareChange[]> {
    const changes: MiddlewareChange[] = [];

    const { added, deleted, modified } = await this.repo.getDiffFiles(
      this.options.days,
      this.options.branch
    );

    const middlewareFiles = [...added, ...deleted, ...modified].filter(isMiddlewareTypeFile);

    for (const file of middlewareFiles) {
      const beforeContent = await this.getFileContent(file, 'before');
      const afterContent = await this.getFileContent(file, 'after');

      const fileType = classifyFile(file);
      const middlewareType = fileTypeToMiddlewareType(fileType);

      if (!middlewareType) continue;

      if (!this.isMiddlewareContent(beforeContent, middlewareType) &&
          !this.isMiddlewareContent(afterContent, middlewareType)) {
        continue;
      }

      const changeType = this.determineChangeType(beforeContent, afterContent);
      const className =
        this.extractMiddlewareClassName(afterContent, middlewareType) ??
        this.extractMiddlewareClassName(beforeContent, middlewareType) ??
        'Unknown';

      this.log(`Found ${middlewareType}: ${className} (${changeType})`);

      const info: MiddlewareInfo = {
        file,
        className,
        type: middlewareType,
      };

      changes.push({
        info,
        changeType,
        relatedPRs: this.getPRsForFile(file),
      });
    }

    return changes;
  }

  private readonly interfaceMap: Record<MiddlewareType, string> = {
    middleware: 'NestMiddleware',
    guard: 'CanActivate',
    interceptor: 'NestInterceptor',
    pipe: 'PipeTransform',
    filter: 'ExceptionFilter',
  };

  private isMiddlewareContent(content: string | null, type: MiddlewareType): boolean {
    if (!content) return false;

    try {
      const sourceFile = this.parseContent(content, 'middleware-check.ts');
      const interfaceName = this.interfaceMap[type];
      const classes = sourceFile.getClasses();

      return classes.some(cls => this.classImplements(cls, interfaceName));
    } catch {
      return false;
    }
  }

  private extractMiddlewareClassName(content: string | null, type: MiddlewareType): string | null {
    if (!content) return null;

    try {
      const sourceFile = this.parseContent(content, 'middleware-extract.ts');
      const interfaceName = this.interfaceMap[type];
      const classes = sourceFile.getClasses();

      const targetClass = classes.find(cls => this.classImplements(cls, interfaceName));
      return targetClass?.getName() ?? null;
    } catch {
      return null;
    }
  }
}
