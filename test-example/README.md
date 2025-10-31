# Sample API - Test Example

Contoh implementasi REST API sederhana untuk demonstrasi gibRun MCP Server.

## Quick Start

### 1. Setup Database

#### Option A: Using Docker Compose (Recommended)
```bash
# Dari root directory gibRun
docker-compose up -d

# Wait for PostgreSQL to be ready
sleep 5

# Setup schema
psql -h localhost -U postgres -d testdb -f test-example/schema.sql
# Password: postgres
```

#### Option B: Local PostgreSQL
```bash
# Create database
createdb testdb

# Run schema
psql -d testdb -f schema.sql
```

### 2. Setup API

```bash
cd test-example

# Install dependencies
go mod download

# Set environment variable (optional)
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/testdb?sslmode=disable"
export PORT=8080

# Run API
go run sample-api.go
```

Server akan running di `http://localhost:8080`

### 3. Test dengan gibRun MCP

Buka Claude Desktop dan coba:

```
Test API health check di http://localhost:8080/health
```

Atau run semua test scenarios:

```
Run all test scenarios dari test-example/TEST_SCENARIOS.md
```

## API Endpoints

### Health Check
```bash
curl http://localhost:8080/health
```

### Create User
```bash
curl -X POST http://localhost:8080/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "name": "Test User"
  }'
```

### Get All Users
```bash
curl http://localhost:8080/api/users
```

### Get User by ID
```bash
curl http://localhost:8080/api/users/{user-id}
```

### Update User
```bash
curl -X PUT http://localhost:8080/api/users/{user-id} \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Name"
  }'
```

### Delete User
```bash
curl -X DELETE http://localhost:8080/api/users/{user-id}
```

## Database Access

```bash
# Connect to database
psql postgresql://postgres:postgres@localhost:5432/testdb

# Common queries
SELECT * FROM users;
SELECT COUNT(*) FROM users;
SELECT * FROM users WHERE email = 'test@example.com';

# Cleanup test data
SELECT cleanup_test_data();
```

## Testing Workflow dengan AI

### Example 1: Simple Test
```
Prompt: "Create a new user dengan email john@test.com dan name John Doe, 
        lalu verify di database"

AI akan:
1. POST /api/users
2. Query database untuk verify
3. Report hasil
```

### Example 2: Full Test Suite
```
Prompt: "Run semua 19 test scenarios dari TEST_SCENARIOS.md"

AI akan:
1. Execute setiap scenario
2. Verify expected results
3. Track pass/fail
4. Generate report
```

### Example 3: Bug Fixing
```
Prompt: "Test create user dengan email invalid-email, 
        jika error tidak proper, fix code dan rebuild"

AI akan:
1. Test API
2. Analyze response
3. Read source code jika ada issue
4. Fix validation
5. Rebuild (go build)
6. Test lagi
```

### Example 4: Performance Test
```
Prompt: "Create 100 users concurrently, 
        track response time dan success rate"

AI akan:
1. Generate 100 unique test data
2. Make concurrent requests
3. Collect metrics
4. Report performance
5. Cleanup test data
```

## Directory Structure

```
test-example/
├── sample-api.go       # Main API implementation
├── go.mod              # Go dependencies
├── schema.sql          # Database schema
├── TEST_SCENARIOS.md   # Comprehensive test scenarios
└── README.md           # This file
```

## Features Demonstrated

### API Features:
- ✅ RESTful endpoints
- ✅ Input validation
- ✅ Email format validation
- ✅ Duplicate checking
- ✅ Error handling
- ✅ Database transactions
- ✅ CRUD operations

### Testing Capabilities:
- ✅ Health checks
- ✅ API endpoint testing
- ✅ Database verification
- ✅ Error scenarios
- ✅ Edge cases
- ✅ Load testing
- ✅ Security testing
- ✅ Auto-fixing bugs

## Troubleshooting

### Database Connection Error
```
Error: pq: database "testdb" does not exist
```
**Solution**: Create database first
```bash
createdb testdb
psql -d testdb -f schema.sql
```

### Port Already in Use
```
Error: listen tcp :8080: bind: address already in use
```
**Solution**: Change port
```bash
export PORT=8081
go run sample-api.go
```

### Go Dependencies Error
```
Error: package github.com/gin-gonic/gin not found
```
**Solution**: Download dependencies
```bash
go mod download
```

## Advanced Usage

### Running with Different Environments

```bash
# Development
APP_ENV=dev go run sample-api.go

# Production
APP_ENV=prod go build -o api && ./api
```

### Using with Docker

Build image:
```bash
docker build -t sample-api .
```

Run container:
```bash
docker run -d \
  -p 8080:8080 \
  -e DATABASE_URL="postgresql://postgres:postgres@host.docker.internal:5432/testdb" \
  sample-api
```

### Load Testing with AI

```
Prompt: "Run load test dengan configuration:
- 1000 concurrent users
- Each user: register -> login -> get profile -> update profile -> delete
- Track response times, success rates, errors
- Generate performance report"
```

### Continuous Testing

```
Prompt: "Watch test-example directory untuk changes, 
        auto rebuild dan run tests setiap ada perubahan"
```

## Integration dengan CI/CD

Example GitHub Actions workflow:

```yaml
name: API Tests
on: [push]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Setup PostgreSQL
        run: |
          docker run -d -p 5432:5432 \
            -e POSTGRES_PASSWORD=postgres \
            -e POSTGRES_DB=testdb \
            postgres:15
          
      - name: Setup Database
        run: |
          sleep 10
          psql -h localhost -U postgres -d testdb < schema.sql
          
      - name: Run API
        run: |
          go run sample-api.go &
          sleep 5
          
      - name: Run Tests with gibRun
        # Use MCP server to run tests
        run: |
          # AI-powered testing via MCP
          ...
```

## Best Practices

1. **Always cleanup test data** after tests
2. **Use transactions** for test isolation
3. **Generate unique test data** to avoid conflicts
4. **Verify both API response AND database** state
5. **Test error cases** as thoroughly as happy paths
6. **Monitor performance** metrics
7. **Use connection pooling** for database
8. **Handle concurrent requests** properly

## Next Steps

1. Add authentication & authorization
2. Add more entities (posts, comments, etc)
3. Add file upload endpoints
4. Add WebSocket support
5. Add rate limiting
6. Add caching layer
7. Add observability (metrics, tracing)

## Resources

- [Gin Framework](https://github.com/gin-gonic/gin)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Go Database/SQL Tutorial](https://go.dev/doc/database/querying)

