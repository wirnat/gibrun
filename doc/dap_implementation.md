# DAP Implementation Guide - gibRun MCP Server

## Overview

This document provides comprehensive documentation for the Debug Adapter Protocol (DAP) implementation in gibRun MCP Server. The DAP integration enables seamless debugging workflows by allowing AI assistants to interact with VSCode debugger sessions programmatically.

## Architecture

### Current Implementation

gibRun implements DAP communication using raw TCP sockets with manual JSON-RPC protocol handling:

```
┌─────────────────┐    TCP Socket    ┌─────────────────┐
│   gibRun MCP    │◄────────────────►│   VSCode DAP    │
│     Server      │   JSON-RPC       │     Server      │
└─────────────────┘                  └─────────────────┘
```

### Key Components

1. **DAP Transport Layer** (`src/index.ts`)
   - Raw TCP socket communication
   - Manual JSON-RPC message parsing
   - Custom protocol implementation

2. **Debugger Proxy** (`src/goDebuggerProxy.ts`)
   - Manages external `mcp-go-debugger` subprocess
   - Handles tool delegation and response routing

3. **DAP Tools**
   - `dap_restart`: Hot reload debugging sessions
   - `dap_send_command`: Send custom DAP commands

## DAP Protocol Implementation

### Message Format

All DAP communication uses JSON-RPC 2.0 protocol:

```json
{
  "seq": 1,
  "type": "request",
  "command": "initialize",
  "arguments": {
    "clientID": "gibrun-mcp",
    "clientName": "gibRun MCP",
    "adapterID": "delve"
  }
}
```

### Sequence Numbers

Each DAP message includes a sequence number for request/response correlation:

```typescript
let dapSequence = 1;

// Increment for each new request
const request = {
  seq: dapSequence++,
  type: "request",
  command: "initialize",
  arguments: { ... }
};
```

### Message Types

#### Request Messages
```typescript
interface DAPRequest {
  seq: number;
  type: "request";
  command: string;
  arguments?: any;
}
```

#### Response Messages
```typescript
interface DAPResponse {
  seq: number;
  type: "response";
  request_seq: number;
  success: boolean;
  command: string;
  message?: string;
  body?: any;
}
```

#### Event Messages
```typescript
interface DAPEvent {
  seq: number;
  type: "event";
  event: string;
  body?: any;
}
```

## Core DAP Operations

### 1. Initialize Session

Establishes DAP connection and negotiates capabilities:

```typescript
const initializeArgs = {
  clientID: "gibrun-mcp",
  clientName: "gibRun MCP",
  adapterID: "delve",
  linesStartAt1: true,
  columnsStartAt1: true,
  pathFormat: "path",
  supportsRunInTerminalRequest: false,
  supportsProgressReporting: false,
  supportsInvalidatedEvent: false
};

await sendDAPRequest(host, port, "initialize", initializeArgs);
```

### 2. Configuration Done

Signals that configuration is complete and debugging can begin:

```typescript
await sendDAPRequest(host, port, "configurationDone", {});
```

### 3. Launch/Attach

Starts or attaches to debuggee process:

```typescript
// Launch new process
await sendDAPRequest(host, port, "launch", {
  program: "/path/to/binary",
  args: ["--flag", "value"]
});

// Attach to existing process
await sendDAPRequest(host, port, "attach", {
  processId: 12345
});
```

### 4. Breakpoint Management

```typescript
// Set breakpoints
await sendDAPRequest(host, port, "setBreakpoints", {
  source: { path: "/path/to/file.go" },
  breakpoints: [
    { line: 42, condition: "x > 5" },
    { line: 67 }
  ]
});

// Get breakpoints
const response = await sendDAPRequest(host, port, "getBreakpoints", {});
```

### 5. Execution Control

```typescript
// Continue execution
await sendDAPRequest(host, port, "continue", { threadId: 1 });

// Step operations
await sendDAPRequest(host, port, "next", { threadId: 1 });        // Step over
await sendDAPRequest(host, port, "stepIn", { threadId: 1 });      // Step into
await sendDAPRequest(host, port, "stepOut", { threadId: 1 });     // Step out
```

