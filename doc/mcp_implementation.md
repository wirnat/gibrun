# MCP Implementation Guide

## Overview

The gibRun MCP Server provides a comprehensive Model Context Protocol implementation for backend development workflows. This guide covers how to integrate gibRun MCP with various AI coding assistants and IDEs.

## What is MCP (Model Context Protocol)?

MCP is a protocol that enables AI assistants to interact with external tools and services. It provides a standardized way for AI models to:

- Execute database queries
- Make HTTP requests
- Debug applications
- Build and run code
- Access file systems
- Interact with external APIs

## gibRun MCP Server Features

### Available Tools

1. **Database Operations**
   - `postgres_query`: Execute PostgreSQL queries with connection pooling
   - Support for complex queries, transactions, and data verification
   - Environment variable configuration or direct connection strings

2. **HTTP Operations**
   - `http_request`: Make HTTP requests with full REST support
   - Custom headers, authentication, request body, and timeouts
   - Support for all HTTP methods (GET, POST, PUT, PATCH, DELETE)

3. **Go Development**
   - `build_go_project`: Compile Go applications with custom build flags
   - `run_go_command`: Execute Go commands (test, run, mod tidy)
   - `dap_restart`: Hot reload debugging sessions with auto-rebuild

4. **File System Operations**
   - `read_source_file`: Read source code files for analysis
   - `write_source_file`: Write/update source files
   - `execute_shell_command`: Run arbitrary shell commands

5. **DAP Debugging (Advanced)**
   - `dap_send_command`: Send custom DAP commands to debugger
   - `set_breakpoint`: Manage breakpoints programmatically
   - Full integration with Delve Go debugger

6. **Go Debugger Proxy Tools**
   - `launch`: Start new Go debugging session
   - `attach`: Attach to running Go process
   - `debug`: Debug specific Go files
   - `set_breakpoint`, `continue`, `step`, `eval_variable`: Full debugging control

## Implementation by Platform

### 1. OpenCode MCP Integration

#### Configuration File
Create or update `~/.config/opencode/config.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "gibRun": {
      "type": "local",
      "command": ["node", "/path/to/gibrun-mcp-server/build/index.js"],
      "enabled": true,
      "environment": {
        "POSTGRES_USER": "your_db_user",
        "POSTGRES_PASSWORD": "your_db_password",
        "POSTGRES_HOST": "localhost",
        "POSTGRES_PORT": "5432",
        "POSTGRES_DB": "your_database",
        "LOG_LEVEL": "info",
        "NODE_ENV": "production"
      }
    }
  }
}
```

#### Setup Steps

1. **Install gibRun MCP Server**
   ```bash
   git clone https://github.com/your-org/gibrun-mcp-server.git
   cd gibrun-mcp-server
   npm install
   npm run build
   ```

2. **Configure Database Connection**
   Update the environment variables in the config with your actual database credentials.

3. **Test Connection**
   ```bash
   # Test the MCP server directly
   node build/index.js
   ```

4. **Restart OpenCode**
   Restart OpenCode to load the new MCP configuration.

#### Usage in OpenCode

Once configured, you can use gibRun tools in OpenCode by mentioning them in conversations:

```
Can you check the users table in the database?
Use postgres_query to see what data we have.
```

### 2. Claude Desktop MCP Integration

#### Configuration File
Create or update `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcp": {
    "gibRun": {
      "command": ["node", "/path/to/gibrun-mcp-server/build/index.js"],
      "env": {
        "POSTGRES_USER": "postgres",
        "POSTGRES_PASSWORD": "postgres",
        "POSTGRES_HOST": "localhost",
        "POSTGRES_PORT": "5432",
        "POSTGRES_DB": "hairkatz_0_0_1",
        "LOG_LEVEL": "info",
        "NODE_ENV": "production"
      }
    }
  }
}
```

#### Alternative: Using Docker Compose

```json
{
  "mcp": {
    "gibRun": {
      "command": ["docker", "run", "--rm", "--network", "host"],
      "args": ["gibrun-mcp-server:latest"],
      "env": {
        "POSTGRES_USER": "postgres",
        "POSTGRES_PASSWORD": "postgres",
        "POSTGRES_HOST": "host.docker.internal",
        "POSTGRES_PORT": "5432",
        "POSTGRES_DB": "hairkatz_0_0_1"
      }
    }
  }
}
```

#### Alternative: Using Connection String

```json
{
  "mcp": {
    "gibRun": {
      "command": ["node", "/path/to/gibrun-mcp-server/build/index.js"],
      "env": {
        "POSTGRES_CONNECTION_STRING": "postgresql://postgres:postgres@localhost:5432/hairkatz_0_0_1",
        "LOG_LEVEL": "info",
        "NODE_ENV": "production"
      }
    }
  }
}
```

