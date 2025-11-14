# DAP Configuration System Implementation

## Overview

Implementasi sistem konfigurasi DAP (Debug Adapter Protocol) di `.gibrun` untuk memberikan debugging experience yang konsisten dan dapat dikonfigurasi per project.

## 🎯 Implementation Goals

### Feature Completeness
- ✅ Project-specific DAP server configuration
- ✅ Language-specific debugger settings
- ✅ Environment-aware launch configurations
- ✅ Test runner integration
- ✅ Breakpoint & exception rules
- ✅ Watch expressions configuration

### Configuration Structure
```json
{
  "dap": {
    "enabled": true,
    "server": {
      "auto_detect": true,
      "preferred_host": "127.0.0.1",
      "port_range": { "start": 40000, "end": 50000 },
      "timeout": 30000,
      "retry_attempts": 3
    },
    "debugger": {
      "language": "go",
      "type": "delve",
      "version": "latest"
    },
    "launch_configs": {
      "default": { "program": "${workspaceFolder}/cmd/main.go" },
      "test": { "mode": "test" }
    },
    "environments": {
      "development": { "breakpoints": { "exception_breakpoints": ["panic"] } },
      "production": { "enabled": false }
    }
  }
}
```

## 🔧 Technical Implementation

### Phase 1: Configuration Loader (Week 1-2)

