# gibRun MCP Server - Project Overview

## 🎯 Project Vision

**gibRun** adalah Model Context Protocol (MCP) Server yang dirancang untuk membantu backend programmer dalam melakukan end-to-end API testing dengan cara yang intelligent dan automated.

### Problem Statement

Backend programmer sering menghadapi workflow testing yang repetitif:
1. Query database untuk get test data
2. Test API endpoint dengan curl
3. Check hasil di database
4. Jika ada bug → fix code → rebuild → test ulang
5. Repeat sampai semua test pass

**gibRun memecahkan masalah ini** dengan memberikan AI akses langsung ke:
- PostgreSQL database (untuk query dan verify data)
- HTTP client (untuk test API)
- Go build tools (untuk rebuild otomatis)
- File system (untuk read/write code)

## 🏗️ Architecture

```
 ┌─────────────────────────────────────────────────────────────┐
 │                        AI Assistant                         │
 │                  (Claude, GPT, etc.)                        │
 └────────────────────────┬────────────────────────────────────┘
                          │ MCP Protocol
                          │
 ┌────────────────────────┴────────────────────────────────────┐
 │                   gibRun MCP Server                         │
 │  ┌──────────────────────────────────────────────────────┐  │
 │  │                      Tools                            │  │
 │  │  • postgres_query     • http_request                 │  │
 │  │  • build_go_project   • run_go_command               │  │
 │  │  • read_source_file   • write_source_file            │  │
 │  │  • multi_file_reader • multi_file_editor             │  │
 │  │  • project_file_manager • file_template_manager      │  │
 │  │  • execute_shell_command • dap_restart               │  │
 │  │  • dap_send_command   • debugger_tools (10+)         │  │
 │  └──────────────────────────────────────────────────────┘  │
 └───┬────────────┬────────────────┬────────────────┬─────────┘
     │            │                │                │
     ▼            ▼                ▼                ▼
 ┌────────┐  ┌─────────┐  ┌──────────────┐  ┌──────────┐
 │   DB   │  │   API   │  │  Go Project  │  │   Files  │
 │ Postgres  │  HTTP   │  │   Builder    │  │  System  │
 └────────┘  └─────────┘  └──────────────┘  └──────────┘
```

Mulai versi ini, arsitektur juga menyertakan **Go Debugger Proxy** yang menjalankan `external/mcp-go-debugger` di dalam proses terpisah melalui transport STDIO MCP client. Semua tool debugger Delve dari proyek tersebut diteruskan secara transparan ke AI assistant, sehingga gibRun dapat melakukan **launch/attach**, mengatur breakpoint, dan menganalisis variabel langsung dari workspace yang sama tanpa menjalankan dua MCP server terpisah.

## 📁 Project Structure

```
gibRun/
│
├── src/
│   ├── goDebuggerProxy.ts    # Wrapper untuk proxied mcp-go-debugger tools
│   ├── logger.ts             # Structured logging utilities
│   └── index.ts              # Main MCP server implementation
│
├── external/
│   └── mcp-go-debugger/      # Upstream Go debugger yang diproxy oleh gibRun
│
├── build/                    # Compiled JavaScript
│   ├── index.js
│   └── index.d.ts
│
├── test-example/             # Example Go API for testing
│   ├── sample-api.go         # REST API implementation
│   ├── schema.sql            # Database schema
│   ├── go.mod                # Go dependencies
│   ├── Dockerfile            # Container for API
│   ├── TEST_SCENARIOS.md     # 19+ test scenarios
│   └── README.md             # Test example docs
│
├── config.example.json       # Configuration template
├── docker-compose.yml        # PostgreSQL setup
│
├── .gibrun/                  # Template system
│   ├── config.json          # Template configuration
│   └── templates/           # Code templates
│       ├── api/             # API templates
│       └── database/        # Database templates
│
├── README.md                 # Main documentation
├── QUICKSTART.md             # 10-minute getting started
├── EXAMPLES.md               # Usage examples & scenarios
├── CONTRIBUTING.md           # Contribution guidelines
├── LICENSE                   # MIT License
│
├── package.json              # NPM package config
├── tsconfig.json             # TypeScript config
└── .gitignore                # Git ignore rules
```

