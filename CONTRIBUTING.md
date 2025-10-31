# Contributing to gibRun MCP Server

Terima kasih atas minat Anda untuk berkontribusi pada gibRun MCP Server! 🎉

## Cara Berkontribusi

### 1. Report Issues

Jika Anda menemukan bug atau punya saran fitur:

1. Check existing issues dulu
2. Buat issue baru dengan template:
   - **Bug Report**: Describe bug, steps to reproduce, expected vs actual behavior
   - **Feature Request**: Describe feature, use case, proposed implementation

### 2. Submit Pull Requests

#### Setup Development Environment

```bash
# Fork repository
git clone https://github.com/yourusername/gibRun.git
cd gibRun

# Install dependencies
npm install

# Build project
npm run build

# Test changes
npm test
```

#### Development Workflow

1. Create branch dari `main`:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/bug-description
   ```

2. Make changes:
   - Write clean, documented code
   - Follow existing code style
   - Add tests for new features
   - Update documentation

3. Test changes:
   ```bash
   # Build
   npm run build
   
   # Test dengan MCP Inspector
   npx @modelcontextprotocol/inspector node build/index.js
   
   # Test dengan sample API
   cd test-example
   go run sample-api.go
   # In another terminal, test with AI
   ```

4. Commit changes:
   ```bash
   git add .
   git commit -m "feat: add new feature"
   # or
   git commit -m "fix: resolve issue with X"
   ```

   Commit message format:
   - `feat:` New feature
   - `fix:` Bug fix
   - `docs:` Documentation changes
   - `test:` Test additions/changes
   - `refactor:` Code refactoring
   - `perf:` Performance improvements
   - `chore:` Build/tool changes

5. Push dan create PR:
   ```bash
   git push origin your-branch-name
   ```

   Then create Pull Request di GitHub dengan:
   - Clear title dan description
   - Reference related issues
   - Describe what changed dan why
   - Screenshots/demos if applicable

## Code Style Guidelines

### TypeScript

```typescript
// ✅ Good
async function handleHttpRequest(args: any) {
  const { url, method = "GET", headers = {} } = args;
  
  try {
    const response = await axios({ url, method, headers });
    return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
  } catch (error: any) {
    return { 
      content: [{ type: "text", text: JSON.stringify({ error: error.message }) }],
      isError: true 
    };
  }
}

// ❌ Bad
async function handleHttpRequest(args) { // Missing type
  const response = await axios(args.url); // No error handling
  return response.data; // Wrong return format
}
```

### Error Handling

Always return proper MCP response format:

```typescript
// ✅ Good
return {
  content: [
    {
      type: "text",
      text: JSON.stringify({
        success: false,
        error: error.message,
        code: error.code
      }, null, 2)
    }
  ],
  isError: true
};

// ❌ Bad
throw error; // Don't throw, return error response
```

### Tool Definitions

```typescript
// ✅ Good - Clear description, proper schema
{
  name: "tool_name",
  description: "Clear description of what the tool does. Include use cases and examples.",
  inputSchema: {
    type: "object",
    properties: {
      param1: {
        type: "string",
        description: "Detailed parameter description"
      }
    },
    required: ["param1"]
  }
}
```

## Adding New Tools

### 1. Define Tool

Add to `TOOLS` array in `src/index.ts`:

```typescript
{
  name: "my_new_tool",
  description: "What this tool does and when to use it",
  inputSchema: {
    type: "object",
    properties: {
      // Define parameters
    },
    required: []
  }
}
```

### 2. Implement Handler

```typescript
async function handleMyNewTool(args: any) {
  const { param1, param2 } = args;
  
  try {
    // Implementation
    const result = await doSomething(param1, param2);
    
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            result
          }, null, 2)
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: error.message
          }, null, 2)
        }
      ],
      isError: true
    };
  }
}
```

### 3. Register Handler

Add case in `CallToolRequestSchema` handler:

```typescript
case "my_new_tool":
  return await handleMyNewTool(args);