#### Setup Steps

1. **Build Docker Image**
   ```bash
   cd gibrun-mcp-server
   npm run docker:build
   ```

2. **Configure Claude Desktop**
   Add the configuration above to your Claude Desktop config file.

3. **Test Docker Container**
   ```bash
   # Test the container
   docker run --rm gibrun-mcp-server:latest node build/index.js
   ```

4. **Restart Claude Desktop**
   Restart the application to load the MCP server.

#### Usage in Claude

Claude will automatically discover and use gibRun tools when relevant:

```
I need to check the database schema. Can you help me query the information_schema?
```

### 3. Cursor MCP Integration

#### Configuration File
Create or update `.cursor/mcp.json` in your project root:

```json
{
  "mcp": {
    "gibRun": {
      "command": ["node"],
      "args": ["/path/to/gibrun-mcp-server/build/index.js"],
      "env": {
        "POSTGRES_USER": "your_db_user",
        "POSTGRES_PASSWORD": "your_db_password",
        "POSTGRES_HOST": "localhost",
        "POSTGRES_PORT": "5432",
        "POSTGRES_DB": "your_database",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

#### Setup Steps

1. **Install gibRun MCP Server**
   Follow the installation steps from the OpenCode section.

2. **Create Cursor MCP Config**
   ```bash
   mkdir -p .cursor
   # Create mcp.json with the configuration above
   ```

3. **Restart Cursor**
   Restart Cursor to load the MCP configuration.

#### Usage in Cursor

Cursor will show gibRun tools in the MCP panel and allow direct interaction:

```
Use the postgres_query tool to check recent user registrations.
```

### 4. VS Code Extension (Custom Implementation)

#### Configuration in settings.json

```json
{
  "mcp.servers": {
    "gibRun": {
      "command": "node",
      "args": ["/path/to/gibrun-mcp-server/build/index.js"],
      "env": {
        "POSTGRES_USER": "your_db_user",
        "POSTGRES_PASSWORD": "your_db_password",
        "POSTGRES_HOST": "localhost",
        "POSTGRES_PORT": "5432",
        "POSTGRES_DB": "your_database"
      }
    }
  }
}
```

#### Setup Steps

1. **Install VS Code Extension**
   You'll need a VS Code extension that supports MCP (or create your own).

2. **Configure MCP Server**
   Add the configuration to your VS Code settings.

3. **Restart VS Code**
   Reload the window to activate the MCP server.

## Environment Variables

### Complete Environment Variables Reference

gibRun MCP Server supports comprehensive environment variable configuration for different deployment scenarios, security settings, performance tuning, and feature flags.

### Database Configuration

#### Option 1: Individual Environment Variables (Recommended for Development)

| Variable | Description | Default | Example | Required |
|----------|-------------|---------|---------|----------|
| `POSTGRES_USER` | Database username | - | `postgres` | ✅ |
| `POSTGRES_PASSWORD` | Database password | - | `postgres` | ✅ |
| `POSTGRES_HOST` | Database host | `localhost` | `localhost` | ❌ |
| `POSTGRES_PORT` | Database port | `5432` | `5432` | ❌ |
| `POSTGRES_DB` | Database name | - | `hairkatz_0_0_1` | ✅ |

#### Option 2: Connection String (Alternative)

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `POSTGRES_CONNECTION_STRING` | Full PostgreSQL connection string | `postgresql://user:pass@host:port/dbname` | ✅ (replaces individual vars) |

#### Option 3: PostgreSQL Standard Environment Variables

| Variable | Description | Default | Example | Required |
|----------|-------------|---------|---------|----------|
| `PGHOST` | PostgreSQL host | `localhost` | `prod-db.example.com` | ❌ |
| `PGPORT` | PostgreSQL port | `5432` | `5432` | ❌ |
| `PGDATABASE` | Database name | `postgres` | `myapp_prod` | ❌ |
| `PGUSER` | Database username | `postgres` | `app_user` | ❌ |
| `PGPASSWORD` | Database password | - | `secure_password` | ❌ |

#### Production Database Variables

| Variable | Description | Default | Example | Required |
|----------|-------------|---------|---------|----------|
| `DB_USER` | Production database username | `gibrun` | `prod_user` | ❌ |
| `DB_PASSWORD` | Production database password | - | `secure_password` | ❌ |
| `DB_NAME` | Production database name | `gibrun` | `prod_database` | ❌ |

### Application Configuration

| Variable | Description | Default | Example | Required |
|----------|-------------|---------|---------|----------|
| `NODE_ENV` | Node environment | `development` | `production` | ❌ |
| `LOG_LEVEL` | Logging level | `info` | `debug` | ❌ |
| `DEBUG` | Enable debug logging | - | `dap:*` | ❌ |