### 6. Variable Evaluation

```typescript
// Evaluate expression
const result = await sendDAPRequest(host, port, "evaluate", {
  expression: "user.name",
  frameId: 1,
  context: "hover"
});

// Get variables in scope
const variables = await sendDAPRequest(host, port, "variables", {
  variablesReference: 1000
});
```

### 7. Disconnect/Restart

```typescript
// Disconnect with optional restart
await sendDAPRequest(host, port, "disconnect", {
  restart: true,
  terminateDebuggee: false
});

// Restart debugging session
await sendDAPRequest(host, port, "restart", {});
```

## gibRun DAP Tools

### dap_restart

Restarts VSCode debugger session with optional rebuild:

```typescript
interface DAPRestartArgs {
  host?: string;           // Default: "127.0.0.1"
  port?: number;           // Auto-detected if not provided
  rebuild_first?: boolean; // Default: true
  project_path?: string;   // Required if rebuild_first=true
}
```

**Workflow:**
1. Auto-detect DAP server port using `lsof`
2. Rebuild Go project (if requested)
3. Send disconnect command with `restart: true`
4. Wait for debugger to restart automatically

### dap_send_command

Send custom DAP commands for advanced debugging:

```typescript
interface DAPSendCommandArgs {
  host?: string;           // Default: "127.0.0.1"
  port?: number;           // Auto-detected if not provided
  command: string;         // DAP command name
  arguments?: any;         // Command arguments
}
```

**Supported Commands:**
- `initialize`, `launch`, `attach`
- `setBreakpoints`, `getBreakpoints`
- `continue`, `next`, `stepIn`, `stepOut`
- `evaluate`, `variables`
- `disconnect`, `restart`

## Auto-Detection Logic

### DAP Server Discovery

gibRun automatically detects running DAP servers:

```bash
lsof -i -P -n | grep "dlv.*LISTEN"
```

**Process:**
1. Scan for processes with `dlv dap` command
2. Extract host:port from LISTEN sockets
3. Validate connectivity
4. Return first valid server or list options

### Port Resolution Algorithm

```typescript
async function resolveDAPServer(host?: string, port?: number) {
  if (port) {
    return { success: true, host: host || "127.0.0.1", port, source: "provided" };
  }

  const servers = await detectDAPServers();

  if (servers.length === 0) {
    return {
      success: false,
      reason: "not_found",
      message: "Tidak ditemukan proses dlv dap yang LISTEN"
    };
  }

  if (servers.length === 1) {
    return {
      success: true,
      host: servers[0].host,
      port: servers[0].port,
      source: "auto-detected"
    };
  }

  return {
    success: false,
    reason: "multiple",
    message: "Ditemukan lebih dari satu proses dlv dap",
    options: servers
  };
}
```

## Error Handling

### Connection Errors

```typescript
try {
  await sendDAPRequest(host, port, command, args);
} catch (error) {
  if (error.code === 'ECONNREFUSED') {
    // DAP server not running
  } else if (error.code === 'ETIMEDOUT') {
    // Connection timeout
  }
}
```

### Protocol Errors

```typescript
const response = await sendDAPRequest(host, port, "initialize", args);
if (!response.success) {
  // Handle DAP protocol error
  console.error("DAP Error:", response.message);
}
```

### Timeout Handling

```typescript
const response = await sendDAPRequest(host, port, command, args, {
  timeoutMs: 10000  // 10 second timeout
});
```

## Critical Issues & Improvements Needed

### 🚨 High Priority Issues (Immediate Action Required)

#### 1. **Missing Type Safety & Protocol Compliance**
**Current Problem:**
- Manual JSON-RPC message construction without TypeScript types
- Runtime protocol violations possible
- No compile-time validation of DAP messages
- Maintenance burden from manual protocol handling

**Impact:** Runtime errors, protocol violations, difficult debugging

**Solution:** Add `@vscode/debugprotocol` dependency
```bash
npm install --save-dev @vscode/debugprotocol@^1.62.0
```

