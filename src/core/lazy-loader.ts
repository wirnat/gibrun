import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { logError } from "@/services/logger-service.js";

// Configuration for conditional loading
export const ENABLE_FILE_SYSTEM = process.env.ENABLE_FILE_SYSTEM !== 'false'; // Default true
export const ENABLE_PROJECT_ANALYZER = process.env.ENABLE_PROJECT_ANALYZER !== 'false'; // Default true
export const ENABLE_DATABASE = process.env.ENABLE_DATABASE !== 'false'; // Default true
export const ENABLE_HTTP = process.env.ENABLE_HTTP !== 'false'; // Default true
export const ENABLE_DAP = process.env.ENABLE_DAP !== 'false'; // Default true

// Tool loaders - dynamic imports for lazy loading
const toolLoaders: Record<string, () => Promise<any>> = {
  fileSystem: () => import("@/tools/file-system/index.js"),
  projectAnalyzer: () => import("@/tools/project-analyzer/index.js"),
  dap: () => import("@/services/dap-service.js"),
};

// Service cache for lazy initialization
const services = new Map<string, any>();

// Lazy service initialization
export async function getService(name: string): Promise<any> {
  if (!services.has(name)) {
    switch (name) {
      case 'database':
        if (!ENABLE_DATABASE) throw new Error('Database service is disabled');
        const { DatabaseService } = await import("@/services/database-service.js");
        services.set(name, new DatabaseService());
        break;
      case 'http':
        if (!ENABLE_HTTP) throw new Error('HTTP service is disabled');
        const { HttpService } = await import("@/services/http-service.js");
        services.set(name, new HttpService());
        break;
      case 'projectAnalyzer':
        if (!ENABLE_PROJECT_ANALYZER) throw new Error('Project analyzer is disabled');
        const { ProjectAnalyzerTool } = await import("@/tools/project-analyzer/index.js");
        services.set(name, new ProjectAnalyzerTool());
        break;
      case 'dap':
        if (!ENABLE_DAP) throw new Error('DAP service is disabled');
        const { GoDebuggerProxy } = await import("@/services/dap-service.js");
        services.set(name, new GoDebuggerProxy(process.cwd()));
        break;
    }
  }
  return services.get(name);
}

// Lazy tool loading
export async function loadTool(category: string): Promise<any> {
  const loader = toolLoaders[category];
  if (!loader) return null;

  try {
    const module = await loader();
    return module.default || module;
  } catch (error) {
    logError(`Failed to load tool category: ${category}`, error);
    return null;
  }
}

// Load enabled tools based on configuration
export async function loadEnabledTools(): Promise<Tool[]> {
  const tools: Tool[] = [];

  // Load file system tools
  if (ENABLE_FILE_SYSTEM) {
    try {
      const fsModule = await loadTool('fileSystem');
      if (fsModule && fsModule.FILE_SYSTEM_TOOLS) {
        tools.push(...fsModule.FILE_SYSTEM_TOOLS);
      }
    } catch (error) {
      logError('Failed to load file system tools', error);
    }
  }

  // Load project analyzer tools
  if (ENABLE_PROJECT_ANALYZER) {
    try {
      const paModule = await loadTool('projectAnalyzer');
      if (paModule && paModule.ProjectAnalyzerTool) {
        const projectAnalyzerTool = new paModule.ProjectAnalyzerTool();
        tools.push(...projectAnalyzerTool.getTools());
      }
    } catch (error) {
      logError('Failed to load project analyzer tools', error);
    }
  }

  return tools;
}

// Tool handler type for future extension
export type ToolHandler = (args: any) => Promise<any>;