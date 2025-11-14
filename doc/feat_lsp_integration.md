# LSP Integration Feature

## Overview

LSP Integration adalah fitur untuk mengintegrasikan gibRun MCP Server dengan Language Server Protocol (LSP) guna memberikan real-time code intelligence dan multi-editor support.

## 🎯 Problem Statement

### Current Challenges
- Tidak ada real-time analysis saat user mengetik
- Limited IDE integration hanya untuk VS Code
- Tidak ada native code intelligence features
- Sulit untuk support multiple editors
- User experience tidak seamless dengan development workflow

### Solution
LSP Integration memberikan:
- Real-time diagnostics dan code intelligence
- Support untuk semua LSP-compatible editors
- Native IDE integration dengan existing features
- Incremental analysis untuk better performance
- Standardized protocol untuk code intelligence

## 🔧 Technical Architecture

### Hybrid MCP+LSP Architecture

#### Core Components
```typescript
// LSP Bridge - Main integration point
export class LSPBridge {
  private mcpClient: MCPClient;
  private lspServer: LSPServer;
  private analysisCache: AnalysisCache;
  private incrementalAnalyzer: IncrementalAnalyzer;
}

// MCP-LSP Communication Flow
User → Editor → LSP Protocol → LSP Bridge → MCP Protocol → gibRun Server
       ↓                                              ↓
Real-time LSP features                      Deep project analysis
(diagnostics, hover, actions)              (architecture, dependencies)
```

#### LSP Server Implementation
```typescript
export class GibRunLSPServer {
  // LSP Capabilities
  capabilities = {
    textDocumentSync: TextDocumentSyncKind.Incremental,
    diagnosticProvider: {
      interFileDependencies: true,
      workspaceDiagnostics: true
    },
    codeActionProvider: true,
    hoverProvider: true,
    definitionProvider: true,
    referencesProvider: true,
    documentSymbolProvider: true,
    workspaceSymbolProvider: true
  };

  // Core LSP Methods
  async initialize(params: InitializeParams): Promise<InitializeResult> {
    // Initialize MCP connection
    await this.mcpClient.connect();

    // Setup incremental analysis
    this.incrementalAnalyzer.initialize(params.rootUri);

    return {
      capabilities: this.capabilities,
      serverInfo: {
        name: 'gibRun LSP Server',
        version: '1.0.0'
      }
    };
  }

  async didOpenTextDocument(params: DidOpenTextDocumentParams): Promise<void> {
    const uri = params.textDocument.uri;
    const content = params.textDocument.text;

    // Immediate syntax analysis
    const diagnostics = await this.analyzeDocument(uri, content);
    this.publishDiagnostics(uri, diagnostics);

    // Queue deep analysis
    this.incrementalAnalyzer.queueAnalysis(uri);
  }

  async didChangeTextDocument(params: DidChangeTextDocumentParams): Promise<void> {
    const uri = params.textDocument.uri;

    // Incremental analysis for changed content
    const diagnostics = await this.analyzeIncremental(uri, params.contentChanges);
    this.publishDiagnostics(uri, diagnostics);
  }
}
```

### Incremental Analysis Engine

#### Change Detection & Analysis
```typescript
export class IncrementalAnalyzer {
  private changeQueue: Map<string, ChangeBatch> = new Map();
  private analysisDebounce: Map<string, NodeJS.Timeout> = new Map();

  async queueAnalysis(uri: string): Promise<void> {
    // Clear existing debounce
    const existingTimeout = this.analysisDebounce.get(uri);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Debounce analysis to avoid excessive calls
    const timeout = setTimeout(async () => {
      await this.performIncrementalAnalysis(uri);
    }, 500); // 500ms debounce

    this.analysisDebounce.set(uri, timeout);
  }

  private async performIncrementalAnalysis(uri: string): Promise<void> {
    try {
      // Get change batch
      const changes = this.changeQueue.get(uri) || [];
      this.changeQueue.delete(uri);

      // Determine analysis scope
      const scope = this.determineAnalysisScope(uri, changes);

      // Perform appropriate analysis
      switch (scope) {
        case 'file':
          await this.analyzeFile(uri);
          break;
        case 'module':
          await this.analyzeModule(uri);
          break;
        case 'project':
          await this.analyzeProject(uri);
          break;
      }

    } catch (error) {
      console.error('Incremental analysis failed:', error);
    }
  }

  private determineAnalysisScope(uri: string, changes: TextDocumentContentChangeEvent[]): AnalysisScope {
    // Simple heuristics for scope determination
    if (changes.length === 0) return 'file';

    // Check if structural changes (imports, exports, etc.)
    const hasStructuralChanges = changes.some(change =>
      this.isStructuralChange(change.text)
    );

    if (hasStructuralChanges) return 'module';

    // Check if changes affect multiple files
    const affectedFiles = this.getAffectedFiles(uri, changes);
    if (affectedFiles.length > 1) return 'project';

    return 'file';
  }
}
```