**Benefits:**
- Type-safe DAP message construction
- Official protocol definitions maintained by Microsoft
- Compile-time validation of protocol compliance
- Better IDE support and auto-completion
- Automatic protocol updates with new DAP versions

#### 2. **Limited DAP Command Support**
**Current Problem:**
- Only basic restart/disconnect commands implemented
- Missing advanced debugging features (breakpoints, evaluation, stepping)
- Cannot perform complex debugging operations

**Impact:** Very limited debugging capabilities

**Missing Features:**
- Conditional breakpoints with expressions
- Variable inspection and evaluation
- Step operations (step over, step into, step out)
- Thread management
- Stack trace analysis

#### 3. **No Connection Management**
**Current Problem:**
- Single connection per request
- No connection pooling or reuse
- Resource leaks possible
- Performance overhead from connection establishment

**Impact:** Poor performance, resource waste

**Solution:** Implement connection pooling and lifecycle management

#### 4. **Basic Error Handling**
**Current Problem:**
- Generic error messages
- No DAP-specific error classification
- Limited recovery strategies
- Poor debugging experience

**Impact:** Difficult to diagnose and resolve DAP issues

**Solution:** Structured error handling with recovery strategies

#### 5. **No Event Handling**
**Current Problem:**
- Request-response only communication
- Cannot react to debugger events
- No real-time debugging feedback

**Impact:** Cannot respond to breakpoint hits, output events, etc.

**Missing:** DAP event processing (stopped, output, breakpoint hit, thread events)

#### 6. **Security Concerns**
**Current Problem:**
- No input validation for DAP commands
- Potential command injection vulnerabilities
- No timeout controls or resource limits

**Impact:** Security vulnerabilities, potential system compromise

#### 7. **Testing Infrastructure**
**Current Problem:**
- No automated DAP tests
- Manual testing only
- Regression issues likely

**Impact:** Unreliable debugging, difficult maintenance

### 📋 Implementation Roadmap

#### Phase 1: Foundation (2-3 weeks)
**Goal:** Establish solid foundation with type safety and basic improvements

1. **Add @vscode/debugprotocol dependency**
   ```json
   {
     "devDependencies": {
       "@vscode/debugprotocol": "^1.62.0"
     }
   }
   ```

2. **Create type-safe DAP layer**
   ```typescript
   import {
       InitializeRequest,
       LaunchRequestArguments,
       SetBreakpointsRequest,
       EvaluateRequest
   } from '@vscode/debugprotocol';

   // Replace manual message construction
   const initializeRequest = new InitializeRequest(1, {
       clientID: "gibrun-mcp",
       adapterID: "delve",
       // ... typed properties
   });
   ```

3. **Implement connection management**
   - Connection pooling
   - Automatic reconnection
   - Resource cleanup
   - Health monitoring

4. **Enhanced error handling**
   - DAP-specific error codes
   - Automatic retry logic
   - Better error messages
   - Recovery strategies

#### Phase 2: Enhanced Features (1-2 months)
**Goal:** Add advanced debugging capabilities

1. **Advanced DAP commands**
   ```typescript
   // Conditional breakpoints
   await sendDAPRequest(host, port, "setBreakpoints", {
     breakpoints: [{
       line: 42,
       condition: "x > 5",
       hitCondition: "3"
     }]
   });

   // Expression evaluation
   const result = await sendDAPRequest(host, port, "evaluate", {
     expression: "user.name",
     frameId: 1,
     context: "hover"
   });
   ```

2. **Event handling system**
   ```typescript
   // Listen for DAP events
   connection.on('event', (event) => {
     switch (event.event) {
       case 'stopped':
         handleBreakpointHit(event.body);
         break;
       case 'output':
         handleDebuggerOutput(event.body);
         break;
     }
   });
   ```

3. **Security hardening**
   - Input validation and sanitization
   - Command timeout controls
   - Resource limits
   - Safe expression evaluation

#### Phase 3: Advanced Features (3-6 months)
**Goal:** Production-ready advanced debugging

1. **Multi-debugger support**
   - Support different DAP servers
   - Protocol negotiation
   - Capability detection

