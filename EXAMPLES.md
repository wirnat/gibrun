# gibRun MCP Server - Contoh Penggunaan

## Overview

gibRun MCP Server menyediakan **25+ tools** untuk otomasi development workflow, termasuk:
- **Database Operations**: PostgreSQL queries dan management
- **HTTP Testing**: REST API testing dengan comprehensive error handling
- **File Operations**: Multi-file reading, editing, dan project management
- **DAP Debugging**: Advanced Go debugging dengan 13 specialized tools
- **Project Analysis**: Code quality, dependencies, dan architecture analysis
- **Template Management**: Code generation dengan variable substitution
- **Build Tools**: Go project building dan command execution

## Scenario 1: Testing User Registration API

### Step 1: Check apakah email sudah terdaftar

```
User: "Cek apakah email test@example.com sudah ada di database"

AI menggunakan tool postgres_query:
{
  "connection_string": "postgresql://user:password@localhost:5432/myapp",
  "query": "SELECT id, email, created_at FROM users WHERE email = $1",
  "params": ["test@example.com"]
}

Response:
{
  "success": true,
  "rowCount": 0,
  "rows": []
}
```

### Step 2: Test registration endpoint

```
AI menggunakan tool http_request:
{
  "url": "http://localhost:8080/api/auth/register",
  "method": "POST",
  "headers": {
    "Content-Type": "application/json"
  },
  "body": {
    "email": "test@example.com",
    "password": "SecurePass123!",
    "name": "Test User"
  }
}

Response:
{
  "success": true,
  "status": 201,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "test@example.com",
    "message": "User registered successfully"
  },
  "duration_ms": 245
}
```

### Step 3: Verify di database

```
AI menggunakan tool postgres_query:
{
  "connection_string": "postgresql://user:password@localhost:5432/myapp",
  "query": "SELECT id, email, name, created_at FROM users WHERE email = $1",
  "params": ["test@example.com"]
}

Response:
{
  "success": true,
  "rowCount": 1,
  "rows": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "test@example.com",
      "name": "Test User",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

✅ **Test Pass**: User berhasil terdaftar di database

---

## Scenario 2: Testing dengan Bug dan Auto-Fix

### Step 1: Test update profile API

```
User: "Test update profile endpoint untuk user ID 550e8400-e29b-41d4-a716-446655440000"

AI menggunakan tool http_request:
{
  "url": "http://localhost:8080/api/users/550e8400-e29b-41d4-a716-446655440000",
  "method": "PUT",
  "headers": {
    "Content-Type": "application/json",
    "Authorization": "Bearer eyJhbGc..."
  },
  "body": {
    "name": "Updated Name",
    "bio": "New bio"
  }
}

Response:
{
  "success": false,
  "status": 500,
  "data": {
    "error": "internal server error"
  }
}
```

❌ **Test Failed**: Internal server error

### Step 2: AI analyze error dan read source code

```
AI menggunakan tool read_source_file:
{
  "file_path": "/path/to/project/handlers/user_handler.go"
}

AI menemukan bug di line 45:
result := db.Exec("UPDATE users SET name = $1 WHERE id = $2")
// Missing bio parameter!
```

### Step 3: AI fix code

```
AI menggunakan tool write_source_file:
{
  "file_path": "/path/to/project/handlers/user_handler.go",
  "content": "package handlers\n\nimport (\n\t\"github.com/gin-gonic/gin\"\n)\n\nfunc UpdateUser(c *gin.Context) {\n\t// ... existing code ...\n\t\n\t// Fixed: Include bio in update\n\tresult := db.Exec(\"UPDATE users SET name = $1, bio = $2, updated_at = NOW() WHERE id = $3\",\n\t\tname, bio, userID)\n\t\n\t// ... rest of code ...\n}\n"
}
```

### Step 4: Rebuild project

```
AI menggunakan tool build_go_project:
{
  "project_path": "/path/to/project",
  "build_flags": "-v"
}

Response:
{
  "success": true,
  "message": "Build completed successfully"
}
```

### Step 5: Test lagi

```
AI menggunakan tool http_request (retry):
{
  "url": "http://localhost:8080/api/users/550e8400-e29b-41d4-a716-446655440000",
  "method": "PUT",
  "headers": {
    "Content-Type": "application/json",
    "Authorization": "Bearer eyJhbGc..."
  },
  "body": {
    "name": "Updated Name",
    "bio": "New bio"
  }
}