### MCP-LSP Data Transformation

#### Diagnostics Conversion
```typescript
export class DiagnosticsConverter {
  async convertMCPToLSP(mcpResult: MCPToolResult, uri: string): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    if (!mcpResult.success || !mcpResult.data) {
      return diagnostics;
    }

    // Convert based on analysis type
    switch (mcpResult.operation) {
      case 'architecture':
        diagnostics.push(...this.convertArchitectureDiagnostics(mcpResult.data, uri));
        break;
      case 'quality':
        diagnostics.push(...this.convertQualityDiagnostics(mcpResult.data, uri));
        break;
      case 'dependencies':
        diagnostics.push(...this.convertDependencyDiagnostics(mcpResult.data, uri));
        break;
    }

    return diagnostics;
  }

  private convertArchitectureDiagnostics(data: any, uri: string): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    if (data.violations?.violations) {
      for (const violation of data.violations.violations) {
        // Only include violations for current file
        if (violation.file === uri) {
          diagnostics.push({
            range: this.convertRange(violation.location),
            severity: this.mapSeverity(violation.severity),
            message: violation.description,
            source: 'gibRun Architecture',
            code: violation.type,
            relatedInformation: violation.related_locations?.map(loc => ({
              location: {
                uri: loc.file,
                range: this.convertRange(loc)
              },
              message: loc.description
            }))
          });
        }
      }
    }

    return diagnostics;
  }

  private convertQualityDiagnostics(data: any, uri: string): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    if (data.hotspots) {
      for (const hotspot of data.hotspots) {
        if (hotspot.file === uri) {
          diagnostics.push({
            range: {
              start: { line: hotspot.line - 1, character: 0 },
              end: { line: hotspot.line - 1, character: 1 }
            },
            severity: DiagnosticSeverity.Warning,
            message: `Code quality hotspot: ${hotspot.issues.join(', ')}`,
            source: 'gibRun Quality',
            code: 'quality_hotspot'
          });
        }
      }
    }

    return diagnostics;
  }
}
```

#### Code Actions & Quick Fixes
```typescript
export class CodeActionsProvider {
  async provideCodeActions(
    uri: string,
    range: Range,
    context: CodeActionContext
  ): Promise<CodeAction[]> {
    const actions: CodeAction[] = [];

    // Get diagnostics for the range
    const diagnostics = context.diagnostics.filter(d =>
      range.contains(d.range) || d.range.contains(range)
    );

    for (const diagnostic of diagnostics) {
      // Generate actions based on diagnostic type
      switch (diagnostic.source) {
        case 'gibRun Architecture':
          actions.push(...await this.createArchitectureActions(diagnostic, uri));
          break;
        case 'gibRun Quality':
          actions.push(...await this.createQualityActions(diagnostic, uri));
          break;
        case 'gibRun Security':
          actions.push(...await this.createSecurityActions(diagnostic, uri));
          break;
      }
    }

    // Also provide general improvement actions
    actions.push(...await this.createGeneralActions(uri, range));

    return actions;
  }

  private async createArchitectureActions(diagnostic: Diagnostic, uri: string): Promise<CodeAction[]> {
    const actions: CodeAction[] = [];

    if (diagnostic.code === 'circular_dependency') {
      actions.push({
        title: 'Refactor to break circular dependency',
        kind: CodeActionKind.Refactor,
        command: {
          title: 'Refactor Dependency',
          command: 'gibrun.refactorCircularDependency',
          arguments: [uri, diagnostic.range]
        }
      });
    }

    return actions;
  }

  private async createQualityActions(diagnostic: Diagnostic, uri: string): Promise<CodeAction[]> {
    const actions: CodeAction[] = [];

    if (diagnostic.message.includes('complexity')) {
      actions.push({
        title: 'Extract method to reduce complexity',
        kind: CodeActionKind.RefactorExtract,
        command: {
          title: 'Extract Method',
          command: 'gibrun.extractMethod',
          arguments: [uri, diagnostic.range]
        }
      });
    }

    return actions;
  }
}
```