#### 1.1 DAP Configuration Manager
```typescript
// src/core/dap-config-manager.ts
export class DAPConfigManager {
  private configCache = new Map<string, DAPConfiguration>();
  private gibrunConfigLoader: GibRunConfigLoader;

  constructor() {
    this.gibrunConfigLoader = new GibRunConfigLoader();
  }

  async loadDAPConfig(projectRoot: string, environment?: string): Promise<DAPConfiguration> {
    const cacheKey = `${projectRoot}:${environment || 'default'}`;

    if (this.configCache.has(cacheKey)) {
      return this.configCache.get(cacheKey)!;
    }

    const gibrunConfig = await this.gibrunConfigLoader.loadConfig(projectRoot);

    // Extract DAP configuration
    const baseDapConfig = gibrunConfig.dap || {};
    const envDapConfig = environment ?
      gibrunConfig.environments?.[environment]?.dap || {} : {};

    // Merge configurations with environment override
    const mergedConfig = this.mergeConfigurations(baseDapConfig, envDapConfig);

    // Apply defaults
    const finalConfig = this.applyDefaults(mergedConfig);

    // Validate configuration
    await this.validateConfiguration(finalConfig);

    this.configCache.set(cacheKey, finalConfig);
    return finalConfig;
  }

  private mergeConfigurations(base: any, override: any): DAPConfiguration {
    // Deep merge with override taking precedence
    return {
      ...base,
      ...override,
      server: { ...base.server, ...override.server },
      debugger: { ...base.debugger, ...override.debugger },
      launch_configs: { ...base.launch_configs, ...override.launch_configs },
      environments: { ...base.environments, ...override.environments }
    };
  }

  private applyDefaults(config: any): DAPConfiguration {
    return {
      enabled: config.enabled ?? true,
      server: {
        auto_detect: config.server?.auto_detect ?? true,
        preferred_host: config.server?.preferred_host ?? '127.0.0.1',
        port_range: config.server?.port_range ?? { start: 40000, end: 50000 },
        timeout: config.server?.timeout ?? 30000,
        retry_attempts: config.server?.retry_attempts ?? 3,
        ...config.server
      },
      debugger: {
        language: config.debugger?.language ?? this.detectLanguageFromProject(),
        type: config.debugger?.type ?? this.getDefaultDebugger(config.debugger?.language),
        version: config.debugger?.version ?? 'latest',
        ...config.debugger
      },
      launch_configs: {
        default: this.getDefaultLaunchConfig(config.debugger?.language),
        ...config.launch_configs
      },
      environments: config.environments || {},
      test_integration: config.test_integration || {},
      breakpoints: config.breakpoints || {},
      watch_expressions: config.watch_expressions || []
    };
  }

  private async validateConfiguration(config: DAPConfiguration): Promise<void> {
    const errors: string[] = [];

    // Validate server configuration
    if (config.server.port_range.start >= config.server.port_range.end) {
      errors.push('Invalid port range: start must be less than end');
    }

    // Validate debugger configuration
    const supportedLanguages = ['go', 'python', 'javascript', 'typescript', 'java', 'csharp'];
    if (!supportedLanguages.includes(config.debugger.language)) {
      errors.push(`Unsupported language: ${config.debugger.language}`);
    }

    // Validate launch configurations
    for (const [name, launchConfig] of Object.entries(config.launch_configs)) {
      if (!launchConfig.type) {
        errors.push(`Launch config '${name}' missing type`);
      }
      if (!launchConfig.request || !['launch', 'attach'].includes(launchConfig.request)) {
        errors.push(`Launch config '${name}' has invalid request type`);
      }
    }

    if (errors.length > 0) {
      throw new Error(`DAP configuration validation failed:\n${errors.join('\n')}`);
    }
  }

  private detectLanguageFromProject(): string {
    // Detect primary language from project files
    // This would scan package.json, go.mod, etc.
    return 'go'; // Default fallback
  }

  private getDefaultDebugger(language: string): string {
    const debuggerMap: Record<string, string> = {
      'go': 'delve',
      'python': 'debugpy',
      'javascript': 'node',
      'typescript': 'node',
      'java': 'java-debug',
      'csharp': 'coreclr'
    };
    return debuggerMap[language] || 'unknown';
  }

  private getDefaultLaunchConfig(language: string): LaunchConfig {
    const configs: Record<string, LaunchConfig> = {
      'go': {
        name: 'Launch Go Application',
        type: 'go',
        request: 'launch',
        mode: 'debug',
        program: '${workspaceFolder}',
        env: {}
      },
      'python': {
        name: 'Launch Python Application',
        type: 'python',
        request: 'launch',
        program: '${workspaceFolder}/main.py',
        console: 'integratedTerminal'
      },
      'javascript': {
        name: 'Launch Node.js Application',
        type: 'node',
        request: 'launch',
        program: '${workspaceFolder}/index.js',
        skipFiles: ['<node_internals>/**']
      }
    };

    return configs[language] || {
      name: 'Launch Application',
      type: language,
      request: 'launch',
      program: '${workspaceFolder}'
    };
  }
}
```