### HTTP Configuration

| Variable | Description | Default | Example | Required |
|----------|-------------|---------|---------|----------|
| `REQUEST_TIMEOUT` | HTTP request timeout (ms) | `30000` | `60000` | ❌ |
| `MAX_REQUEST_SIZE` | Maximum request size | `10mb` | `50mb` | ❌ |

### Logging Configuration

| Variable | Description | Default | Example | Required |
|----------|-------------|---------|---------|----------|
| `MCP_LOG_DIR` | Custom log directory path | `./logs` | `/var/log/gibrun` | ❌ |
| `MCP_LOG_FILE` | Custom log file path | `./logs/gibrun.log` | `/var/log/gibrun/mcp.log` | ❌ |

### Monitoring & Security

| Variable | Description | Default | Example | Required |
|----------|-------------|---------|---------|----------|
| `SENTRY_DSN` | Sentry error tracking | - | `https://...@sentry.io/...` | ❌ |
| `PROMETHEUS_METRICS_ENABLED` | Enable Prometheus metrics | `false` | `true` | ❌ |
| `JWT_SECRET` | JWT signing secret | - | `your-jwt-secret` | ❌ |
| `API_KEY` | API key for authentication | - | `your-api-key` | ❌ |

### Testing Configuration

| Variable | Description | Default | Example | Required |
|----------|-------------|---------|---------|----------|
| `VITEST_MAX_CONCURRENCY` | Vitest max concurrent tests | `3` | `5` | ❌ |
| `VITEST_MAX_WORKERS` | Vitest max worker threads | `2` | `4` | ❌ |
| `TEST_SECURE_MODE` | Enable secure testing mode | - | `1` | ❌ |

### CI/CD Configuration

| Variable | Description | Default | Example | Required |
|----------|-------------|---------|---------|----------|
| `GITHUB_REPOSITORY` | GitHub repository name | - | `owner/repo` | ❌ (CI only) |
| `GITHUB_REF_NAME` | GitHub branch name | - | `main` | ❌ (CI only) |
| `GITHUB_SHA` | GitHub commit SHA | - | `abc123...` | ❌ (CI only) |
| `GITHUB_RUN_ID` | GitHub Actions run ID | - | `123456789` | ❌ (CI only) |
| `AWS_REGION` | AWS region for S3 storage | `us-east-1` | `eu-west-1` | ❌ |
| `ANALYSIS_RESULTS_BUCKET` | S3 bucket for analysis results | - | `my-analysis-bucket` | ❌ |

### DuckDB Configuration

| Variable | Description | Default | Example | Required |
|----------|-------------|---------|---------|----------|
| `DUCKDB_MEMORY_LIMIT` | DuckDB memory limit | `256MB` | `512MB` | ❌ |
| `DUCKDB_THREADS` | Number of DuckDB threads | `4` | `8` | ❌ |
| `DUCKDB_MAINTENANCE_INTERVAL_MS` | Cache maintenance interval | `300000` | `600000` | ❌ |
| `DUCKDB_DEFAULT_TTL_HOURS` | Default cache TTL | `24` | `48` | ❌ |
| `DUCKDB_MAX_CACHE_SIZE_MB` | Maximum cache size | `256` | `512` | ❌ |

### Go Debugger Configuration

| Variable | Description | Default | Example | Required |
|----------|-------------|---------|---------|----------|
| `GIBRUN_GO_DEBUGGER_COMMAND` | Path to Go debugger executable | - | `/path/to/dlv` | ❌ |
| `GIBRUN_GO_DEBUGGER_ARGS` | Additional debugger arguments | - | `--log --log-output=rpc` | ❌ |
| `GIBRUN_GO_DEBUGGER_CWD` | Working directory for debugger | - | `/path/to/project` | ❌ |
| `GIBRUN_DEBUG` | Enable Go debugger debug mode | - | `1` | ❌ |
| `GIBRUN_CONFIG_PATH` | Path to gibRun config file | `./config.json` | `/etc/gibrun/config.json` | ❌ |

### Feature Flags