## 📋 MCP Tools Enhancement

### LSP-Aware Tools

#### `lsp_initialize_server`
Initialize LSP server dengan MCP integration.

**Parameters:**
```typescript
{
  "workspace_path": "/path/to/project",
  "mcp_server_url": "http://localhost:3000",
  "lsp_capabilities": {
    "diagnostics": true,
    "code_actions": true,
    "hover": true,
    "symbols": true
  }
}
```

#### `lsp_analyze_document`
Real-time analysis untuk document tertentu.

**Parameters:**
```typescript
{
  "uri": "file:///path/to/file.go",
  "content": "file content...",
  "analysis_types": ["syntax", "quality", "architecture"],
  "include_diagnostics": true,
  "include_actions": true
}
```

#### `lsp_get_hover_info`
Get hover information dengan analysis context.

**Parameters:**
```typescript
{
  "uri": "file:///path/to/file.go",
  "position": { "line": 10, "character": 5 },
  "include_analysis_context": true,
  "include_symbol_info": true
}
```

#### `lsp_find_references`
Find symbol references dengan project context.

**Parameters:**
```typescript
{
  "uri": "file:///path/to/file.go",
  "position": { "line": 10, "character": 5 },
  "include_external": false,
  "include_analysis": true
}
```

### Incremental Analysis Tools

#### `lsp_incremental_analyze`
Analyze changes incrementally.

**Parameters:**
```typescript
{
  "uri": "file:///path/to/file.go",
  "changes": [
    {
      "range": { "start": { "line": 1, "character": 0 }, "end": { "line": 1, "character": 10 } },
      "text": "new code"
    }
  ],
  "analysis_scope": "file" // file, module, project
}
```

#### `lsp_get_diagnostics`
Get current diagnostics untuk file atau workspace.

**Parameters:**
```typescript
{
  "scope": "file", // file, workspace
  "uri": "file:///path/to/file.go", // for file scope
  "include_related": true,
  "severity_filter": ["error", "warning"] // optional
}
```

## 🎯 Detection & Analysis Logic

### Real-time Analysis Pipeline
```typescript
export class RealTimeAnalyzer {
  private analysisQueue: Map<string, AnalysisTask> = new Map();
  private analysisWorkers: Worker[] = [];

  async analyzeDocument(uri: string, content: string): Promise<AnalysisResult> {
    // Quick syntax analysis (immediate)
    const syntaxResult = await this.performSyntaxAnalysis(content);

    // Queue deep analysis (async)
    this.queueDeepAnalysis(uri, content);

    return {
      syntax: syntaxResult,
      diagnostics: syntaxResult.diagnostics,
      symbols: syntaxResult.symbols
    };
  }

  private async performSyntaxAnalysis(content: string): Promise<SyntaxAnalysisResult> {
    // Fast, lightweight analysis
    const diagnostics: Diagnostic[] = [];
    const symbols: SymbolInfo[] = [];

    // Basic syntax checking
    const syntaxErrors = this.checkSyntax(content);
    diagnostics.push(...syntaxErrors);

    // Symbol extraction
    symbols.push(...this.extractSymbols(content));

    return { diagnostics, symbols };
  }

  private queueDeepAnalysis(uri: string, content: string): void {
    const task: AnalysisTask = {
      uri,
      content,
      timestamp: Date.now(),
      priority: this.calculatePriority(uri, content)
    };

    this.analysisQueue.set(uri, task);

    // Process queue
    this.processAnalysisQueue();
  }

  private async processAnalysisQueue(): Promise<void> {
    // Sort by priority and timestamp
    const sortedTasks = Array.from(this.analysisQueue.values())
      .sort((a, b) => b.priority - a.priority || a.timestamp - b.timestamp);

    // Process high-priority tasks first
    for (const task of sortedTasks.slice(0, 3)) { // Process top 3
      if (!this.isTaskBeingProcessed(task.uri)) {
        this.processTask(task);
      }
    }
  }

  private async processTask(task: AnalysisTask): Promise<void> {
    try {
      // Perform deep analysis via MCP
      const result = await this.mcpClient.executeTool('project_analyzer/quality', {
        scope: 'file',
        file_path: task.uri,
        content: task.content
      });

      // Convert and publish diagnostics
      const diagnostics = await this.diagnosticsConverter.convertMCPToLSP(result, task.uri);
      this.lspServer.publishDiagnostics(task.uri, diagnostics);

      // Update cache
      this.analysisCache.set(task.uri, result);

    } catch (error) {
      console.error('Deep analysis failed:', error);
    } finally {
      this.analysisQueue.delete(task.uri);
    }
  }

  private calculatePriority(uri: string, content: string): number {
    let priority = 1;

    // Higher priority for recently opened files
    if (this.recentlyOpened.has(uri)) priority += 5;

    // Higher priority for files with errors
    if (content.includes('TODO') || content.includes('FIXME')) priority += 3;

    // Higher priority for core files
    if (uri.includes('/core/') || uri.includes('/internal/')) priority += 2;

    return priority;
  }
}
```

