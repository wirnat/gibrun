import { RawProjectData, IdentifiedPattern } from '../../types/index.js';

export class QualityPatternDetector {
  static detectCleanCodePattern(data: RawProjectData): { detected: boolean; confidence: number; evidence: string } {
    const files = data.files || [];

    // Analyze code quality indicators
    let totalFunctions = 0;
    let smallFunctions = 0;
    let meaningfulNames = 0;
    let totalFiles = 0;

    files.forEach(file => {
      if (file.content && (file.language === 'typescript' || file.language === 'javascript')) {
        totalFiles++;

        // Count functions
        const functionMatches = file.content.match(/function\s+\w+\s*\(|const\s+\w+\s*=\s*\([^)]*\)\s*=>|\w+\s*\([^)]*\)\s*{/g);
        if (functionMatches) {
          totalFunctions += functionMatches.length;

          // Check for small functions (rough heuristic)
          functionMatches.forEach(match => {
            const funcStart = file.content.indexOf(match);
            if (funcStart !== -1) {
              const funcEnd = this.findFunctionEnd(file.content, funcStart);
              if (funcEnd !== -1) {
                const funcLength = funcEnd - funcStart;
                if (funcLength < 1000) { // Less than ~30 lines
                  smallFunctions++;
                }
              }
            }
          });
        }

        // Check for meaningful variable names (rough heuristic)
        const varMatches = file.content.match(/\b(?:let|const|var)\s+(\w+)\s*=/g);
        if (varMatches) {
          varMatches.forEach(match => {
            const varName = match.match(/\b(?:let|const|var)\s+(\w+)\s*=/)?.[1];
            if (varName && varName.length > 2 && !varName.includes('_')) {
              meaningfulNames++;
            }
          });
        }
      }
    });

    const smallFunctionRatio = smallFunctions / Math.max(totalFunctions, 1);
    const meaningfulNameRatio = meaningfulNames / Math.max(totalFiles * 10, 1); // Assume ~10 variables per file

    const indicators = smallFunctionRatio + meaningfulNameRatio;
    const confidence = Math.min(1.0, indicators / 2);

    return {
      detected: indicators >= 0.5,
      confidence,
      evidence: `${(smallFunctionRatio * 100).toFixed(1)}% small functions, ${(meaningfulNameRatio * 100).toFixed(1)}% meaningful names`
    };
  }

  static analyzeQualityPatterns(data: RawProjectData): IdentifiedPattern[] {
    const patterns: IdentifiedPattern[] = [];

    // Clean Code Pattern
    const cleanCode = this.detectCleanCodePattern(data);
    if (cleanCode.detected) {
      patterns.push({
        pattern: 'Clean Code Practices',
        confidence: cleanCode.confidence,
        evidence: cleanCode.evidence,
        implications: 'Maintainable, readable, and extensible codebase',
        category: 'quality'
      });
    }

    return patterns;
  }

  private static findFunctionEnd(content: string, startIndex: number): number {
    let braceCount = 0;
    let inString = false;
    let stringChar = '';

    for (let i = startIndex; i < content.length; i++) {
      const char = content[i];

      if ((char === '"' || char === "'") && content[i - 1] !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
          stringChar = '';
        }
        continue;
      }

      if (inString) continue;

      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          return i;
        }
      }
    }

    return -1;
  }
}