| Variable | Description | Default | Example | Required |
|----------|-------------|---------|---------|----------|
| `ENABLE_DAP_DEBUGGING` | Enable DAP debugging tools | `true` | `false` | ❌ |
| `ENABLE_HTTP_MOCKING` | Enable HTTP mocking features | `false` | `true` | ❌ |
| `ENABLE_DATABASE_TOOLS` | Enable database operation tools | `true` | `false` | ❌ |
| `ENABLE_FILE_SYSTEM_TOOLS` | Enable file system tools | `true` | `false` | ❌ |
| `ENABLE_REAL_TIME_ANALYSIS` | Enable real-time analysis features | `false` | `true` | ❌ |
| `ENABLE_FILE_SYSTEM` | Enable file system operations | `true` | `false` | ❌ |
| `ENABLE_PROJECT_ANALYZER` | Enable project analysis tools | `true` | `false` | ❌ |
| `ENABLE_DATABASE` | Enable database operations | `true` | `false` | ❌ |
| `ENABLE_HTTP` | Enable HTTP operations | `true` | `false` | ❌ |
| `ENABLE_DAP` | Enable DAP debugging | `true` | `false` | ❌ |

### Environment Variable Categories

#### 🔧 **Core Configuration**
Required for basic gibRun operation:
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` (or PostgreSQL standard vars)
- `NODE_ENV`

#### 🗄️ **Database Configuration**
For database connections and performance:
- `POSTGRES_*` variables or `PG*` standard variables
- `DUCKDB_*` variables for embedded database tuning
- `POSTGRES_CONNECTION_STRING` for connection string approach

#### 🔒 **Security & Authentication**
For production deployments:
- `JWT_SECRET`, `API_KEY`
- `SENTRY_DSN`

#### 📊 **Monitoring & Observability**
For production monitoring:
- `PROMETHEUS_METRICS_ENABLED`
- `LOG_LEVEL`, `MCP_LOG_DIR`, `MCP_LOG_FILE`

#### 🧪 **Development & Testing**
For development and CI/CD:
- `DEBUG`, `VITEST_*`
- `GITHUB_*`, `AWS_REGION`

#### 🐛 **Debugging & Troubleshooting**
For debugging issues:
- `GIBRUN_DEBUG`, `GIBRUN_GO_DEBUGGER_*`, `GIBRUN_CONFIG_PATH`
- `LOG_LEVEL=debug`

#### ⚡ **Performance Tuning**
For performance optimization:
- `REQUEST_TIMEOUT`, `MAX_REQUEST_SIZE`
- `DUCKDB_MEMORY_LIMIT`, `DUCKDB_THREADS`, `DUCKDB_MAX_CACHE_SIZE_MB`
- `VITEST_MAX_CONCURRENCY`, `VITEST_MAX_WORKERS`

#### 🎛️ **Feature Control**
For enabling/disabling specific functionality:
- `ENABLE_DAP`, `ENABLE_HTTP`, `ENABLE_DATABASE`
- `ENABLE_FILE_SYSTEM`, `ENABLE_PROJECT_ANALYZER`
- `ENABLE_DAP_DEBUGGING`, `ENABLE_HTTP_MOCKING`, `ENABLE_REAL_TIME_ANALYSIS`

### Environment Variable Usage Examples

#### Development Setup
```bash
# Basic development configuration
export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=postgres
export POSTGRES_DB=myapp_dev
export NODE_ENV=development
export LOG_LEVEL=info
```

#### Production Setup
```bash
# Production configuration with security
export POSTGRES_CONNECTION_STRING=postgresql://prod_user:secure_pass@prod-host:5432/prod_db
export NODE_ENV=production
export LOG_LEVEL=warn
export SENTRY_DSN=https://your-sentry-dsn@sentry.io/project
export JWT_SECRET=your-256-bit-secret
export PROMETHEUS_METRICS_ENABLED=true
```

#### Testing Setup
```bash
# Testing configuration
export NODE_ENV=test
export POSTGRES_USER=testuser
export POSTGRES_PASSWORD=testpass
export POSTGRES_DB=testdb
export VITEST_MAX_CONCURRENCY=5
export VITEST_MAX_WORKERS=3
```

#### Debug Mode
```bash
# Enable debug logging
export LOG_LEVEL=debug
export DEBUG=dap:*
export GIBRUN_DEBUG=1
```

#### Performance Tuning
```bash
# Optimize DuckDB performance
export DUCKDB_MEMORY_LIMIT=512MB
export DUCKDB_THREADS=8
export DUCKDB_MAX_CACHE_SIZE_MB=512

# Configure HTTP timeouts
export REQUEST_TIMEOUT=60000
export MAX_REQUEST_SIZE=50mb
```

#### Feature Control
```bash
# Enable specific features
export ENABLE_DAP_DEBUGGING=true
export ENABLE_HTTP_MOCKING=true
export ENABLE_REAL_TIME_ANALYSIS=false

# Disable specific modules
export ENABLE_FILE_SYSTEM=false
export ENABLE_PROJECT_ANALYZER=true
```

#### CI/CD Setup
```bash
# GitHub Actions environment (automatically provided)
export GITHUB_REPOSITORY=owner/repo
export GITHUB_REF_NAME=main
export GITHUB_SHA=abc123...
export GITHUB_RUN_ID=123456789