### Symbol Analysis & Navigation
```typescript
export class SymbolAnalyzer {
  async provideDocumentSymbols(uri: string): Promise<DocumentSymbol[]> {
    const content = await this.getDocumentContent(uri);
    const symbols = await this.extractSymbols(content);

    return this.buildSymbolHierarchy(symbols);
  }

  async provideWorkspaceSymbols(query: string): Promise<SymbolInformation[]> {
    // Search across all indexed files
    const results = await this.symbolIndex.search(query, {
      limit: 50,
      includeExternal: false
    });

    return results.map(result => ({
      name: result.name,
      kind: this.mapSymbolKind(result.type),
      location: {
        uri: result.file_path,
        range: result.range
      },
      containerName: result.container_name
    }));
  }

  async provideDefinition(uri: string, position: Position): Promise<Location | null> {
    const symbol = await this.getSymbolAtPosition(uri, position);

    if (!symbol) return null;

    // Find definition location
    return await this.findSymbolDefinition(symbol);
  }

  async provideReferences(uri: string, position: Position): Promise<Location[]> {
    const symbol = await this.getSymbolAtPosition(uri, position);

    if (!symbol) return [];

    // Find all references
    const references = await this.symbolIndex.findReferences(symbol.id);

    return references.map(ref => ({
      uri: ref.file_path,
      range: ref.range
    }));
  }

  private buildSymbolHierarchy(symbols: SymbolInfo[]): DocumentSymbol[] {
    const rootSymbols: DocumentSymbol[] = [];
    const symbolMap = new Map<string, DocumentSymbol>();

    for (const symbol of symbols) {
      const docSymbol: DocumentSymbol = {
        name: symbol.name,
        kind: this.mapSymbolKind(symbol.type),
        range: symbol.range,
        selectionRange: symbol.selectionRange,
        children: []
      };

      symbolMap.set(symbol.id, docSymbol);

      if (symbol.parentId) {
        const parent = symbolMap.get(symbol.parentId);
        if (parent) {
          parent.children!.push(docSymbol);
        }
      } else {
        rootSymbols.push(docSymbol);
      }
    }

    return rootSymbols;
  }
}
```

## 🔗 Integration Points