2. **Performance optimization**
   - Message batching
   - Compression support
   - Caching strategies

3. **Real-time debugging features**
   - Live variable watching
   - Performance profiling
   - Memory inspection

### 🔧 Migration Strategy

#### Gradual Migration Approach
1. **Keep existing implementation** as fallback
2. **Create new type-safe layer** alongside existing code
3. **Migrate critical paths first** (initialize, restart, basic commands)
4. **Add comprehensive tests** for new implementation
5. **Gradually replace** manual protocol handling
6. **Remove old code** once fully tested

#### Backward Compatibility
- Maintain existing tool interfaces
- Support both old and new implementations during transition
- Feature flags for new functionality
- Comprehensive testing before removal of old code

### 📊 Success Metrics

- **Type Safety:** 100% DAP messages use typed interfaces
- **Test Coverage:** >90% of DAP operations tested
- **Error Rate:** <5% protocol-related errors
- **Performance:** <100ms average response time
- **Security:** Zero known vulnerabilities
- **Feature Completeness:** Support for 80%+ DAP protocol features

## Multi-IDE DAP Support

### Current Limitation: VSCode-Only Detection

**Current Implementation:**
```typescript
const scanCommand = 'bash -lc "lsof -i -P -n | grep \\"dlv.*LISTEN\\" || true"';
```

This only detects VSCode + Delve DAP servers. Other IDEs are not supported.

### JetBrains IDE DAP Support

#### How JetBrains Handles DAP

**GoLand / IntelliJ IDEA with Go Plugin:**
- Uses **DAP protocol** for Go debugging
- Process name: `java` (JVM-based IDE)
- DAP server typically runs on **localhost with dynamic ports**
- Configuration via `.idea/` project files

**Detection Challenges:**
- JetBrains IDEs run as JVM processes (`java` command)
- DAP server ports are dynamically assigned
- No specific process name pattern like "dlv dap"
- Configuration stored in IDE project files

#### Implementation Strategy for JetBrains Support

**Phase 1: Basic Detection**
```typescript
// Extended detection patterns
const detectionPatterns = [
  {
    ide: 'vscode',
    pattern: /dlv.*dap/i,
    commandTemplate: 'dlv dap'
  },
  {
    ide: 'jetbrains',
    pattern: /java.*-Didea\.platform\.prefix=Go/ i,
    commandTemplate: 'java -jar /path/to/debugger.jar'
  },
  {
    ide: 'generic',
    pattern: /dap|debug.*adapter/i,
    commandTemplate: null // Manual configuration required
  }
];
```

**Phase 2: IDE-Specific Configuration**

```typescript
interface IDEConfig {
  name: string;
  processPattern: RegExp;
  portDetection: 'lsof' | 'config_file' | 'environment';
  configPaths: string[];
  defaultPorts: number[];
  capabilities: DAPCapabilities;
}

const ideConfigs: Record<string, IDEConfig> = {
  vscode: {
    name: 'Visual Studio Code',
    processPattern: /dlv.*dap/i,
    portDetection: 'lsof',
    configPaths: ['.vscode/launch.json'],
    defaultPorts: [49279, 2345],
    capabilities: { /* VSCode-specific capabilities */ }
  },
  jetbrains: {
    name: 'JetBrains IDEs',
    processPattern: /java.*idea/i,
    portDetection: 'config_file',
    configPaths: ['.idea/workspace.xml', '.idea/runConfigurations/'],
    defaultPorts: [5005, 5006, 5007],
    capabilities: { /* JetBrains-specific capabilities */ }
  }
};
```

**Phase 3: Configuration File Parsing**

For JetBrains IDEs, parse configuration files:

```typescript
// Parse .idea/workspace.xml for DAP configuration
async function parseJetBrainsConfig(projectPath: string): Promise<DAPConfig | null> {
  const workspaceXml = path.join(projectPath, '.idea', 'workspace.xml');

  try {
    const content = await fs.readFile(workspaceXml, 'utf8');
    const config = parseXmlConfig(content);

    return {
      host: config.debugger?.host || 'localhost',
      port: config.debugger?.port,
      debuggerType: config.debugger?.type || 'go',
      workingDirectory: config.debugger?.workingDirectory || projectPath
    };
  } catch (error) {
    logError('Failed to parse JetBrains config', error);
    return null;
  }
}
```

