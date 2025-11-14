// src/tools/project-analyzer/analyzers/components/LayerClassifier.ts
export type LayerType = 'presentation' | 'business' | 'data' | 'infrastructure' | 'unidentified';

export class LayerClassifier {
  private static readonly PRESENTATION_PATTERNS = {
    paths: ['/ui/', '/components/', '/views/', '/pages/', '/templates/', '/public/'],
    content: ['react', 'vue', 'angular', 'jsx', 'tsx', 'html', 'css', 'scss']
  };

  private static readonly BUSINESS_PATTERNS = {
    paths: ['/services/', '/usecases/', '/interactors/', '/business/', '/logic/', '/handlers/'],
    content: ['service', 'usecase', 'business logic', 'handler', 'controller', 'middleware']
  };

  private static readonly DATA_PATTERNS = {
    paths: ['/models/', '/entities/', '/repositories/', '/dao/', '/database/', '/migrations/'],
    content: ['model', 'entity', 'repository', 'database', 'schema', 'migration']
  };

  private static readonly INFRASTRUCTURE_PATTERNS = {
    paths: ['/config/', '/utils/', '/lib/', '/helpers/', '/infrastructure/', '/external/'],
    content: ['config', 'utility', 'helper', 'infrastructure', 'external service', 'api client']
  };

  classify(filePath: string, content: string): LayerType {
    const pathLower = filePath.toLowerCase();
    const contentLower = content.toLowerCase();

    // Check presentation layer
    if (this.matchesPatterns(pathLower, contentLower, LayerClassifier.PRESENTATION_PATTERNS)) {
      return 'presentation';
    }

    // Check business layer
    if (this.matchesPatterns(pathLower, contentLower, LayerClassifier.BUSINESS_PATTERNS)) {
      return 'business';
    }

    // Check data layer
    if (this.matchesPatterns(pathLower, contentLower, LayerClassifier.DATA_PATTERNS)) {
      return 'data';
    }

    // Check infrastructure layer
    if (this.matchesPatterns(pathLower, contentLower, LayerClassifier.INFRASTRUCTURE_PATTERNS)) {
      return 'infrastructure';
    }

    return 'unidentified';
  }

  private matchesPatterns(pathLower: string, contentLower: string, patterns: { paths: string[], content: string[] }): boolean {
    return patterns.paths.some(pattern => pathLower.includes(pattern)) ||
           patterns.content.some(pattern => contentLower.includes(pattern));
  }
}