# Custom CI configuration
export AWS_REGION=us-east-1
export ANALYSIS_RESULTS_BUCKET=my-analysis-results
```

### Environment Variable Priority

1. **PostgreSQL Standard Variables**: `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` take highest precedence
2. **Individual POSTGRES Variables**: `POSTGRES_HOST`, `POSTGRES_PORT`, etc. (second priority)
3. **Connection String**: `POSTGRES_CONNECTION_STRING` (third priority)
4. **DuckDB Configuration**: DuckDB-specific variables are loaded from config file or environment
5. **Feature Flags**: Boolean feature flags default to `true` unless explicitly set to `'false'`
6. **Defaults**: Sensible defaults are provided for all optional variables
7. **Validation**: Required variables are validated at startup
8. **Security**: Sensitive values are masked in logs and error messages

### Environment File Support

gibRun supports `.env` files for local development:

```bash
# .env file example
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=myapp_dev
NODE_ENV=development
LOG_LEVEL=info
DEBUG=dap:*
```

**Note**: Never commit `.env` files to version control. Use `.env.example` for templates.

#### Production Environment Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `DB_USER` | Production database username | `gibrun` | `prod_user` |
| `DB_PASSWORD` | Production database password | - | `secure_password` |
| `DB_NAME` | Production database name | `gibrun` | `prod_database` |

### Application Configuration

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `NODE_ENV` | Node environment | `development` | `production` |
| `LOG_LEVEL` | Logging level | `info` | `debug` |
| `REQUEST_TIMEOUT` | HTTP request timeout (ms) | `30000` | `60000` |
| `MAX_REQUEST_SIZE` | Maximum request size | `10mb` | `50mb` |

### Monitoring & Security

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `SENTRY_DSN` | Sentry error tracking | - | `https://...@sentry.io/...` |
| `PROMETHEUS_METRICS_ENABLED` | Enable Prometheus metrics | `false` | `true` |
| `JWT_SECRET` | JWT signing secret | - | `your-jwt-secret` |
| `API_KEY` | API key for authentication | - | `your-api-key` |

## Database Setup

### Development Database Setup

#### Using Docker Compose (Recommended)

1. **Start Development Database**
   ```bash
   cd gibrun-mcp-server
   docker-compose up -d postgres
   ```

2. **Test Connection**
   ```bash
   # Connect to database
   psql -h localhost -U testuser -d testdb
   # Password: testpass
   ```

3. **Initialize Schema (Optional)**
   ```bash
   # Run schema initialization
   docker-compose exec postgres psql -U testuser -d testdb -f /docker-entrypoint-initdb.d/schema.sql
   ```

#### Manual PostgreSQL Setup

1. **Create Database**
   ```sql
   CREATE DATABASE hairkatz_0_0_1;
   CREATE USER postgres WITH PASSWORD 'postgres';
   GRANT ALL PRIVILEGES ON DATABASE hairkatz_0_0_1 TO postgres;
   ```

2. **Test Connection**
   ```bash
   psql -h localhost -U postgres -d hairkatz_0_0_1
   ```

### Production Database Setup

#### Using Docker Compose Production

1. **Set Environment Variables**
   ```bash
   export DB_USER=prod_user
   export DB_PASSWORD=secure_password
   export DB_NAME=prod_database
   ```

2. **Start Production Stack**
   ```bash
   cd gibrun-mcp-server
   docker-compose -f docker-compose.prod.yml up -d postgres
   ```

3. **Initialize Production Database**
   ```bash
   # The init-db.sql script will run automatically
   docker-compose -f docker-compose.prod.yml logs postgres
   ```

#### Manual Production Setup

1. **Create Production Database**
   ```sql
   CREATE DATABASE prod_database;
   CREATE USER prod_user WITH PASSWORD 'secure_password';
   GRANT ALL PRIVILEGES ON DATABASE prod_database TO prod_user;

   -- Enable scram-sha-256 authentication
   ALTER USER prod_user PASSWORD 'secure_password';
   ```

2. **Configure PostgreSQL Authentication**
   ```bash
   # Edit pg_hba.conf to use scram-sha-256
   # host    prod_database    prod_user    0.0.0.0/0    scram-sha-256
   ```

### Connection String Alternative

Instead of individual environment variables, you can use:

```bash
POSTGRES_CONNECTION_STRING="postgresql://user:password@host:port/database"
```

## Testing MCP Integration

### 1. Test Basic Connectivity

```bash
# Test if MCP server starts (should show MCP server started on stdio)
cd gibrun-mcp-server
node build/index.js

# Test with Docker
npm run docker:build
docker run --rm gibrun-mcp-server:latest node build/index.js

# Test health check
node scripts/healthcheck.js
```