#### 1.2 Launch Configuration Manager
```typescript
// src/core/launch-config-manager.ts
export class LaunchConfigManager {
  private dapConfigManager: DAPConfigManager;

  async getLaunchConfig(
    projectRoot: string,
    configName: string = 'default',
    environment?: string
  ): Promise<LaunchConfig> {
    const dapConfig = await this.dapConfigManager.loadDAPConfig(projectRoot, environment);

    if (!dapConfig.launch_configs[configName]) {
      throw new Error(`Launch configuration '${configName}' not found`);
    }

    const baseConfig = dapConfig.launch_configs[configName];

    // Apply environment-specific overrides
    const envConfig = environment ?
      dapConfig.environments[environment]?.launch_configs?.[configName] || {} : {};

    // Resolve variables
    const resolvedConfig = await this.resolveVariables(projectRoot, {
      ...baseConfig,
      ...envConfig
    });

    return resolvedConfig;
  }

  async getAllLaunchConfigs(
    projectRoot: string,
    environment?: string
  ): Promise<Record<string, LaunchConfig>> {
    const dapConfig = await this.dapConfigManager.loadDAPConfig(projectRoot, environment);

    const configs: Record<string, LaunchConfig> = {};

    for (const [name, config] of Object.entries(dapConfig.launch_configs)) {
      configs[name] = await this.getLaunchConfig(projectRoot, name, environment);
    }

    return configs;
  }

  private async resolveVariables(projectRoot: string, config: LaunchConfig): Promise<LaunchConfig> {
    const resolved = { ...config };

    // Resolve ${workspaceFolder} and other variables
    const variableResolvers: Record<string, (projectRoot: string) => string> = {
      'workspaceFolder': (root) => root,
      'workspaceRoot': (root) => root,
      'file': () => '', // Would be resolved at runtime
      'relativeFile': () => '', // Would be resolved at runtime
      'fileBasename': () => '', // Would be resolved at runtime
      'fileBasenameNoExtension': () => '', // Would be resolved at runtime
      'fileDirname': () => '', // Would be resolved at runtime
      'fileExtname': () => '', // Would be resolved at runtime
      'cwd': (root) => root,
      'lineNumber': () => '1', // Would be resolved at runtime
      'selectedText': () => '', // Would be resolved at runtime
      'execPath': () => process.execPath
    };

    // Resolve string values
    for (const [key, value] of Object.entries(resolved)) {
      if (typeof value === 'string') {
        resolved[key] = value.replace(/\$\{([^}]+)\}/g, (match, varName) => {
          const resolver = variableResolvers[varName];
          return resolver ? resolver(projectRoot) : match;
        });
      }
    }

    // Resolve nested objects (like env)
    if (resolved.env) {
      for (const [key, value] of Object.entries(resolved.env)) {
        if (typeof value === 'string') {
          resolved.env[key] = value.replace(/\$\{([^}]+)\}/g, (match, varName) => {
            const resolver = variableResolvers[varName];
            return resolver ? resolver(projectRoot) : match;
          });
        }
      }
    }

    return resolved;
  }
}
```

### Phase 2: DAP Tools Enhancement (Week 3-4)

#### 2.1 Enhanced DAP Multi-IDE Tools
```typescript
// Enhanced src/tools/dap/multi-ide-tools.ts
export async function handleDAPConfigureMultiIDE(dapService: DAPService, args: any) {
  const { ide_type, project_path, environment, use_config = true } = args;

  try {
    let finalConfig: any;

    if (use_config) {
      // Load configuration from .gibrun
      const configManager = new DAPConfigManager();
      const dapConfig = await configManager.loadDAPConfig(project_path, environment);

      // Get launch config
      const launchManager = new LaunchConfigManager();
      const launchConfig = await launchManager.getLaunchConfig(project_path, 'default', environment);

      finalConfig = {
        ide_type,
        project_path,
        environment,
        dap_config: dapConfig,
        launch_config: launchConfig,
        server_config: dapConfig.server,
        debugger_config: dapConfig.debugger
      };
    } else {
      // Fallback to auto-detection
      finalConfig = await generateAutoConfig(ide_type, project_path);
    }

    // Generate IDE-specific configuration files
    const generatedFiles = await generateIDEConfigFiles(ide_type, project_path, finalConfig);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          tool: "dap_configure_multi_ide",
          configuration: finalConfig,
          generated_files: generatedFiles,
          setup_instructions: getIDESetupInstructions(ide_type, finalConfig)
        }, null, 2)
      }]
    };

  } catch (error: any) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: false,
          tool: "dap_configure_multi_ide",
          error: error.message
        }, null, 2)
      }],
      isError: true
    };
  }
}

async function generateIDEConfigFiles(
  ide: string,
  projectPath: string,
  config: any
): Promise<string[]> {
  const generatedFiles: string[] = [];

  if (ide === 'vscode') {
    const launchConfig = {
      version: "0.2.0",
      configurations: [
        {
          name: config.launch_config.name,
          type: config.debugger_config.type,
          request: config.launch_config.request,
          mode: config.launch_config.mode || 'debug',
          program: config.launch_config.program,
          env: config.launch_config.env,
          args: config.launch_config.args,
          dapServer: {
            host: config.server_config.preferred_host,
            port: config.server_config.port_range.start
          }
        }
      ]
    };

    const configPath = path.join(projectPath, '.vscode', 'launch.json');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(launchConfig, null, 2));
    generatedFiles.push('.vscode/launch.json');
  }

  return generatedFiles;
}
```