Response:
{
  "success": true,
  "status": 200,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Updated Name",
    "bio": "New bio",
    "updated_at": "2024-01-15T11:00:00Z"
  }
}
```

### Step 6: Verify di database

```
AI menggunakan tool postgres_query:
{
  "connection_string": "postgresql://user:password@localhost:5432/myapp",
  "query": "SELECT name, bio, updated_at FROM users WHERE id = $1",
  "params": ["550e8400-e29b-41d4-a716-446655440000"]
}

Response:
{
  "success": true,
  "rowCount": 1,
  "rows": [
    {
      "name": "Updated Name",
      "bio": "New bio",
      "updated_at": "2024-01-15T11:00:00Z"
    }
  ]
}
```

✅ **Test Pass**: Update berhasil, bug fixed!

---

## Scenario 3: Complex E2E Test - Order Processing

### Flow:
1. Create user
2. Create product
3. Create order
4. Process payment
5. Verify order status in database
6. Test order retrieval API

```
User: "Test complete order processing flow untuk new user"

AI akan otomatis:
1. postgres_query - Check/create test user
2. http_request - POST /api/products (create product)
3. postgres_query - Verify product created
4. http_request - POST /api/orders (create order)
5. postgres_query - Get order details dengan JOIN
6. http_request - POST /api/payments (process payment)
7. postgres_query - Verify payment status
8. http_request - GET /api/orders/{id} (retrieve order)
9. Validate response matches database
```

### Example Query dengan JOIN:

```sql
SELECT 
  o.id,
  o.status,
  o.total_amount,
  u.email as user_email,
  p.status as payment_status,
  p.paid_at
FROM orders o
JOIN users u ON o.user_id = u.id
LEFT JOIN payments p ON o.id = p.order_id
WHERE o.id = $1
```

---

## Scenario 4: Load Testing dengan Loop

```
User: "Test create 100 users dan verify semuanya masuk database"

AI akan:
1. Loop 100x:
   - http_request POST /api/users
   - Collect user IDs
2. postgres_query - Count total users
3. postgres_query - Verify all IDs exist
4. Report success rate
```

---

## Scenario 5: Testing dengan Environment Variables

```
User: "Run tests tapi restart server dulu dengan env DEV mode"

AI menggunakan tools:
1. execute_shell_command:
{
  "command": "pkill -f myapp",
  "working_dir": "/path/to/project"
}

2. execute_shell_command:
{
  "command": "APP_ENV=dev go run main.go &",
  "working_dir": "/path/to/project"
}

3. Continue with testing...
```

---

## Scenario 6: Integration Test dengan External Services

### Testing email verification flow:

```
1. postgres_query - Create user dengan unverified status
2. http_request - POST /api/auth/send-verification
3. postgres_query - Get verification token from database
4. http_request - GET /api/auth/verify?token={token}
5. postgres_query - Check user status changed to verified
```

---

## Available Tools Reference

### Database Tools (4 tools)
- `postgres_query` - Execute SQL queries dengan parameterized statements
- `postgres_execute` - Execute INSERT/UPDATE/DELETE operations
- `postgres_list_tables` - List all tables in database
- `postgres_describe_table` - Get detailed table schema

### HTTP Tools (2 tools)
- `http_request` - Make HTTP requests dengan full control (headers, body, auth)
- `http_get` - Simple GET requests untuk quick API checks

### File System Tools (7 tools)
- `read_source_file` - Read single file content
- `write_source_file` - Write content to single file
- `execute_shell_command` - Execute shell commands
- `multi_file_reader` - Read multiple files dengan filtering
- `multi_file_editor` - Batch editing across multiple files
- `project_file_manager` - Advanced project analysis & management
- `file_template_manager` - Code generation dengan templates

### DAP Debugging Tools (13+ tools)
- `dap_initialize` - Initialize debugging session
- `dap_launch` - Launch program untuk debugging
- `dap_attach` - Attach ke running process
- `dap_breakpoint_set` - Set breakpoints dengan conditions
- `dap_breakpoint_list` - List active breakpoints
- `dap_execution_continue` - Continue execution
- `dap_execution_step_over` - Step over current line
- `dap_execution_step_into` - Step into function calls
- `dap_execution_step_out` - Step out of current function
- `dap_inspect_variables` - Inspect local variables
- `dap_inspect_stack` - View call stack
- `dap_evaluate` - Evaluate expressions
- `dap_disconnect` - End debugging session

### Project Analysis Tools (6 tools)
- `project_analyzer/architecture` - Analyze code architecture & layering
- `project_analyzer/quality` - Code quality metrics & complexity
- `project_analyzer/dependencies` - Dependency analysis & security
- `project_analyzer/metrics` - Development productivity metrics
- `project_analyzer/health` - Overall project health assessment
- `project_analyzer/insights` - AI-powered insights & recommendations

### Build & Development Tools (3 tools)
- `build_go_project` - Build Go applications dengan flags
- `run_go_command` - Execute arbitrary Go commands
- `go_test_runner` - Run Go tests dengan coverage

## Scenario 7: Multi-File Code Analysis & Refactoring

### Step 1: Analyze project structure

```
User: "Analyze structure dari src/ directory dan berikan overview"