### 2. Test Tool Discovery

Use your AI assistant to ask:
```
What MCP tools are available?
```

Expected response should list tools like:
- postgres_query
- http_request
- build_go_project
- read_source_file
- dap_restart
- launch, attach, debug (Go debugger tools)

### 3. Test Database Connection

```
Can you run a simple query: SELECT version()
```

Or more specifically:
```
Use postgres_query to check database connection with query: SELECT version() as postgres_version, current_database() as db_name
```

### 4. Test HTTP Operations

```
Can you make a GET request to https://httpbin.org/get
```

Or:
```
Use http_request to test API with URL: https://httpbin.org/get and method: GET
```

### 5. Test Go Development Tools

```
Can you check if Go is available by running: go version
```

Or:
```
Use run_go_command to check Go version with command: version
```

### 6. Test File Operations

```
Can you read the content of package.json file?
```

Or:
```
Use read_source_file to read the package.json file
```

### 7. Comprehensive Integration Test

```bash
# Run full integration test suite
cd gibrun-mcp-server
npm run test:integration

# Run specific tests
npm test -- test/integration/database-docker.test.ts
npm test -- test/integration/end-to-end.test.ts
```

## Troubleshooting

### Common Issues

#### 1. MCP Server Won't Start

**Symptoms:** AI assistant can't find gibRun tools

**Solutions:**
- Check if the path to `build/index.js` is correct
- Verify Node.js is installed and accessible
- Check file permissions: `chmod +x build/index.js`
- Review logs for startup errors

#### 2. Database Connection Failed

**Symptoms:** Database queries fail with connection errors

**Solutions:**
- Verify PostgreSQL is running
- Check database credentials
- Test connection manually: `psql -h host -U user -d database`
- Ensure database allows connections from localhost

#### 3. Tools Not Appearing

**Symptoms:** AI assistant doesn't show gibRun tools

**Solutions:**
- Restart the AI application completely
- Check MCP configuration syntax
- Verify environment variables are set correctly
- Check if MCP server process is running

#### 4. Permission Errors

**Symptoms:** File access or command execution fails

**Solutions:**
- Ensure proper file permissions
- Check if required system commands are available
- Verify user has necessary permissions for database/file operations

### Debug Mode

Enable debug logging:

```bash
# Direct execution
LOG_LEVEL=debug node build/index.js

# With Docker
docker run --rm -e LOG_LEVEL=debug gibrun-mcp-server:latest node build/index.js

# With Docker Compose
docker-compose -f docker-compose.prod.yml up gibrun-mcp
```

### Health Check

Test MCP server health:

```bash
# Direct health check
node scripts/healthcheck.js

# Docker health check
docker ps | grep gibrun-mcp

# Production health check
curl http://localhost:3000/health

# Docker Compose health check
docker-compose -f docker-compose.prod.yml ps
docker-compose -f docker-compose.prod.yml logs gibrun-mcp
```

### Log Analysis

```bash
# View application logs
docker-compose -f docker-compose.prod.yml logs -f gibrun-mcp

# View database logs
docker-compose -f docker-compose.prod.yml logs postgres

# View all service logs
docker-compose -f docker-compose.prod.yml logs
```

## Advanced Configuration

### Multiple Database Connections

```json
{
  "mcp": {
    "gibRun-prod": {
      "command": ["node", "/path/to/gibrun-mcp-server/build/index.js"],
      "env": {
        "POSTGRES_CONNECTION_STRING": "postgresql://prod_user:prod_pass@prod-host:5432/prod_db",
        "NODE_ENV": "production",
        "LOG_LEVEL": "info"
      }
    },
    "gibRun-dev": {
      "command": ["node", "/path/to/gibrun-mcp-server/build/index.js"],
      "env": {
        "POSTGRES_USER": "dev_user",
        "POSTGRES_PASSWORD": "dev_pass",
        "POSTGRES_HOST": "localhost",
        "POSTGRES_PORT": "5432",
        "POSTGRES_DB": "dev_db",
        "NODE_ENV": "development",
        "LOG_LEVEL": "debug"
      }
    },
    "gibRun-test": {
      "command": ["node", "/path/to/gibrun-mcp-server/build/index.js"],
      "env": {
        "POSTGRES_CONNECTION_STRING": "postgresql://testuser:testpass@localhost:5434/testdb"
      }
    }
  }
}
```

### Custom Tool Configuration

