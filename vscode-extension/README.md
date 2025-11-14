# GibRun Project Analyzer VS Code Extension

AI-powered project analysis and insights directly in your IDE.

## Features

### Real-time Diagnostics
- **Architecture Violations**: Detect dependency direction violations and circular dependencies
- **Code Quality Issues**: Identify complexity hotspots, console.log statements, and TODO comments
- **Security Vulnerabilities**: Highlight dependency security issues with fix suggestions

### Project Analysis Dashboard
- **Architecture Overview**: Layer organization, dependency graphs, and pattern detection
- **Code Quality Metrics**: Complexity analysis, duplication detection, and maintainability scores
- **Dependency Analysis**: Security scanning, license compliance, and impact analysis
- **Development Metrics**: Velocity tracking, productivity analysis, and team insights
- **Health Assessment**: Overall project health scoring with risk assessment
- **AI Insights**: Pattern recognition, anomaly detection, and personalized recommendations

### Interactive Features
- **Code Actions**: Quick fixes for identified issues
- **Hover Information**: Contextual insights on hover
- **Status Bar Integration**: Real-time health score display
- **Incremental Analysis**: Automatic analysis on file changes

## Requirements

- VS Code 1.74.0 or later
- GibRun MCP Server running (default: localhost:3000)
- Node.js project or supported language project

## Installation

1. Install the extension from VS Code Marketplace
2. Ensure GibRun MCP Server is running
3. Open a supported project in VS Code
4. The extension will automatically activate

## Configuration

### MCP Server Connection
```json
{
  "gibrun.mcpServer.host": "localhost",
  "gibrun.mcpServer.port": 3000
}
```

### Analysis Settings
```json
{
  "gibrun.analysis.autoRefresh": true,
  "gibrun.analysis.debounceMs": 1000,
  "gibrun.diagnostics.enable": true
}
```

### Diagnostic Severity
```json
{
  "gibrun.diagnostics.severity.architectural": "warning",
  "gibrun.diagnostics.severity.quality": "information"
}
```

## Usage

### Manual Analysis
1. Open Command Palette (`Ctrl+Shift+P`)
2. Run `GibRun: Analyze Project`
3. View results in the Analysis sidebar panel

### Real-time Monitoring
- Diagnostics appear automatically in files
- Status bar shows current health score
- Analysis refreshes on file changes (configurable)

### Code Actions
- Hover over diagnostics for quick fix suggestions
- Use `Ctrl+.` to see available code actions

## Supported Languages

- **JavaScript/TypeScript** (primary support)
- **Go** (full support)
- **Python** (full support)
- **Java** (full support)
- **C#** (full support)
- **C/C++** (basic support)

## Commands

| Command | Description |
|---------|-------------|
| `gibrun.analyzeProject` | Run full project analysis |
| `gibrun.showHealthDashboard` | Open health dashboard |
| `gibrun.refreshAnalysis` | Refresh current analysis |

## Troubleshooting

### Connection Issues
- Ensure GibRun MCP Server is running
- Check MCP server host/port configuration
- Verify network connectivity

### Analysis Not Working
- Check if project has supported files
- Verify MCP server has analysis tools available
- Check VS Code output panel for errors

### Performance Issues
- Adjust `gibrun.analysis.debounceMs` for slower analysis
- Disable `gibrun.analysis.autoRefresh` for manual control
- Check MCP server performance

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes and test thoroughly
4. Submit a pull request

## License

MIT License - see LICENSE file for details