AI menggunakan tool project_file_manager:
{
  "operation": "analyze",
  "analyze": {
    "analysis_type": "structure",
    "include_patterns": ["src/**"],
    "exclude_patterns": ["node_modules/**"]
  }
}

Response:
{
  "analysis_type": "structure",
  "total_files": 45,
  "directories": {
    "src/core/": 8,
    "src/services/": 12,
    "src/tools/": 25
  },
  "file_types": {
    "typescript": 38,
    "json": 5,
    "markdown": 2
  },
  "total_size": 1250000
}
```

### Step 2: Find code patterns across files

```
AI menggunakan tool multi_file_reader:
{
  "glob_patterns": ["src/**/*.ts"],
  "search_terms": ["console\\.log"],
  "max_files": 20
}

Response:
{
  "files": [
    {
      "path": "src/services/logger-service.ts",
      "matches": [
        {
          "line": 15,
          "content": "console.log('Logger initialized')"
        }
      ]
    }
  ],
  "summary": {
    "total_files": 3,
    "successful_reads": 3,
    "total_matches": 5
  }
}
```

### Step 3: Batch refactoring across files

```
AI menggunakan tool multi_file_editor:
{
  "operation": "search_replace",
  "target_files": {
    "glob_patterns": ["src/**/*.ts"],
    "exclude_patterns": ["src/services/logger-service.ts"]
  },
  "search_replace": {
    "find": "console\\.log",
    "replace": "logger.info",
    "use_regex": true
  },
  "options": {
    "create_backup": true,
    "dry_run": false
  }
}

Response:
{
  "results": [
    {
      "file": "src/core/server.ts",
      "modified": true,
      "backup_created": true,
      "changes_count": 3
    }
  ],
  "summary": {
    "operation": "search_replace",
    "total_files": 5,
    "successful_operations": 5,
    "changes_made": 12
  }
}
```

✅ **Refactoring Complete**: 12 console.log statements updated across 5 files

---

## Scenario 8: Code Generation dengan Templates

### Step 1: Explore available templates

```
User: "Show me available API templates"

AI menggunakan tool file_template_manager:
{
  "operation": "list",
  "category": "api"
}

Response:
{
  "templates": [
    {
      "name": "express-route.ts.template",
      "description": "Express.js API route template",
      "variables": ["endpointName", "method", "path", "framework"]
    },
    {
      "name": "fastify-handler.ts.template",
      "description": "Fastify handler template",
      "variables": ["endpointName", "method", "path", "framework"]
    }
  ],
  "category": "api",
  "total_templates": 2
}
```

### Step 2: Generate API endpoint

```
AI menggunakan tool file_template_manager:
{
  "operation": "apply",
  "template": "api/express-route.ts.template",
  "variables": {
    "endpointName": "createUser",
    "method": "POST",
    "path": "/api/users",
    "framework": "express"
  },
  "output_path": "src/routes/user.routes.ts"
}

Response:
{
  "operation": "apply",
  "template": "api/express-route.ts.template",
  "output_path": "src/routes/user.routes.ts",
  "success": true,
  "variables_applied": 4,
  "file_created": true
}
```

### Step 3: Verify generated code

```
AI menggunakan tool read_source_file:
{
  "file_path": "src/routes/user.routes.ts"
}

