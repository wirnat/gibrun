// src/tools/project-analyzer/collectors/GitHistoryCollector.ts
import { promises as fs } from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { AnalysisScope, GitCommit, DataCollector, CollectedData } from '@analyzer-types/index.js';

const execAsync = promisify(exec);

export class GitHistoryCollector implements DataCollector {
  private projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
  }

  async collect(scope: AnalysisScope = 'full'): Promise<CollectedData> {
    const startTime = Date.now();

    try {
      // Check if this is a git repository
      const isGitRepo = await this.isGitRepository();
      if (!isGitRepo) {
        return {
          gitHistory: [],
          metadata: {
            isGitRepository: false,
            collectionTime: Date.now() - startTime,
            scope
          }
        };
      }

      const commits = await this.collectGitHistory(scope);
      const collectionTime = Date.now() - startTime;

      return {
        gitHistory: commits,
        metadata: {
          isGitRepository: true,
          totalCommits: commits.length,
          collectionTime,
          scope,
          dateRange: this.getDateRange(commits)
        }
      };

    } catch (error: any) {
      console.error('Git history collection failed:', error);
      // Don't throw error for git collection, just return empty data
      return {
        gitHistory: [],
        metadata: {
          isGitRepository: false,
          collectionTime: Date.now() - startTime,
          scope,
          error: error?.message || 'Unknown error'
        }
      };
    }
  }

  private async isGitRepository(): Promise<boolean> {
    try {
      const gitDir = path.join(this.projectRoot, '.git');
      await fs.access(gitDir);
      return true;
    } catch {
      return false;
    }
  }

  private async collectGitHistory(scope: AnalysisScope): Promise<GitCommit[]> {
    const commits: GitCommit[] = [];

    try {
      // Get commit history with detailed information
      const format = '--pretty=format:%H|%an|%ae|%ad|%s|%w(0,0,0)';
      const dateFormat = '--date=iso';

      let command = `git log ${format} ${dateFormat} --numstat`;

      // Limit commits based on scope
      switch (scope) {
        case 'incremental':
          command += ' --since="1 week ago"';
          break;
        case 'module':
          command += ' --since="1 month ago"';
          break;
        case 'full':
        default:
          command += ' --since="6 months ago"'; // Limit for performance
          break;
      }

      const { stdout } = await execAsync(command, {
        cwd: this.projectRoot,
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      const lines = stdout.split('\n');
      let currentCommit: Partial<GitCommit> | null = null;

      for (const line of lines) {
        if (line.trim() === '') continue;

        // Check if this is a commit header line (contains | separators)
        if (line.includes('|') && !line.match(/^\d+\t\d+\t/)) {
          // Save previous commit if exists
          if (currentCommit && currentCommit.hash) {
            commits.push(currentCommit as GitCommit);
          }

          // Parse new commit header
          const parts = line.split('|');
          if (parts.length >= 5) {
            currentCommit = {
              hash: parts[0],
              author: parts[1],
              email: parts[2],
              date: new Date(parts[3]),
              message: parts[4],
              changes: [],
              filesChanged: 0,
              insertions: 0,
              deletions: 0
            };
          }
        } else if (currentCommit && line.match(/^\d+\t\d+\t/)) {
          // This is a file change line: insertions	deletions	filename
          const parts = line.split('\t');
          if (parts.length >= 3) {
            const insertions = parseInt(parts[0]) || 0;
            const deletions = parseInt(parts[1]) || 0;
            const filename = parts[2];

            currentCommit.changes!.push(filename);
            currentCommit.insertions! += insertions;
            currentCommit.deletions! += deletions;
            currentCommit.filesChanged! += 1;
          }
        }
      }

      // Add the last commit
      if (currentCommit && currentCommit.hash) {
        commits.push(currentCommit as GitCommit);
      }

    } catch (error) {
      console.warn('Failed to collect git history:', error);
    }

    return commits;
  }

  private getDateRange(commits: GitCommit[]): { start?: Date; end?: Date } {
    if (commits.length === 0) return {};

    const dates = commits.map(c => c.date.getTime());
    return {
      start: new Date(Math.min(...dates)),
      end: new Date(Math.max(...dates))
    };
  }

  // Additional method to get branch information
  async getBranchInfo(): Promise<{ current: string; branches: string[] }> {
    try {
      // Get current branch
      const { stdout: currentBranch } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: this.projectRoot
      });

      // Get all branches
      const { stdout: allBranches } = await execAsync('git branch -a', {
        cwd: this.projectRoot
      });

      const branches = allBranches
        .split('\n')
        .map(line => line.trim().replace(/^\*\s*/, ''))
        .filter(line => line.length > 0);

      return {
        current: currentBranch.trim(),
        branches
      };
    } catch (error) {
      return { current: 'unknown', branches: [] };
    }
  }

  // Method to get contributor statistics
  async getContributorStats(): Promise<{ [email: string]: { commits: number; insertions: number; deletions: number } }> {
    const commits = await this.collectGitHistory('full');
    const stats: { [email: string]: { commits: number; insertions: number; deletions: number } } = {};

    for (const commit of commits) {
      const email = commit.email;
      if (!stats[email]) {
        stats[email] = { commits: 0, insertions: 0, deletions: 0 };
      }

      stats[email].commits += 1;
      stats[email].insertions += commit.insertions;
      stats[email].deletions += commit.deletions;
    }

    return stats;
  }
}