### VS Code Extension Enhancement
```typescript
// Enhanced vscode-extension/src/extension.ts
export async function activate(context: vscode.ExtensionContext) {
  // Existing MCP integration
  const mcpClient = new MCPClient();
  await mcpClient.connect();

  // New LSP integration
  const lspBridge = new LSPBridge(mcpClient);
  const lspClient = new LSPClient();

  // Register LSP features
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      ['go', 'typescript', 'javascript', 'python'],
      lspBridge
    ),
    vscode.languages.registerCodeActionsProvider(
      ['go', 'typescript', 'javascript', 'python'],
      lspBridge
    ),
    vscode.languages.registerDefinitionProvider(
      ['go', 'typescript', 'javascript', 'python'],
      lspBridge
    )
  );

  // Start LSP server
  await lspClient.startServer({
    serverOptions: {
      command: 'gibrun-lsp',
      args: ['--stdio']
    },
    documentSelector: [
      { scheme: 'file', language: 'go' },
      { scheme: 'file', language: 'typescript' },
      { scheme: 'file', language: 'javascript' },
      { scheme: 'file', language: 'python' }
    ]
  });
}
```

### Multi-Editor Support
```typescript
// LSP client implementations for different editors
export class LSPClientManager {
  async createClientForEditor(editor: string): Promise<LSPClient> {
    switch (editor) {
      case 'vscode':
        return new VSCodeLSPClient();
      case 'vim':
        return new VimLSPClient();
      case 'emacs':
        return new EmacsLSPClient();
      case 'jetbrains':
        return new JetBrainsLSPClient();
      default:
        throw new Error(`Unsupported editor: ${editor}`);
    }
  }
}

// Editor-specific LSP clients
export class VSCodeLSPClient implements LSPClient {
  async startServer(options: ServerOptions): Promise<void> {
    // VS Code specific LSP initialization
  }
}

export class VimLSPClient implements LSPClient {
  async startServer(options: ServerOptions): Promise<void> {
    // Vim LSP client (vim-lsp, coc.nvim, etc.)
  }
}
```

## 🧪 Testing Strategy

### LSP Protocol Testing
```typescript
// test/lsp/lsp-protocol.test.ts
describe('LSP Protocol Compliance', () => {
  let lspServer: GibRunLSPServer;
  let mockClient: MockLSPClient;

  beforeEach(async () => {
    lspServer = new GibRunLSPServer();
    mockClient = new MockLSPClient();
    await lspServer.initialize(mockClient);
  });

  test('should handle initialize request', async () => {
    const params: InitializeParams = {
      processId: 12345,
      rootUri: 'file:///tmp/test-project',
      capabilities: {}
    };

    const result = await lspServer.initialize(params);

    expect(result.capabilities).toBeDefined();
    expect(result.serverInfo.name).toBe('gibRun LSP Server');
  });

  test('should provide diagnostics on document open', async () => {
    const params: DidOpenTextDocumentParams = {
      textDocument: {
        uri: 'file:///tmp/test.go',
        languageId: 'go',
        version: 1,
        text: 'package main\n\nfunc main() {\n\tprintln("hello")\n}'
      }
    };

    await lspServer.didOpenTextDocument(params);

    // Verify diagnostics were published
    expect(mockClient.publishedDiagnostics).toHaveLength(1);
  });

  test('should handle incremental document changes', async () => {
    // First open document
    await lspServer.didOpenTextDocument({
      textDocument: {
        uri: 'file:///tmp/test.go',
        languageId: 'go',
        version: 1,
        text: 'package main\n\nfunc main() {}'
      }
    });

    // Then change it
    await lspServer.didChangeTextDocument({
      textDocument: { uri: 'file:///tmp/test.go', version: 2 },
      contentChanges: [{
        range: {
          start: { line: 3, character: 0 },
          end: { line: 3, character: 1 }
        },
        text: '\tprintln("hello")\n'
      }]
    });

    // Verify incremental analysis
    expect(mockClient.publishedDiagnostics).toHaveLength(2);
  });
});
```