Response:
{
  "content": "import { Request, Response } from 'express';\nimport { validateCreateUserInput } from '../validators/user.validator';\nimport { CreateUserService } from '../services/user.service';\n\nexport const createUserHandler = async (req: Request, res: Response) => {\n  try {\n    const input = validateCreateUserInput(req.body);\n    const result = await CreateUserService.process(input);\n\n    res.json({\n      success: true,\n      data: result,\n      message: 'createUser processed successfully'\n    });\n  } catch (error) {\n    console.error('Error in createUserHandler:', error);\n    res.status(500).json({\n      success: false,\n      error: error.message\n    });\n  }\n};",
  "metadata": {
    "size": 512,
    "encoding": "utf8",
    "lines": 22
  }
}
```

✅ **Template Applied**: API endpoint generated dengan proper validation dan error handling

---

## Scenario 9: Project Health Assessment

### Step 1: Analyze code quality metrics

```
User: "Assess code quality dari project ini"

AI menggunakan tool project_analyzer/quality:
{
  "operation": "quality",
  "scope": "full"
}

Response:
{
  "operation": "quality",
  "metrics": {
    "complexity_score": 2.3,
    "test_coverage": 85,
    "duplication_rate": 3.2,
    "maintainability_index": 78,
    "total_files": 45,
    "total_lines": 8500
  },
  "recommendations": [
    "Consider breaking down functions with complexity > 10",
    "Test coverage is good at 85%",
    "Duplication rate is acceptable at 3.2%"
  ]
}
```

### Step 2: Check dependency health

```
AI menggunakan tool project_analyzer/dependencies:
{
  "operation": "dependencies",
  "scope": "full"
}

Response:
{
  "operation": "dependencies",
  "dependencies": {
    "total_dependencies": 45,
    "outdated_packages": 3,
    "security_vulnerabilities": 0,
    "unused_dependencies": 2
  },
  "recommendations": [
    "Update 3 outdated packages",
    "Remove 2 unused dependencies",
    "No security vulnerabilities found"
  ]
}
```

### Step 3: Analyze architecture patterns

```
AI menggunakan tool project_analyzer/architecture:
{
  "operation": "architecture",
  "scope": "full"
}

Response:
{
  "operation": "architecture",
  "layers": {
    "presentation": ["src/routes/", "src/controllers/"],
    "business": ["src/services/"],
    "data": ["src/models/", "src/repositories/"]
  },
  "patterns": {
    "service_layer": true,
    "repository_pattern": true,
    "dependency_injection": true
  },
  "issues": [
    "Circular dependency detected between service A and B"
  ]
}
```

✅ **Assessment Complete**: Project health good dengan beberapa improvement opportunities

---

## Scenario 10: Advanced DAP Debugging Workflow

### Step 1: Setup debugging session

```
User: "Debug Go application dengan advanced features"

AI menggunakan tool dap_initialize:
{
  "host": "localhost",
  "port": 49280,
  "clientID": "gibRun-debugger",
  "adapterID": "go"
}

Response:
{
  "success": true,
  "session_id": "dap-session-123",
  "capabilities": {
    "supportsConfigurationDoneRequest": true,
    "supportsBreakpointLocationsRequest": true,
    "supportsConditionalBreakpoints": true
  }
}
```

### Step 2: Set conditional breakpoints

```
AI menggunakan tool dap_breakpoint_set:
{
  "source": {
    "path": "main.go"
  },
  "breakpoints": [
    {
      "line": 25,
      "condition": "userID > 1000"
    },
    {
      "line": 45,
      "hitCondition": "3"
    }
  ]
}

Response:
{
  "breakpoints": [
    {
      "id": 1,
      "verified": true,
      "line": 25,
      "condition": "userID > 1000"
    },
    {
      "id": 2,
      "verified": true,
      "line": 45,
      "hitCondition": "3"
    }
  ]
}
```

### Step 3: Launch and debug

```
AI menggunakan tool dap_launch:
{
  "program": "/app/main",
  "args": ["--env=debug", "--port=8080"],
  "env": {
    "DEBUG": "true",
    "LOG_LEVEL": "debug"
  }
}

Response:
{
  "success": true,
  "thread_id": 1,
  "message": "Process launched successfully"
}
```

### Step 4: Inspect variables at breakpoint

```
AI menggunakan tool dap_inspect_variables:
{
  "variablesReference": 123
}

Response:
{
  "variables": [
    {
      "name": "userID",
      "value": "1500",
      "type": "int",
      "variablesReference": 0
    },
    {
      "name": "userData",
      "value": "{id: 1500, name: \"John\"}",
      "type": "User",
      "variablesReference": 124
    }
  ]
}
```

### Step 5: Step through execution

```
AI menggunakan tool dap_step_over:
{
  "threadId": 1
}

