import simpleGit, { type SimpleGit, type LogResult, type DiffResult } from 'simple-git';

export interface CommitInfo {
  hash: string;
  date: string;
  message: string;
  author: string;
}

export interface FileChange {
  file: string;
  changeType: 'added' | 'deleted' | 'modified' | 'renamed';
  oldFile?: string;
}

export interface DiffInfo {
  commits: CommitInfo[];
  changedFiles: FileChange[];
}

export class GitRepository {
  private git: SimpleGit;
  private repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
    this.git = simpleGit(repoPath);
  }

  async isGitRepository(): Promise<boolean> {
    try {
      await this.git.revparse(['--git-dir']);
      return true;
    } catch {
      return false;
    }
  }

  async getCommitsSince(days: number, branch?: string): Promise<CommitInfo[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split('T')[0];

    const options: string[] = ['--since', sinceStr];
    if (branch) {
      options.push(branch);
    }

    const log: LogResult = await this.git.log(options);

    return log.all.map(commit => ({
      hash: commit.hash,
      date: commit.date,
      message: commit.message,
      author: commit.author_name,
    }));
  }

  async getChangedFilesSince(days: number, branch?: string): Promise<FileChange[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split('T')[0];

    // 最も古いコミットのハッシュを取得
    const logOptions: string[] = ['--since', sinceStr, '--reverse'];
    if (branch) {
      logOptions.push(branch);
    }
    const log = await this.git.log(logOptions);

    if (log.all.length === 0) {
      return [];
    }

    const oldestHash = log.all[0].hash;
    const latestHash = log.latest?.hash ?? 'HEAD';

    // diff --name-status で変更種別を取得
    const diffSummary = await this.git.diffSummary([`${oldestHash}^`, latestHash]);

    const files: FileChange[] = [];
    for (const file of diffSummary.files) {
      let changeType: FileChange['changeType'] = 'modified';

      if ('insertions' in file && 'deletions' in file) {
        // DiffResultTextFile
        if (file.insertions > 0 && file.deletions === 0 && file.changes === file.insertions) {
          // 全部追加の場合、新規ファイルの可能性が高い
          // ただしdiffSummaryでは正確に判断できないため、別途確認
        }
      }

      files.push({
        file: file.file,
        changeType,
      });
    }

    return files;
  }

  async getFileContentAt(filePath: string, ref: string): Promise<string | null> {
    try {
      const content = await this.git.show([`${ref}:${filePath}`]);
      return content;
    } catch {
      return null;
    }
  }

  async getCurrentFileContent(filePath: string): Promise<string | null> {
    return this.getFileContentAt(filePath, 'HEAD');
  }

  async getOldestCommitHashSince(days: number, branch?: string): Promise<string | null> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split('T')[0];

    const logOptions: string[] = ['--since', sinceStr, '--reverse'];
    if (branch) {
      logOptions.push(branch);
    }
    const log = await this.git.log(logOptions);

    if (log.all.length === 0) {
      return null;
    }

    return log.all[0].hash;
  }

  async getFileContentBefore(filePath: string, days: number, branch?: string): Promise<string | null> {
    const oldestHash = await this.getOldestCommitHashSince(days, branch);
    if (!oldestHash) {
      return null;
    }

    // oldestHashの親コミットでのファイル内容を取得
    try {
      const content = await this.git.show([`${oldestHash}^:${filePath}`]);
      return content;
    } catch {
      // ファイルが存在しなかった場合
      return null;
    }
  }

  async getDiffFiles(days: number, branch?: string): Promise<{
    added: string[];
    deleted: string[];
    modified: string[];
    renamed: Array<{ from: string; to: string }>;
  }> {
    // git log --name-status で期間中に変更された全ファイルを取得
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split('T')[0];

    const options = ['log', '--name-status', '--since', sinceStr, '--pretty=format:'];
    if (branch) {
      options.push(branch);
    }

    let raw: string;
    try {
      raw = await this.git.raw(options);
    } catch {
      return { added: [], deleted: [], modified: [], renamed: [] };
    }

    // ファイル名を収集（重複を除去）
    const fileSet = new Set<string>();
    // リネーム情報を収集（from -> to の最終状態）
    const renameMap = new Map<string, string>(); // oldPath -> newPath

    const lines = raw.trim().split('\n').filter(Boolean);
    for (const line of lines) {
      const parts = line.split('\t');
      const status = parts[0];

      if (status.startsWith('R')) {
        // リネームの場合: R100\toldPath\tnewPath
        const oldPath = parts[1];
        const newPath = parts[2];
        if (oldPath && newPath) {
          fileSet.add(oldPath);
          fileSet.add(newPath);
          // リネームチェインを解決: A->B, B->C の場合、A->C にする
          let originalPath = oldPath;
          for (const [from, to] of renameMap.entries()) {
            if (to === oldPath) {
              originalPath = from;
              break;
            }
          }
          renameMap.set(originalPath, newPath);
        }
      } else if (parts.length >= 2) {
        fileSet.add(parts[1]);
      }
    }

    // 期間開始前と現在でファイルの存在を確認し、変更種別を判定
    const oldestHash = await this.getOldestCommitHashSince(days, branch);
    const added: string[] = [];
    const deleted: string[] = [];
    const modified: string[] = [];
    const renamed: Array<{ from: string; to: string }> = [];

    // リネームされたファイルを処理
    const processedFiles = new Set<string>();
    for (const [from, to] of renameMap.entries()) {
      const existedBefore = oldestHash ? await this.fileExistsAt(from, `${oldestHash}^`) : false;
      const existsNow = await this.fileExistsAt(to, 'HEAD');

      if (existedBefore && existsNow) {
        renamed.push({ from, to });
        processedFiles.add(from);
        processedFiles.add(to);
      }
    }

    // 残りのファイルを処理
    for (const file of fileSet) {
      if (processedFiles.has(file)) continue;

      const existedBefore = oldestHash ? await this.fileExistsAt(file, `${oldestHash}^`) : false;
      const existsNow = await this.fileExistsAt(file, 'HEAD');

      if (!existedBefore && existsNow) {
        added.push(file);
      } else if (existedBefore && !existsNow) {
        deleted.push(file);
      } else if (existedBefore && existsNow) {
        modified.push(file);
      }
      // 両方falseの場合は、期間中に追加→削除されたファイル（無視）
    }

    return { added, deleted, modified, renamed };
  }

  private async fileExistsAt(filePath: string, ref: string): Promise<boolean> {
    try {
      await this.git.show([`${ref}:${filePath}`]);
      return true;
    } catch {
      return false;
    }
  }

  getRepoPath(): string {
    return this.repoPath;
  }
}