### Integration Testing
```typescript
// test/integration/lsp-mcp-integration.test.ts
describe('LSP-MCP Integration', () => {
  let lspServer: GibRunLSPServer;
  let mcpServer: MockMCPServer;

  beforeEach(async () => {
    mcpServer = new MockMCPServer();
    await mcpServer.start();

    lspServer = new GibRunLSPServer();
    await lspServer.connectToMCP(mcpServer.getUrl());
  });

  test('should use MCP for deep analysis', async () => {
    const document: TextDocumentItem = {
      uri: 'file:///tmp/complex.go',
      languageId: 'go',
      version: 1,
      text: `
        package main

        import "fmt"

        // Complex function with high cyclomatic complexity
        func complexFunction(a, b, c int) int {
          if a > 0 {
            if b > 0 {
              if c > 0 {
                return a + b + c
              } else {
                return a + b
              }
            } else if c > 0 {
              return a + c
            } else {
              return a
            }
          } else if b > 0 {
            if c > 0 {
              return b + c
            } else {
              return b
            }
          } else if c > 0 {
            return c
          }
          return 0
        }

        func main() {
          result := complexFunction(1, 2, 3)
          fmt.Println(result)
        }
      `
    };

    await lspServer.didOpenTextDocument({ textDocument: document });

    // Wait for deep analysis
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify MCP was called for quality analysis
    expect(mcpServer.getCallHistory()).toContainEqual(
      expect.objectContaining({
        tool: 'project_analyzer/quality',
        params: expect.objectContaining({
          scope: 'file'
        })
      })
    );

    // Verify LSP diagnostics include complexity warning
    const diagnostics = await lspServer.getDiagnostics(document.uri);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('complexity'),
        severity: DiagnosticSeverity.Warning
      })
    );
  });

  test('should provide code actions from MCP analysis', async () => {
    // Setup document with quality issues
    const document: TextDocumentItem = {
      uri: 'file:///tmp/long-function.go',
      languageId: 'go',
      version: 1,
      text: `
        package main

        func veryLongFunction(a, b, c, d, e, f, g, h, i, j int) int {
          // Very long function with many parameters
          // This should trigger a code quality warning
          result := 0
          result += a + b + c + d + e
          result += f + g + h + i + j
          return result
        }
      `
    };

    await lspServer.didOpenTextDocument({ textDocument: document });

    // Get code actions for the function
    const actions = await lspServer.getCodeActions(document.uri, {
      start: { line: 3, character: 0 },
      end: { line: 3, character: 50 }
    });

    // Verify code actions include refactoring suggestions
    expect(actions).toContainEqual(
      expect.objectContaining({
        title: expect.stringContaining('extract method'),
        kind: CodeActionKind.RefactorExtract
      })
    );
  });
});
```

## 📈 Success Metrics

### Performance Metrics
- **Initialization Time**: LSP server starts <2 seconds
- **First Diagnostics**: <500ms after document open
- **Incremental Analysis**: <200ms for small changes
- **Memory Usage**: <50MB for LSP server
- **MCP Call Frequency**: <1 call per second average

### Feature Completeness
- **LSP Compliance**: 100% basic LSP protocol support
- **MCP Integration**: All analysis tools accessible via LSP
- **Real-time Feedback**: Diagnostics updated within 500ms
- **Multi-editor Support**: 3+ editors supported
- **Incremental Analysis**: 90%+ analysis operations use incremental mode

### User Experience Metrics
- **Editor Responsiveness**: No noticeable lag during typing
- **Diagnostic Accuracy**: >95% diagnostics are actionable
- **Code Action Relevance**: >80% code actions are useful
- **Cross-editor Consistency**: Same experience across supported editors

## 🚀 Implementation Roadmap

### Phase 1: LSP Foundation (4-6 weeks)
- [ ] Implement basic LSP server with MCP bridge
- [ ] Add real-time diagnostics for syntax errors
- [ ] Create LSP client for VS Code integration
- [ ] Set up incremental analysis infrastructure

### Phase 2: MCP-LSP Integration (4-6 weeks)
- [ ] Implement MCP-to-LSP data conversion
- [ ] Add deep analysis via MCP for complex issues
- [ ] Create code actions based on MCP results
- [ ] Add hover information with analysis context

### Phase 3: Advanced LSP Features (4-6 weeks)
- [ ] Implement symbol analysis and navigation
- [ ] Add workspace-wide intelligence
- [ ] Create multi-editor client libraries
- [ ] Optimize performance for large codebases

### Phase 4: Ecosystem Integration (2-4 weeks)
- [ ] Add LSP clients for Vim, Emacs, Sublime
- [ ] Create plugin marketplace integration
- [ ] Add comprehensive testing and documentation
- [ ] Performance optimization and monitoring

---

**LSP Integration akan mentransformasi gibRun menjadi real-time code intelligence platform dengan native IDE support!** 🚀