#### JetBrains DAP Workflow

**1. Configuration Detection:**
```xml
<!-- .idea/workspace.xml -->
<configuration name="Go Debug" type="GoApplicationRunConfiguration" factoryName="Go Application">
  <module name="my-module" />
  <working_directory value="$PROJECT_DIR$" />
  <parameters value="" />
  <kind value="PACKAGE" />
  <package value="main" />
  <directory value="$PROJECT_DIR$" />
  <filePath value="$PROJECT_DIR$/main.go" />
  <method v="2">
    <option name="RunConfigurationTask" enabled="true" run_configuration_name="Build" run_configuration_type="GoTestRunConfiguration" />
  </method>
</configuration>
```

**2. DAP Server Launch:**
- JetBrains automatically starts DAP server when debugging starts
- Port information available in IDE logs or configuration
- Can be configured via IDE settings

**3. gibRun Integration:**
```typescript
// Enhanced detection for JetBrains
async function detectJetBrainsDAP(projectPath: string): Promise<DetectedDAPServer[]> {
  // Check for running Java processes with IDEA
  const javaProcesses = await getJavaProcessesWithIdea();

  // Parse configuration files
  const configs = await parseJetBrainsConfigs(projectPath);

  // Cross-reference processes with configs
  return matchProcessesWithConfigs(javaProcesses, configs);
}
```

### Other IDE DAP Support

#### Visual Studio
```typescript
const visualStudioConfig: IDEConfig = {
  name: 'Visual Studio',
  processPattern: /devenv\.exe|vsdbg/i,
  portDetection: 'environment',
  configPaths: ['.vs/launch.vs.json'],
  defaultPorts: [4020, 4021, 4022],
  capabilities: { /* VS-specific capabilities */ }
};
```

#### VSCode with Other Debuggers
```typescript
const vscodeConfigs = {
  python: { pattern: /debugpy/i, ports: [5678] },
  node: { pattern: /node.*--inspect/i, ports: [9229] },
  cpp: { pattern: /gdb|lldb/i, ports: [1234] }
};
```

### Implementation Roadmap for Multi-IDE Support

#### Phase 1: Detection Enhancement (1-2 weeks)
1. **Extend detection patterns** to include multiple IDEs
2. **Add configuration file parsing** for JetBrains
3. **Implement fallback detection** methods
4. **Add IDE capability detection**

#### Phase 2: IDE-Specific Features (2-4 weeks)
1. **JetBrains configuration parsing** (.idea/ files)
2. **IDE-specific command handling**
3. **Capability negotiation** per IDE
4. **Enhanced error messages** for different IDEs

#### Phase 3: Advanced Integration (1-2 months)
1. **IDE plugin development** (optional)
2. **Real-time configuration sync**
3. **Cross-IDE debugging workflows**
4. **Performance optimization** per IDE

### Configuration Examples

#### JetBrains GoLand Setup
```xml
<!-- .idea/runConfigurations/Go_Debug.xml -->
<configuration name="Go Debug" type="GoApplicationRunConfiguration">
  <option name="WORKING_DIRECTORY" value="$PROJECT_DIR$" />
  <option name="GO_PARAMETERS" value="" />
  <option name="GO_OUTPUT_FILE_PATH" value="" />
  <option name="PACKAGE" value="main" />
  <option name="KIND" value="PACKAGE" />
  <option name="FILE_PATH" value="$PROJECT_DIR$/main.go" />
  <method v="2">
    <option name="GoTestRunConfiguration.BuildBeforeRunTask" enabled="true" />
  </method>
</configuration>
```

#### gibRun Configuration for JetBrains
```typescript
// Enhanced tool parameters
interface DAPToolArgs {
  host?: string;
  port?: number;
  ide?: 'vscode' | 'jetbrains' | 'visualstudio' | 'auto';
  project_path?: string;
  config_path?: string; // For manual config file specification
}
```