```json
{
  "mcp": {
    "gibRun": {
      "command": ["node", "/path/to/gibrun/build/index.js"],
      "env": {
        "ENABLE_DAP_DEBUGGING": "true",
        "ENABLE_HTTP_MOCKING": "true",
        "ENABLE_DATABASE_TOOLS": "true",
        "ENABLE_FILE_SYSTEM_TOOLS": "true"
      }
    }
  }
}
```

## Security Best Practices

1. **Never commit secrets** to version control
2. **Use environment variables** for sensitive data
3. **Limit database permissions** to read-only where possible
4. **Use HTTPS** for production database connections
5. **Regularly update** dependencies and security patches
6. **Monitor access logs** for suspicious activity

## Performance Optimization

1. **Connection Pooling**: Automatic PostgreSQL connection pooling
2. **Request Timeouts**: Configurable HTTP request timeouts (default: 30s)
3. **Resource Monitoring**: Built-in Prometheus metrics collection
4. **Health Checks**: Automatic container health monitoring
5. **Load Balancing**: Support for multiple MCP server instances

### Performance Benchmarks

Based on testing:
- **Database Queries**: 50 concurrent queries in ~20ms
- **HTTP Requests**: 30+ concurrent requests efficiently handled
- **Memory Usage**: Stable with leak detection
- **Large Datasets**: Handles 100+ records efficiently

### Scaling Configuration

```bash
# Scale MCP server instances
docker-compose -f docker-compose.prod.yml up -d --scale gibrun-mcp=3

# Use load balancer
docker-compose -f docker-compose.prod.yml --profile full up -d
```

## Deployment Scripts

The project includes automated deployment scripts:

### Production Deployment

```bash
# Automated deployment script
chmod +x scripts/deploy.sh
ENV_FILE=.env.production ./scripts/deploy.sh

# Manual Docker deployment
npm run docker:build
npm run docker:compose:up

# With monitoring stack
docker-compose -f docker-compose.prod.yml --profile monitoring up -d

# Full production stack (nginx reverse proxy + monitoring)
docker-compose -f docker-compose.prod.yml --profile full up -d
```

### Docker Compose Profiles

The project supports multiple deployment profiles for different use cases:

#### Available Profiles
- **default**: Basic gibRun MCP server + PostgreSQL database
- **monitoring**: Adds Prometheus metrics collection + Grafana dashboards
- **full**: Complete production stack with Nginx reverse proxy + Redis cache + monitoring
- **test**: Test environment with WireMock HTTP mock + DAP mock server + pgAdmin

#### Profile Usage Examples
```bash
# Development with database
docker-compose up -d

# Production with monitoring
docker-compose -f docker-compose.prod.yml --profile monitoring up -d

# Full production deployment
docker-compose -f docker-compose.prod.yml --profile full up -d

# Testing environment
docker-compose --profile test up -d
```

### Services by Profile

#### Default Profile
- **gibRun-mcp**: Main MCP server application
- **postgres**: PostgreSQL database

#### Monitoring Profile
- All default services +
- **prometheus**: Metrics collection
- **grafana**: Monitoring dashboards

#### Full Profile
- All monitoring services +
- **nginx**: Reverse proxy and load balancer
- **redis**: Caching layer

#### Test Profile
- **test-postgres**: Test database (port 5434)
- **http-mock**: WireMock HTTP mock server (port 8081)
- **dap-mock**: DAP mock server (port 49280)
- **pgadmin**: Database administration (port 5050)

### Development Setup

```bash
# Quick development setup
docker-compose up -d postgres
npm install
npm run build
npm start

# Test integration
npm run test:integration
```

### Available NPM Scripts

```bash
npm run build          # Production build with esbuild minification (204KB output)
npm run dev            # Development watch mode with sourcemaps
npm run start          # Start production server from build/
npm run docker:build   # Build optimized Docker image
npm run test:unit      # Run unit tests (88+ tests)
npm run test:integration # Run integration tests with Docker services
npm run lint           # Run ESLint
npm run typecheck      # TypeScript type checking (zero errors)
npm run docker:compose:up # Start full production stack
```

## Support and Contributing

- **Issues**: Report bugs on GitHub Issues
- **Documentation**: Update this guide for new integrations
- **Contributing**: See CONTRIBUTING.md for development guidelines
- **Discussions**: Use GitHub Discussions for questions

### Getting Help

1. Check the troubleshooting section above
2. Review Docker Compose logs: `docker-compose logs`
3. Test individual components: `npm test -- test/unit/`
4. Check GitHub Issues for similar problems
5. Create a new issue with detailed information

## Build System and Performance

### Optimized Build Configuration

gibRun MCP Server uses a modern Vite-based build system optimized for production deployment and development efficiency.

#### Build Features

