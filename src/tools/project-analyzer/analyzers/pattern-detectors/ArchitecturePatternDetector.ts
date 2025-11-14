import { RawProjectData, IdentifiedPattern } from '../../types/index.js';

export class ArchitecturePatternDetector {
  static detectLayeredArchitecture(files: any[]): { detected: boolean; confidence: number; evidence: string } {
    const presentationFiles = files.filter(f => this.isPresentationLayer(f.path)).length;
    const businessFiles = files.filter(f => this.isBusinessLayer(f.path)).length;
    const dataFiles = files.filter(f => this.isDataLayer(f.path)).length;

    const totalFiles = files.length;
    const layeredRatio = (presentationFiles + businessFiles + dataFiles) / totalFiles;

    return {
      detected: layeredRatio > 0.6,
      confidence: Math.min(1.0, layeredRatio),
      evidence: `${presentationFiles} presentation, ${businessFiles} business, ${dataFiles} data layer files detected`
    };
  }

  static detectMicroservicesPattern(files: any[]): { detected: boolean; confidence: number; evidence: string } {
    const serviceDirs = files.filter(f => f.path?.includes('/services/') || f.path?.includes('/microservices/')).length;
    const dockerFiles = files.filter(f => f.path?.includes('Dockerfile') || f.path?.includes('docker-compose')).length;
    const apiFiles = files.filter(f => f.path?.includes('swagger') || f.path?.includes('openapi')).length;

    const indicators = serviceDirs + dockerFiles + apiFiles;
    const confidence = Math.min(1.0, indicators / 5);

    return {
      detected: indicators >= 2,
      confidence,
      evidence: `${serviceDirs} service directories, ${dockerFiles} Docker files, ${apiFiles} API specs found`
    };
  }

  static detectMVCPattern(files: any[]): { detected: boolean; confidence: number; evidence: string } {
    const controllerFiles = files.filter(f => f.path?.toLowerCase().includes('controller')).length;
    const modelFiles = files.filter(f => f.path?.toLowerCase().includes('model')).length;
    const viewFiles = files.filter(f => f.path?.toLowerCase().includes('view') || f.path?.toLowerCase().includes('template')).length;

    const totalMVC = controllerFiles + modelFiles + viewFiles;
    const confidence = Math.min(1.0, totalMVC / (files.length * 0.3));

    return {
      detected: controllerFiles > 0 && modelFiles > 0,
      confidence,
      evidence: `${controllerFiles} controllers, ${modelFiles} models, ${viewFiles} views found`
    };
  }

  private static isPresentationLayer(path: string): boolean {
    const presentationPatterns = ['/controllers/', '/routes/', '/views/', '/templates/', '/public/', '/assets/'];
    return presentationPatterns.some(pattern => path.includes(pattern));
  }

  private static isBusinessLayer(path: string): boolean {
    const businessPatterns = ['/services/', '/business/', '/logic/', '/managers/', '/handlers/'];
    return businessPatterns.some(pattern => path.includes(pattern));
  }

  private static isDataLayer(path: string): boolean {
    const dataPatterns = ['/models/', '/entities/', '/repositories/', '/dao/', '/database/'];
    return dataPatterns.some(pattern => path.includes(pattern));
  }

  static analyzeArchitecturePatterns(data: RawProjectData): IdentifiedPattern[] {
    const patterns: IdentifiedPattern[] = [];
    const files = data.files || [];

    // Layered Architecture Pattern
    const layered = this.detectLayeredArchitecture(files);
    if (layered.detected) {
      patterns.push({
        pattern: 'Layered Architecture',
        confidence: layered.confidence,
        evidence: layered.evidence,
        implications: 'High separation of concerns, maintainable codebase',
        category: 'architectural'
      });
    }

    // Microservices Pattern
    const microservices = this.detectMicroservicesPattern(files);
    if (microservices.detected) {
      patterns.push({
        pattern: 'Microservices Architecture',
        confidence: microservices.confidence,
        evidence: microservices.evidence,
        implications: 'Scalable, independently deployable services',
        category: 'architectural'
      });
    }

    // MVC Pattern
    const mvc = this.detectMVCPattern(files);
    if (mvc.detected) {
      patterns.push({
        pattern: 'MVC Pattern',
        confidence: mvc.confidence,
        evidence: mvc.evidence,
        implications: 'Clear separation between data, presentation, and logic',
        category: 'architectural'
      });
    }

    return patterns;
  }
}