### Benefits of Multi-IDE Support

1. **Broader Adoption**: Support developers using different IDEs
2. **Better DX**: Seamless debugging regardless of IDE choice
3. **Flexibility**: Choose IDE based on preference, not tooling limitations
4. **Enterprise Ready**: Support for corporate IDE standards

### Challenges & Solutions

#### Challenge 1: IDE-Specific Behaviors
**Solution:** Abstract IDE differences behind capability interfaces

#### Challenge 2: Configuration Complexity
**Solution:** Auto-detection with manual override options

#### Challenge 3: Protocol Variations
**Solution:** Capability negotiation and feature detection

### Testing Strategy

```typescript
describe('Multi-IDE DAP Support', () => {
  test('detects VSCode DAP servers', async () => {
    // Test VSCode detection
  });

  test('detects JetBrains DAP servers', async () => {
    // Test JetBrains detection
  });

  test('parses JetBrains configuration files', async () => {
    // Test config parsing
  });

  test('handles IDE capability differences', async () => {
    // Test capability negotiation
  });
});
```

## Future Improvements

### Enhanced Features (Already Implemented Above)

1. **Conditional Breakpoints**
   ```typescript
   await sendDAPRequest(host, port, "setBreakpoints", {
     breakpoints: [{
       line: 42,
       condition: "x > 5",
       hitCondition: "3"  // Break on 3rd hit
     }]
   });
   ```

2. **Exception Breakpoints**
   ```typescript
   await sendDAPRequest(host, port, "setExceptionBreakpoints", {
     filters: ["runtime", "uncaught"]
   });
   ```

3. **Variable Watching**
   ```typescript
   await sendDAPRequest(host, port, "setVariable", {
     variablesReference: 1000,
     name: "watchExpression",
     value: "user.id"
   });
   ```

## Troubleshooting

### Common Issues

1. **"No DAP server found"**
   - Ensure VSCode debugger is running
   - Check `lsof -i -P -n | grep dlv`
   - Verify port number in debug console

2. **"Connection timeout"**
   - Check firewall settings
   - Verify host/port combination
   - Ensure debugger is not paused

3. **"Protocol error"**
   - Check DAP command syntax
   - Verify arguments format
   - Review debugger logs

### Debug Commands

```bash
# Check running DAP servers
lsof -i -P -n | grep dlv

# Test DAP connection manually
telnet 127.0.0.1 49279

# View debugger logs
tail -f ~/.vscode/extensions/logs/delve.log
```

## Testing

### Unit Tests

```typescript
describe('DAP Operations', () => {
  test('should initialize DAP session', async () => {
    const response = await sendDAPRequest('127.0.0.1', 49279, 'initialize', initArgs);
    expect(response.success).toBe(true);
  });
});
```

### Integration Tests

```typescript
describe('DAP Workflow', () => {
  test('should complete full debug cycle', async () => {
    // Initialize
    await sendDAPRequest(host, port, 'initialize', initArgs);

    // Set breakpoint
    await sendDAPRequest(host, port, 'setBreakpoints', breakpointArgs);

    // Launch
    await sendDAPRequest(host, port, 'launch', launchArgs);

    // Continue to breakpoint
    await sendDAPRequest(host, port, 'continue', { threadId: 1 });

    // Verify breakpoint hit
    // ... assertions
  });
});
```

## References

- [Debug Adapter Protocol Specification](https://microsoft.github.io/debug-adapter-protocol/)
- [VSCode DAP Implementation](https://github.com/microsoft/vscode-debugadapter-node)
- [Delve DAP Documentation](https://github.com/go-delve/delve/tree/master/Documentation/api)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)

## Contributing

When modifying DAP implementation:

1. Maintain backward compatibility
2. Add comprehensive error handling
3. Update this documentation
4. Add tests for new features
5. Follow existing code patterns

---

**Last Updated:** November 2025
**Version:** 1.0.0
**Authors:** gibRun Development Team</content>
<parameter name="filePath">/Users/rusli/Project/ai/mcp/gibrun/doc/dap_implementation.md