Response:
{
  "success": true,
  "stopped": true,
  "reason": "step",
  "line": 46,
  "column": 12
}
```

✅ **Debugging Complete**: Advanced breakpoint dan variable inspection berhasil

---

## Scenario 11: Complex Multi-Tool CI/CD Workflow

### Automated deployment pipeline testing:

```
User: "Test complete CI/CD pipeline: build → test → deploy → verify"

AI orchestrates complete workflow:

1. build_go_project - Build application
2. execute_shell_command - Run tests  
3. postgres_query - Verify database migrations
4. http_request - Health check deployed service
5. multi_file_reader - Verify config files deployed
6. project_analyzer/health - Final health assessment
```

### Step-by-step execution:

#### Step 1: Build project
```
AI menggunakan tool build_go_project:
{
  "project_path": "/workspace/myapp",
  "build_flags": ["-v", "-race"],
  "output_path": "bin/myapp"
}

Response: ✅ Build successful
```

#### Step 2: Run tests
```
AI menggunakan tool execute_shell_command:
{
  "command": "go test ./... -v -race -cover",
  "cwd": "/workspace/myapp"
}

Response: ✅ All tests passed (85% coverage)
```

#### Step 3: Deploy to staging
```
AI menggunakan tool execute_shell_command:
{
  "command": "./scripts/deploy.sh staging",
  "cwd": "/workspace/myapp"
}

Response: ✅ Deployment successful
```

#### Step 4: Verify deployment
```
AI menggunakan tool http_request:
{
  "url": "https://staging-api.myapp.com/health",
  "method": "GET",
  "timeout": 10000
}

Response: ✅ Service healthy (200 OK)
```

#### Step 5: Verify configuration
```
AI menggunakan tool multi_file_reader:
{
  "paths": ["/etc/myapp/config.json", "/etc/myapp/.env"],
  "include_content": false,
  "include_metadata": true
}

Response: ✅ Config files deployed correctly
```

#### Step 6: Final health check
```
AI menggunakan tool project_analyzer/health:
{
  "operation": "health",
  "scope": "production"
}

Response: ✅ All systems operational
```

✅ **CI/CD Pipeline Complete**: Build → Test → Deploy → Verify berhasil

---

## Scenario 6: Integration Test dengan External Services

### Testing email verification flow:

```
1. postgres_query - Create user dengan unverified status
2. http_request - POST /api/auth/send-verification
3. postgres_query - Get verification token from database
4. http_request - GET /api/auth/verify?token={token}
5. postgres_query - Check user status changed to verified
```

---

## Tips Penggunaan

### 1. Natural Language Commands

Anda bisa memberikan instruksi natural untuk berbagai use cases:

#### Database & API Testing:
- "Test registration API dengan email baru"
- "Check apakah ada users duplicate di database"
- "Verify payment flow end-to-end"

#### File Operations:
- "Refactor semua console.log ke logger.info di src/"
- "Analyze code quality dari project ini"
- "Generate API endpoint untuk user management"
- "Find semua TODO comments di codebase"

#### Debugging:
- "Debug Go app dengan breakpoint di main.go line 25"
- "Inspect variables saat error terjadi"
- "Step through user registration flow"

#### Project Management:
- "Assess overall project health"
- "Check for security vulnerabilities"
- "Analyze dependency usage"

### 2. AI akan otomatis:
- Choose tools yang tepat berdasarkan context
- Handle errors gracefully dengan retry logic
- Provide detailed reports dan recommendations
- Orchestrate multi-step workflows
- Generate code dan configurations

### 3. Complex Workflows

AI bisa handle workflows kompleks dengan multiple tools:

#### Full-Stack Development:
```
User: "Build complete user management feature: API → Database → Tests → Documentation"
```

AI akan:
1. `file_template_manager` - Generate API endpoints
2. `postgres_query` - Create database schema
3. `multi_file_editor` - Generate tests
4. `execute_shell_command` - Run tests
5. `project_analyzer` - Verify implementation

#### Debugging & Fixing:
```
User: "Debug and fix user registration API that's returning 500 errors"
```

AI akan:
1. `http_request` - Reproduce the error
2. `read_source_file` - Examine relevant code
3. `postgres_query` - Check database state
4. `dap_initialize` - Start debugging session
5. `multi_file_editor` - Apply fixes
6. `build_go_project` - Rebuild application
7. `http_request` - Verify fix

#### Code Quality Improvement:
```
User: "Improve code quality across the entire codebase"
```

AI akan:
1. `project_analyzer/quality` - Assess current quality
2. `multi_file_reader` - Find problematic patterns
3. `multi_file_editor` - Apply fixes automatically
4. `project_analyzer/dependencies` - Check dependencies
5. `file_template_manager` - Generate improved code patterns

### 4. Debugging

```
User: "API returning 500 error, debug dan fix"