## 🛠️ Available Tools

### 1. **postgres_query**
Execute PostgreSQL queries untuk:
- Get test data (UIDs, credentials)
- Verify API results
- Check database state
- Data validation

**Example**:
```typescript
{
  connection_string: "postgresql://user:pass@localhost:5432/db",
  query: "SELECT id FROM users WHERE email = $1",
  params: ["test@example.com"]
}
```

### 2. **http_request**
Make HTTP requests untuk test API:
- All methods: GET, POST, PUT, PATCH, DELETE
- Custom headers dan authentication
- Request body (JSON)
- Response time tracking

**Example**:
```typescript
{
  url: "http://localhost:8080/api/users",
  method: "POST",
  headers: { "Authorization": "Bearer token" },
  body: { email: "new@example.com", name: "New User" }
}
```

### 3. **build_go_project**
Build Go projects dengan:
- Custom build flags
- Output path specification
- Error reporting
- Seamless integration dengan debugger

**Example**:
```typescript
{
  project_path: "/path/to/project",
  build_flags: "-v -race",
  output_path: "./bin/api"
}
```

### 4. **run_go_command**
Execute arbitrary Go commands:
- Run tests: `go test ./...`
- Run application: `go run main.go`
- Manage deps: `go mod tidy`

**Example**:
```typescript
{
  project_path: "/path/to/project",
  command: "test -v -race ./..."
}
```

### 5. **read_source_file**
Read source code untuk:
- Examine code before fixing
- Debug issues
- Code review

**Example**:
```typescript
{
  file_path: "/path/to/handlers/user.go"
}
```

### 6. **write_source_file**
Write/update source code untuk:
- Fix bugs
- Implement features
- Update logic

**Example**:
```typescript
{
  file_path: "/path/to/handlers/user.go",
  content: "package handlers\n\n// Fixed code..."
}
```

### 7. **execute_shell_command**
Execute arbitrary shell commands:
- Cleanup operations
- File operations
- Custom scripts

**Example**:
```typescript
{
  command: "rm -rf /tmp/test-data",
  working_dir: "/path/to/project"
}
```

### 8. **multi_file_reader** 🔥 NEW
Read multiple source files simultaneously:
- Batch file reading for analysis
- Project-wide code examination
- Efficient multi-file operations

**Example**:
```typescript
{
  paths: ["/path/to/file1.go", "/path/to/file2.go"],
  max_file_size_kb: 1024
}
```

### 9. **multi_file_editor** 🔥 NEW
Edit multiple files with advanced operations:
- Batch find and replace across files
- Template-based code generation
- Bulk refactoring operations

**Example**:
```typescript
{
  base_dir: "/path/to/project",
  edits: [{
    file_path: "handlers/user.go",
    old_string: "old code",
    new_string: "new code"
  }]
}
```

### 10. **project_file_manager** 🔥 NEW
Advanced project file management:
- Project structure analysis
- File organization and validation
- Bulk file operations with safety checks

**Example**:
```typescript
{
  operation: "analyze",
  base_dir: "/path/to/project",
  include_patterns: ["*.go", "*.ts"]
}
```

### 11. **file_template_manager** 🔥 NEW
Template-based file generation:
- Code scaffolding from templates
- Consistent file structure creation
- Template management and customization

**Example**:
```typescript
{
  template_name: "express-route",
  output_path: "routes/users.js",
  variables: { entity: "User", path: "/users" }
}
```

### 12. **dap_restart** 🔥 NEW
Restart debugging session via Debug Adapter Protocol:
- Hot reload after code fixes
- Auto rebuild before restart
- Preserve breakpoints

**Example**:
```typescript
{
  port: 49279,  // From VSCode debug console
  host: "127.0.0.1",
  rebuild_first: true,
  project_path: "/path/to/project"
}
```