- **Conditional Minification**: Production builds use esbuild minification (44% size reduction), development builds remain unminified for debugging
- **Tree Shaking**: Aggressive dead code elimination removes unused dependencies
- **External Dependencies**: MCP SDK, Node.js built-ins, and database drivers are externalized to reduce bundle size
- **Path Aliases**: Mandatory '@' system with 7 aliases for clean imports:
  - `@types` - TypeScript type definitions
  - `@project-analyzer` - Project analysis tools
  - `@analyzer-types` - Analysis type definitions
  - `@core` - Core server components
  - `@tools` - MCP tool implementations
  - `@utils` - Utility functions
  - `@services` - Service layer components

#### Performance Benchmarks

- **Build Size**: 204KB minified production bundle (44% reduction from previous version)
- **Build Time**: < 30 seconds for full TypeScript compilation and bundling
- **Memory Usage**: Stable runtime memory with leak detection
- **Database Queries**: 50 concurrent queries in ~20ms
- **HTTP Requests**: 30+ concurrent requests efficiently handled

#### Build Commands

```bash
# Development build (unminified, with sourcemaps)
npm run dev

# Production build (minified, optimized)
npm run build

# Type checking only
npm run typecheck

# Docker build
npm run docker:build
```

#### Environment-Specific Builds

The build system automatically adapts based on `NODE_ENV`:

- **Development**: Unminified, sourcemaps enabled, hot reload support
- **Production**: Minified with esbuild, external dependencies, optimized for deployment
- **Test**: Minimal build for testing environment

### DuckDB Performance Tuning

The embedded DuckDB database includes comprehensive performance configuration:

#### Memory Management
- **Memory Limit**: Configurable via `DUCKDB_MEMORY_LIMIT` (default: 256MB)
- **Cache Size**: Adjustable via `DUCKDB_MAX_CACHE_SIZE_MB` (default: 256MB)
- **Maintenance Interval**: Configurable cleanup via `DUCKDB_MAINTENANCE_INTERVAL_MS` (default: 5 minutes)

#### Concurrency Settings
- **Thread Count**: Configurable via `DUCKDB_THREADS` (default: 4)
- **Default TTL**: Cache expiration via `DUCKDB_DEFAULT_TTL_HOURS` (default: 24 hours)

#### Performance Recommendations

```bash
# High-performance configuration
export DUCKDB_MEMORY_LIMIT=512MB
export DUCKDB_THREADS=8
export DUCKDB_MAX_CACHE_SIZE_MB=512
export DUCKDB_MAINTENANCE_INTERVAL_MS=600000  # 10 minutes

# Memory-constrained environment
export DUCKDB_MEMORY_LIMIT=128MB
export DUCKDB_THREADS=2
export DUCKDB_MAX_CACHE_SIZE_MB=128
```

## Changelog

### v1.1.0 (Latest)
- **DuckDB Integration**: Embedded database with configurable performance tuning
- **Path Aliases System**: Mandatory '@' aliases for clean imports (7 aliases)
- **Modular Architecture**: ArchitectureAnalyzer broken into 5 focused components
- **Enhanced Build System**: Vite-based build with conditional minification
- **Environment Variables**: Added DuckDB config, feature flags, PostgreSQL standard vars
- **Performance Optimization**: 44% build size reduction with esbuild minification
- **Type Safety**: Zero TypeScript errors with comprehensive type checking

### v1.0.0 (Previous)
- Complete MCP server implementation with 15+ tools
- PostgreSQL database operations with connection pooling
- HTTP REST API client with full method support
- Go development tools (build, test, run)
- Advanced DAP debugging integration with Delve
- File system operations (read/write/execute)
- Docker containerization with production setup
- Monitoring stack (Prometheus + Grafana)
- Multi-platform AI assistant integration
- Comprehensive testing suite (88+ tests)
- Enterprise-grade deployment scripts
- Security hardening and best practices

### Key Features Added
- **Database Tools**: postgres_query with transaction support + DuckDB embedded database
- **HTTP Tools**: http_request with custom headers/auth
- **Go Tools**: build_go_project, run_go_command, dap_restart
- **File Tools**: read_source_file, write_source_file, execute_shell_command
- **DAP Tools**: Full Go debugger integration via proxy
- **Project Analysis**: Modular ArchitectureAnalyzer with 5 specialized components
- **Build System**: Vite-based with path aliases and conditional minification
- **Deployment**: Automated deployment with health checks
- **Monitoring**: Prometheus metrics and Grafana dashboards
- **Security**: Environment variable management, SSL support
- **Performance**: 44% build size reduction, optimized DuckDB configuration

### Supported Platforms
- OpenCode MCP integration
- Claude Desktop (macOS + Docker)
- Cursor IDE integration
- VS Code extension support
- Docker Compose deployment
- Kubernetes-ready configuration