import { BaseAnalyzer } from './base-analyzer.js';
import type { ControllerChange, EndpointInfo } from '../types/index.js';
import { classifyFile } from '../utils/file-classifier.js';
import { Node } from 'ts-morph';

export class ControllerAnalyzer extends BaseAnalyzer {
  private readonly httpMethods = ['Get', 'Post', 'Put', 'Delete', 'Patch'] as const;

  async analyze(): Promise<ControllerChange[]> {
    const changes: ControllerChange[] = [];

    const { added, deleted, modified } = await this.repo.getDiffFiles(
      this.options.days,
      this.options.branch
    );

    const controllerFiles = [...added, ...deleted, ...modified].filter(
      file => classifyFile(file) === 'controller'
    );

    for (const file of controllerFiles) {
      const beforeContent = await this.getFileContent(file, 'before');
      const afterContent = await this.getFileContent(file, 'after');

      if (!this.isControllerFile(beforeContent) && !this.isControllerFile(afterContent)) {
        continue;
      }

      const changeType = this.determineChangeType(beforeContent, afterContent);
      const className =
        this.extractControllerClassName(afterContent) ??
        this.extractControllerClassName(beforeContent) ??
        'Unknown';

      const basePath =
        this.extractBasePath(afterContent) ??
        this.extractBasePath(beforeContent) ??
        '/';

      const beforeEndpoints = this.extractEndpoints(beforeContent);
      const afterEndpoints = this.extractEndpoints(afterContent);

      this.log(`Found controller: ${className} (${changeType})`);

      changes.push({
        file,
        className,
        basePath,
        changeType,
        endpoints: {
          before: beforeEndpoints,
          after: afterEndpoints,
        },
        relatedPRs: this.getPRsForFile(file),
      });
    }

    return changes;
  }

  private isControllerFile(content: string | null): boolean {
    if (!content) return false;
    try {
      const sourceFile = this.parseContent(content, 'controller-check.ts');
      const cls = this.findClassWithDecorator(sourceFile, 'Controller');
      return cls !== undefined;
    } catch {
      return false;
    }
  }

  private extractControllerClassName(content: string | null): string | null {
    if (!content) return null;
    try {
      const sourceFile = this.parseContent(content, 'controller-extract.ts');
      const cls = this.findClassWithDecorator(sourceFile, 'Controller');
      return cls?.getName() ?? null;
    } catch {
      return null;
    }
  }

  private extractBasePath(content: string | null): string | null {
    if (!content) return null;

    try {
      const sourceFile = this.parseContent(content, 'controller-path.ts');
      const cls = this.findClassWithDecorator(sourceFile, 'Controller');
      if (!cls) return '/';

      const decorator = this.getDecorator(cls, 'Controller');
      if (!decorator) return '/';

      const args = decorator.getArguments();
      if (args.length === 0) return '/';

      const firstArg = args[0];

      // String literal: @Controller('path')
      if (Node.isStringLiteral(firstArg)) {
        const path = firstArg.getLiteralValue();
        return '/' + path.replace(/^\//, '');
      }

      // Object literal: @Controller({ path: 'xxx' })
      if (Node.isObjectLiteralExpression(firstArg)) {
        for (const prop of firstArg.getProperties()) {
          if (Node.isPropertyAssignment(prop) && prop.getName() === 'path') {
            const init = prop.getInitializer();
            if (init && Node.isStringLiteral(init)) {
              const path = init.getLiteralValue();
              return '/' + path.replace(/^\//, '');
            }
          }
        }
      }

      return '/';
    } catch {
      return '/';
    }
  }

  private extractEndpoints(content: string | null): EndpointInfo[] {
    if (!content) return [];

    try {
      const sourceFile = this.parseContent(content, 'controller-endpoints.ts');
      const cls = this.findClassWithDecorator(sourceFile, 'Controller');
      if (!cls) return [];

      const endpoints: EndpointInfo[] = [];
      const methods = cls.getMethods();

      for (const method of methods) {
        const decorators = method.getDecorators();

        for (const decorator of decorators) {
          const decoratorName = decorator.getName();

          if (!this.httpMethods.includes(decoratorName as typeof this.httpMethods[number])) {
            continue;
          }

          let path = '/';
          const args = decorator.getArguments();
          if (args.length > 0) {
            const firstArg = args[0];
            if (Node.isStringLiteral(firstArg)) {
              const pathValue = firstArg.getLiteralValue();
              path = pathValue ? '/' + pathValue.replace(/^\//, '') : '/';
            }
          }

          const handlerName = method.getName();

          endpoints.push({
            method: decoratorName.toUpperCase() as EndpointInfo['method'],
            path,
            handlerName,
          });
        }
      }

      return endpoints;
    } catch {
      return [];
    }
  }
}