#### 2.2 Test Integration Enhancement
```typescript
// Enhanced src/tools/dap/multi-ide-tools.ts
export async function handleDAPConfigureTestIntegration(dapService: DAPService, args: any) {
  const { project_path, environment, test_framework, auto_detect = true } = args;

  try {
    const configManager = new DAPConfigManager();
    const dapConfig = await configManager.loadDAPConfig(project_path, environment);

    let testConfig = dapConfig.test_integration;

    if (auto_detect || !testConfig) {
      testConfig = await autoDetectTestConfig(project_path);
    }

    // Override with provided parameters
    if (test_framework) {
      testConfig.framework = test_framework;
    }

    // Generate test launch configurations
    const testLaunchConfigs = generateTestLaunchConfigs(testConfig, dapConfig);

    // Update configuration
    dapConfig.test_integration = testConfig;
    dapConfig.launch_configs = {
      ...dapConfig.launch_configs,
      ...testLaunchConfigs
    };

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          tool: "dap_configure_test_integration",
          test_config: testConfig,
          launch_configs: testLaunchConfigs,
          instructions: getTestSetupInstructions(testConfig.framework)
        }, null, 2)
      }]
    };

  } catch (error: any) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: false,
          tool: "dap_configure_test_integration",
          error: error.message
        }, null, 2)
      }],
      isError: true
    };
  }
}

function generateTestLaunchConfigs(testConfig: any, dapConfig: any): Record<string, LaunchConfig> {
  const configs: Record<string, LaunchConfig> = {};

  if (testConfig.framework === 'go') {
    configs.test = {
      name: 'Debug Go Tests',
      type: 'go',
      request: 'launch',
      mode: 'test',
      program: '${workspaceFolder}',
      args: ['-test.v', '-test.run', '${selectedTest}'],
      env: testConfig.env || {}
    };

    configs.test_all = {
      name: 'Debug All Go Tests',
      type: 'go',
      request: 'launch',
      mode: 'test',
      program: '${workspaceFolder}',
      args: ['-test.v', './...'],
      env: testConfig.env || {}
    };
  }

  return configs;
}
```

### Phase 3: Advanced Features (Week 5-6)

#### 3.1 Breakpoint & Exception Manager
```typescript
// src/core/breakpoint-manager.ts
export class BreakpointManager {
  private dapConfigManager: DAPConfigManager;

  async getBreakpointConfig(projectRoot: string, environment?: string): Promise<BreakpointConfig> {
    const dapConfig = await this.dapConfigManager.loadDAPConfig(projectRoot, environment);

    return {
      default_enabled: dapConfig.breakpoints?.default_enabled ?? true,
      exception_breakpoints: dapConfig.breakpoints?.exception_breakpoints || [],
      conditional_breakpoints: dapConfig.breakpoints?.conditional_breakpoints || [],
      function_breakpoints: dapConfig.breakpoints?.function_breakpoints || [],
      data_breakpoints: dapConfig.breakpoints?.data_breakpoints || []
    };
  }

  async applyBreakpointConfig(dapService: DAPService, config: BreakpointConfig): Promise<void> {
    // Set exception breakpoints
    if (config.exception_breakpoints.length > 0) {
      await dapService.sendDAPRequest('host', 'port', 'setExceptionBreakpoints', {
        filters: config.exception_breakpoints
      });
    }

    // Set function breakpoints
    if (config.function_breakpoints.length > 0) {
      for (const funcName of config.function_breakpoints) {
        await dapService.sendDAPRequest('host', 'port', 'setFunctionBreakpoints', {
          breakpoints: [{ name: funcName }]
        });
      }
    }

    // Additional breakpoint configuration...
  }
}
```