```

### 4. Document Tool

Update README.md dengan:
- Tool description
- Parameters
- Return format
- Usage examples

### 5. Add Tests

Create test scenario in `test-example/TEST_SCENARIOS.md`:

```markdown
### Scenario X: Test My New Tool

**Description**: What this test validates

**Steps**:
1. Setup
2. Execute tool
3. Verify results

**Expected Results**:
- What should happen
```

## Testing

### Manual Testing

```bash
# Build
npm run build

# Test dengan MCP Inspector
npx @modelcontextprotocol/inspector node build/index.js

# In inspector, try your tool:
{
  "tool": "my_new_tool",
  "arguments": {
    "param1": "value1"
  }
}
```

### Integration Testing

```bash
# Setup test environment
docker-compose up -d
cd test-example
go run sample-api.go

# Test with AI in Claude Desktop
# Prompt: "Test my new tool with..."
```

## Documentation

Update documentation when:
- Adding new features
- Changing existing behavior
- Adding new tools
- Fixing bugs that affect usage

Files to update:
- `README.md` - Main documentation
- `QUICKSTART.md` - Quick start guide
- `EXAMPLES.md` - Usage examples
- `test-example/TEST_SCENARIOS.md` - Test scenarios

## Release Process

1. Update version in `package.json`
2. Update CHANGELOG.md
3. Create release tag:
   ```bash
   git tag -a v1.1.0 -m "Release v1.1.0"
   git push origin v1.1.0
   ```
4. Create GitHub release with notes

## Areas for Contribution

### Priority Features

1. **Authentication Support**
   - Add tools for JWT handling
   - OAuth flow support
   - API key management

2. **Enhanced Database Support**
   - MySQL/MariaDB support
   - MongoDB support
   - Redis support

3. **Testing Enhancements**
   - Performance profiling
   - Test coverage reporting
   - Automated test generation

4. **Build System Support**
   - Python projects
   - Node.js projects
   - Rust projects
   - Java/Kotlin projects

5. **Monitoring & Observability**
   - Metrics collection
   - Log aggregation
   - Distributed tracing

6. **CI/CD Integration**
   - GitHub Actions integration
   - GitLab CI integration
   - Jenkins integration

### Nice-to-Have Features

- GraphQL API testing
- WebSocket testing
- gRPC testing
- Mock data generation
- API documentation generation
- Performance benchmarking
- Security scanning
- Code coverage integration

## Code Review Process

All PRs will be reviewed for:

1. **Functionality**
   - Does it work as intended?
   - Are edge cases handled?
   - Is error handling proper?

2. **Code Quality**
   - Is code readable and maintainable?
   - Are naming conventions followed?
   - Is code documented?

3. **Testing**
   - Are tests included?
   - Do tests pass?
   - Is coverage adequate?

4. **Documentation**
   - Is documentation updated?
   - Are examples provided?
   - Is API documented?

5. **Performance**
   - Are there performance implications?
   - Is resource usage reasonable?
   - Are there memory leaks?

## Getting Help

- **Discord**: [Join our Discord](#)
- **GitHub Discussions**: [Ask questions](#)
- **Email**: support@gibrun.dev

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Recognition

Contributors will be:
- Listed in README.md
- Credited in release notes
- Eligible for contributor badge

## Code of Conduct

### Our Pledge

We pledge to make participation in our project a harassment-free experience for everyone.

### Our Standards

✅ **Do:**
- Be respectful and inclusive
- Provide constructive feedback
- Accept constructive criticism
- Focus on what's best for community

❌ **Don't:**
- Use inappropriate language
- Make personal attacks
- Harass others
- Publish private information

### Enforcement

Violations may result in:
1. Warning
2. Temporary ban
3. Permanent ban

Report issues to: conduct@gibrun.dev

---

**Thank you for contributing to gibRun! 🚀**

Together we're making backend testing smarter and more efficient.