### 13. **dap_send_command** 🔥 NEW
Send custom DAP commands for advanced control:
- Set breakpoints programmatically
- Evaluate expressions
- Custom debugging operations

**Example**:
```typescript
{
  port: 49279,
  command: "evaluate",
  arguments: { expression: "userID" }
}
```

### 14. **Debugger Toolset (proxied from `external/mcp-go-debugger`)**

gibRun kini menjalankan instance `mcp-go-debugger` di belakang layar dan mengekspos seluruh tool-nya:

- `launch` – jalankan binary Go dengan Delve.
- `attach` – attach ke proses berdasarkan PID.
- `debug` – compile & debug 1 file Go.
- `debug_test` – fokus pada satu fungsi test (dengan test flags).
- `set_breakpoint` / `list_breakpoints` / `remove_breakpoint`.
- `continue`, `step`, `step_over`, `step_out`.
- `eval_variable` – evaluasi ekspresi dengan kedalaman custom.
- `get_debugger_output` – tarik STDOUT/STDERR + konteks debug.
- `close` – hentikan sesi debugger aktif.

Proxy mencoba menjalankan binary `mcp-go-debugger` dari PATH. Jika tidak ada, gibRun fallback ke `go run ./cmd/mcp-go-debugger` di dalam folder `external/mcp-go-debugger`. Anda bisa override perilaku ini melalui environment:

| Env Var | Fungsi |
|---------|--------|
| `GIBRUN_GO_DEBUGGER_COMMAND` | Path kustom ke executable `mcp-go-debugger` |
| `GIBRUN_GO_DEBUGGER_ARGS` | Argumen tambahan (dipisah spasi sederhana) |
| `GIBRUN_GO_DEBUGGER_CWD` | Working directory untuk proses debugger |

Jika proxy gagal start (misalnya Go/delve belum ter-install), server tetap berjalan dengan tools lokal saja.

## 🔄 Typical Workflow

### Scenario: Test User Registration API

```
1. AI Query Database
   └─> postgres_query: "SELECT COUNT(*) FROM users WHERE email = ?"
   
2. AI Test API
   └─> http_request: POST /api/users
   
3. AI Verify in Database
   └─> postgres_query: "SELECT * FROM users WHERE email = ?"
   
4. If Test Failed:
   ├─> read_source_file: Read handler code
   ├─> AI analyzes bug
   ├─> write_source_file: Fix code
   ├─> build_go_project: Rebuild
   └─> Go back to step 2
   
5. Test Passed!
   └─> Generate report
```

## 🎯 Use Cases

### 1. Manual API Testing
```
Developer: "Test create user API dengan email test@example.com"
AI: *executes full workflow with verification*
```

### 2. Auto Bug Fixing
```
Developer: "Test all CRUD operations, fix any bugs found"
AI: *tests, finds issues, fixes code, rebuilds, retests*
```

### 3. Load Testing
```
Developer: "Create 1000 users concurrently, track performance"
AI: *generates data, makes requests, analyzes metrics*
```

### 4. Database Verification
```
Developer: "After each API call, verify database state matches"
AI: *executes API tests with database validation*
```

### 5. Regression Testing
```
Developer: "Run all test scenarios dari TEST_SCENARIOS.md"
AI: *executes 19+ scenarios, generates report*
```

### 6. Integration Testing
```
Developer: "Test complete user journey from registration to deletion"
AI: *orchestrates multi-step test flow*
```

## 📊 Success Metrics

### Speed
- Setup time: < 5 minutes
- First test: < 1 minute
- Bug fix cycle: < 2 minutes

### Automation
- 90% reduction in manual testing time
- Automatic bug detection and fixing
- Seamless rebuild and retest

### Quality
- Database-verified results
- Comprehensive error reporting
- Performance metrics tracking

## 🚀 Key Features

### ✅ Intelligent Testing
- AI understands test requirements
- Generates test data automatically
- Validates results comprehensively