#### 3.2 Watch Expression Manager
```typescript
// src/core/watch-expression-manager.ts
export class WatchExpressionManager {
  private dapConfigManager: DAPConfigManager;

  async getWatchExpressions(projectRoot: string, environment?: string): Promise<WatchExpression[]> {
    const dapConfig = await this.dapConfigManager.loadDAPConfig(projectRoot, environment);

    const expressions: WatchExpression[] = [];

    // Add global expressions
    if (dapConfig.watch_expressions?.global) {
      expressions.push(...dapConfig.watch_expressions.global.map(expr => ({
        expression: expr,
        scope: 'global',
        enabled: true
      })));
    }

    // Add context-specific expressions
    if (dapConfig.watch_expressions?.context_specific) {
      for (const [context, exprs] of Object.entries(dapConfig.watch_expressions.context_specific)) {
        expressions.push(...(exprs as string[]).map(expr => ({
          expression: expr,
          scope: context,
          enabled: true
        })));
      }
    }

    return expressions;
  }

  async applyWatchExpressions(dapService: DAPService, expressions: WatchExpression[]): Promise<void> {
    for (const expr of expressions) {
      if (expr.enabled) {
        await dapService.sendDAPRequest('host', 'port', 'setExpression', {
          expression: expr.expression,
          context: expr.scope
        });
      }
    }
  }
}
```

### Phase 4: Integration & Testing (Week 7-8)

#### 4.1 Configuration Validation
```typescript
// src/core/dap-config-validator.ts
export class DAPConfigValidator {
  async validateConfiguration(config: DAPConfiguration): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate server configuration
    if (config.server) {
      if (config.server.port_range.start >= config.server.port_range.end) {
        errors.push('Port range start must be less than end');
      }
      if (config.server.timeout < 1000) {
        warnings.push('Server timeout is very low, may cause issues');
      }
    }

    // Validate debugger configuration
    if (config.debugger) {
      const supportedDebuggers = this.getSupportedDebuggers(config.debugger.language);
      if (!supportedDebuggers.includes(config.debugger.type)) {
        errors.push(`Debugger '${config.debugger.type}' not supported for language '${config.debugger.language}'`);
      }
    }

    // Validate launch configurations
    if (config.launch_configs) {
      for (const [name, launchConfig] of Object.entries(config.launch_configs)) {
        if (!launchConfig.type) {
          errors.push(`Launch config '${name}' missing type`);
        }
        if (!['launch', 'attach'].includes(launchConfig.request)) {
          errors.push(`Launch config '${name}' has invalid request type`);
        }
      }
    }

    // Validate environment configurations
    if (config.environments) {
      for (const [envName, envConfig] of Object.entries(config.environments)) {
        if (envConfig.dap?.enabled === false && envConfig.dap?.reason) {
          // Valid - debugging disabled for this environment
          continue;
        }
        // Validate environment-specific DAP config
        const envValidation = await this.validateConfiguration(envConfig.dap || {});
        errors.push(...envValidation.errors.map(err => `[${envName}] ${err}`));
        warnings.push(...envValidation.warnings.map(warn => `[${envName}] ${warn}`));
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private getSupportedDebuggers(language: string): string[] {
    const debuggerMap: Record<string, string[]> = {
      'go': ['delve'],
      'python': ['debugpy', 'python'],
      'javascript': ['node', 'chrome'],
      'typescript': ['node'],
      'java': ['java-debug', 'jdwp'],
      'csharp': ['coreclr', 'clr']
    };
    return debuggerMap[language] || [];
  }
}
```