AI akan:
1. Check logs (execute_shell_command)
2. Read relevant source files
3. Identify issue
4. Propose fix
5. Write fixed code
6. Rebuild
7. Test again
```

---

## Best Practices

### 1. Database & API Testing

#### Connection String Security:
- Use environment variables untuk credentials
- Use connection string dari secure vault
- Never hardcode passwords in code

#### Transaction Testing:
```sql
BEGIN;
-- Your test queries here
ROLLBACK; -- Always rollback to avoid affecting other tests
```

#### Test Data Management:
```sql
-- Cleanup before tests
DELETE FROM users WHERE email LIKE '%test@example%';

-- Use unique identifiers
INSERT INTO users (email, name) VALUES ('test-123@example.com', 'Test User');
```

### 2. File Operations

#### Safe File Editing:
- Always use `create_backup: true` untuk critical files
- Test dengan `dry_run: true` first
- Use specific file patterns instead of broad globs

#### File Organization:
```typescript
// Good: Specific patterns
{
  "glob_patterns": ["src/**/*.ts"],
  "exclude_patterns": ["**/*.test.ts", "**/*.spec.ts"]
}

// Avoid: Too broad
{
  "glob_patterns": ["**/*"]
}
```

#### Template Management:
- Store templates in `.gibrun/templates/` directory
- Use descriptive variable names in templates
- Validate templates before applying at scale
- Keep templates version-controlled with project code

### 3. Project Analysis

#### Quality Gates:
- Target >80% test coverage
- Complexity score <10 per function
- <5% code duplication
- Regular dependency updates

#### Analysis Interpretation:
```typescript
// Quality metrics guide:
{
  "complexity_score": "< 3.0 (good), 3.0-5.0 (moderate), >5.0 (needs refactoring)",
  "test_coverage": ">80% (good), 60-80% (moderate), <60% (needs improvement)",
  "duplication_rate": "<5% (good), 5-10% (moderate), >10% (high duplication)"
}
```

### 4. Debugging Best Practices

#### Breakpoint Strategy:
- Use conditional breakpoints untuk specific conditions
- Set hit conditions untuk recurring issues
- Combine with variable inspection

#### Session Management:
- Initialize DAP session once per debug session
- Reuse breakpoints across multiple runs
- Clean up sessions properly

### 5. Multi-Tool Workflows

#### Error Recovery:
- AI will automatically retry failed operations
- Use dry-run mode for risky operations
- Always backup before bulk changes

#### Performance Considerations:
- Limit file operations to reasonable batch sizes
- Use specific patterns instead of scanning entire codebase
- Cache analysis results when possible

#### Workflow Patterns:
```typescript
// Safe refactoring workflow:
1. project_analyzer/architecture - Understand current structure
2. multi_file_reader - Identify patterns to change
3. multi_file_editor with dry_run - Preview changes
4. multi_file_editor with backup - Apply changes
5. project_analyzer/quality - Verify improvements
```

### 6. Template Development

#### Template Structure:
```handlebars
// Use clear variable naming
export const ${serviceName}Service = {
  async ${operationName}(${inputType}: ${inputInterface}) {
    // ${operationDescription}
    return await this.${repositoryName}.${operationName}(${inputName});
  }
};
```

#### Template Categories:
- **API**: Route handlers, controllers, middleware
- **Database**: Models, repositories, migrations
- **Test**: Unit tests, integration tests, mocks
- **Config**: Environment configs, deployment files

### 7. CI/CD Integration

#### Automated Testing:
```yaml
# .github/workflows/test.yml
- name: Run gibRun MCP tests
  run: |
    npm run test:integration
    npm run test:e2e
```

#### Quality Gates:
```yaml
- name: Quality check
  run: |
    # Run project analyzer
    # Check coverage thresholds
    # Verify no critical issues
```

### 8. Security Considerations

#### File Access:
- Never allow access to sensitive directories
- Validate all file paths within workspace
- Use principle of least privilege

#### Data Protection:
- Sanitize all template variables
- Avoid logging sensitive data
- Use secure connections for external services

#### Audit Trail:
- Log all file operations
- Track template usage
- Monitor for suspicious patterns