### ✅ Auto Bug Fixing
- Detects issues automatically
- Analyzes root cause
- Proposes and applies fixes
- Rebuilds and retests

### ✅ Database Integration
- Direct PostgreSQL access
- Query test data
- Verify API results
- Data consistency checks

### ✅ Performance Monitoring
- Response time tracking
- Success rate calculation
- Load testing support
- Metrics reporting

### ✅ Seamless Development
- Integrated with VSCode debugger
- Auto rebuild on changes
- Hot reload support
- Continuous testing

## 🎓 Learning Curve

### Beginner (5 minutes)
```
"Test health check endpoint"
```
Start with simple requests.

### Intermediate (10 minutes)
```
"Create user, verify in database, then delete"
```
Combine multiple operations.

### Advanced (30 minutes)
```
"Run full regression test suite with performance metrics"
```
Complex workflows with reporting.

### Expert (1 hour+)
```
"Setup continuous testing with auto-fix on failures"
```
Full automation setup.

## 🔮 Future Enhancements

### Near Term (v1.1)
- [ ] MySQL/MariaDB support
- [ ] MongoDB support
- [ ] Authentication helpers (JWT, OAuth)
- [ ] Test data generators

### Medium Term (v1.2)
- [ ] GraphQL testing
- [ ] WebSocket testing
- [ ] gRPC testing
- [ ] Performance profiling

### Long Term (v2.0)
- [ ] Multi-language support (Python, Node.js, Java)
- [ ] CI/CD integration
- [ ] Test coverage reporting
- [ ] Security scanning
- [ ] API documentation generation

## 🤝 Contributing

We welcome contributions! See `CONTRIBUTING.md` for:
- Code style guidelines
- Development workflow
- Testing requirements
- Pull request process

## 📚 Documentation

| Document | Purpose | Target Audience |
|----------|---------|-----------------|
| `README.md` | Complete reference | All users |
| `QUICKSTART.md` | Fast setup guide | New users |
| `EXAMPLES.md` | Usage scenarios | Intermediate users |
| `CONTRIBUTING.md` | Development guide | Contributors |
| `test-example/TEST_SCENARIOS.md` | Test cases | QA/Testers |

## 🎯 Target Users

### Backend Developers
- Need to test APIs frequently
- Want faster iteration cycles
- Value automation

### QA Engineers
- Need comprehensive test coverage
- Want reproducible tests
- Need detailed reports

### DevOps Engineers
- Need CI/CD integration
- Want automated testing
- Need performance metrics

### Team Leads
- Need quality assurance
- Want consistent testing
- Need test documentation

## 💡 Why gibRun?

| Traditional Approach | With gibRun |
|---------------------|-------------|
| Manual curl commands | AI-powered requests |
| Manual database queries | Automated verification |
| Manual code fixing | AI-assisted fixes |
| Manual rebuild | Automatic rebuild |
| Manual retest | Automatic retest |
| Single file editing | Multi-file batch operations |
| Manual file management | Template-based scaffolding |
| Minutes per test | Seconds per test |
| Error-prone | Consistent & reliable |
| No test history | Full test reports |

## 🌟 Success Stories

### Story 1: 90% Time Reduction
> "Before gibRun: 30 minutes to test all endpoints manually.
> After gibRun: 3 minutes with comprehensive reporting."
> 
> — Backend Developer

### Story 2: Bug Detection
> "gibRun found 5 edge cases I hadn't considered.
> It fixed 3 of them automatically."
> 
> — QA Engineer

### Story 3: CI/CD Integration
> "Integrated gibRun into our pipeline.
> Now every commit gets fully tested automatically."
> 
> — DevOps Engineer

## 📞 Support

- **Documentation**: Read the docs
- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions
- **Email**: support@gibrun.dev

## 📄 License

MIT License - see `LICENSE` file

---

**Built with ❤️ for Backend Developers**

gibRun - Making API testing intelligent, automated, and enjoyable.