#### 4.2 Integration Tests
```typescript
// test/integration/dap-config-integration.test.ts
describe('DAP Configuration Integration', () => {
  let configManager: DAPConfigManager;
  let projectRoot: string;

  beforeEach(() => {
    configManager = new DAPConfigManager();
    projectRoot = '/tmp/test-project';
  });

  test('should load DAP config from .gibrun', async () => {
    // Create test .gibrun config
    const configPath = path.join(projectRoot, '.gibrun', 'config.json');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify({
      dap: {
        debugger: { language: 'go', type: 'delve' },
        launch_configs: {
          default: { program: '${workspaceFolder}/main.go' }
        }
      }
    }));

    const config = await configManager.loadDAPConfig(projectRoot);

    expect(config.debugger.language).toBe('go');
    expect(config.debugger.type).toBe('delve');
    expect(config.launch_configs.default.program).toBe('${workspaceFolder}/main.go');
  });

  test('should apply environment overrides', async () => {
    const configPath = path.join(projectRoot, '.gibrun', 'config.json');
    await fs.writeFile(configPath, JSON.stringify({
      dap: {
        debugger: { language: 'go', type: 'delve' }
      },
      environments: {
        production: {
          dap: {
            enabled: false,
            reason: 'Production debugging disabled'
          }
        }
      }
    }));

    const prodConfig = await configManager.loadDAPConfig(projectRoot, 'production');

    expect(prodConfig.enabled).toBe(false);
    expect(prodConfig.reason).toBe('Production debugging disabled');
  });

  test('should validate configuration', async () => {
    const validator = new DAPConfigValidator();

    const validConfig: DAPConfiguration = {
      enabled: true,
      server: { auto_detect: true, preferred_host: '127.0.0.1', port_range: { start: 40000, end: 50000 } },
      debugger: { language: 'go', type: 'delve' },
      launch_configs: { default: { name: 'Launch', type: 'go', request: 'launch' } }
    };

    const result = await validator.validateConfiguration(validConfig);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
```

## 📊 Success Metrics Validation

### Configuration Loading Performance
```typescript
// Benchmark configuration loading
async function benchmarkConfigLoading() {
  const startTime = Date.now();

  // Load config 100 times
  for (let i = 0; i < 100; i++) {
    await configManager.loadDAPConfig(projectRoot);
  }

  const avgTime = (Date.now() - startTime) / 100;
  expect(avgTime).toBeLessThan(50); // < 50ms average
}
```

### Launch Configuration Resolution
```typescript
// Test variable resolution
test('should resolve launch config variables', async () => {
  const launchManager = new LaunchConfigManager();
  const config = await launchManager.getLaunchConfig(projectRoot, 'default');

  expect(config.program).toBe(projectRoot); // ${workspaceFolder} resolved
  expect(config.env.NODE_ENV).toBe('development'); // Variables resolved
});
```

## 🚀 Deployment & Migration

### Migration Strategy
```typescript
// Migration script for existing projects
async function migrateToDAPConfig() {
  console.log('Migrating to DAP configuration system...');

  // 1. Detect existing DAP configurations
  const existingConfigs = await detectExistingDAPConfigs(projectRoot);

  // 2. Generate .gibrun DAP configuration
  const dapConfig = generateDAPConfigFromExisting(existingConfigs);

  // 3. Validate generated configuration
  const validator = new DAPConfigValidator();
  const validation = await validator.validateConfiguration(dapConfig);

  if (!validation.valid) {
    throw new Error(`Generated config is invalid: ${validation.errors.join(', ')}`);
  }

  // 4. Save configuration
  await saveDAPConfig(projectRoot, dapConfig);

  // 5. Update documentation
  await updateDAPDocumentation(projectRoot);

  console.log('DAP configuration migration completed!');
}
```

### Rollback Plan
- Keep backup of existing configurations
- Provide command to disable .gibrun DAP config
- Fall back to auto-detection if config is invalid

---

**DAP Configuration System implementation akan memberikan debugging experience yang konsisten dan dapat dikonfigurasi per project!** 🚀