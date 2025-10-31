# gibRun MCP Server - Quick Start Guide

Panduan cepat untuk mulai menggunakan gibRun MCP Server.

## Instalasi dalam 3 Menit

### 1. Clone & Install

```bash
git clone <repo-url>
cd gibRun
npm install
npm run build
```

### 2. Konfigurasi di Claude Desktop

Edit file: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "gibrun": {
      "command": "node",
      "args": ["/Users/iturban/development/mcp/gibRun/build/index.js"]
    }
  }
}
```

Ganti path sesuai lokasi project Anda.

### 3. Restart Claude Desktop

Tutup dan buka kembali Claude Desktop.

## Test Pertama - 5 Menit

### Siapkan Environment Test

1. **Jalankan PostgreSQL** (jika belum running)
   ```bash
   # MacOS dengan Homebrew
   brew services start postgresql
   
   # Atau docker
   docker run -d \
     --name test-postgres \
     -e POSTGRES_PASSWORD=testpass \
     -e POSTGRES_DB=testdb \
     -p 5432:5432 \
     postgres:15
   ```

2. **Create test database**
   ```bash
   psql -U postgres
   CREATE DATABASE testdb;
   \c testdb
   CREATE TABLE users (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     email VARCHAR(255) UNIQUE NOT NULL,
     name VARCHAR(255),
     created_at TIMESTAMP DEFAULT NOW()
   );
   ```

3. **Jalankan simple Go API** (contoh)
   
   Create `main.go`:
   ```go
   package main
   
   import (
       "github.com/gin-gonic/gin"
       "net/http"
   )
   
   func main() {
       r := gin.Default()
       
       r.GET("/health", func(c *gin.Context) {
           c.JSON(http.StatusOK, gin.H{
               "status": "ok",
               "message": "API is running",
           })
       })
       
       r.Run(":8080")
   }
   ```
   
   Run:
   ```bash
   go mod init myapi
   go get github.com/gin-gonic/gin
   go run main.go
   ```

### Test Dengan AI

Buka Claude Desktop dan coba:

#### Test 1: Health Check
```
Prompt: "Test API health check di http://localhost:8080/health"
```

AI akan menggunakan `http_request` tool dan memberikan hasil.

#### Test 2: Database Query
```
Prompt: "Query semua users dari database testdb di localhost dengan user postgres password testpass"
```

AI akan menggunakan `postgres_query` tool dengan connection string yang sesuai.

#### Test 3: End-to-End Test
```
Prompt: "Buatkan end-to-end test untuk create user baru dengan email test@example.com, lalu verify di database"
```

AI akan:
1. Check apakah email sudah ada (postgres_query)
2. Call API untuk create user (http_request)
3. Verify di database (postgres_query)
4. Report hasil

## Workflow Nyata - 10 Menit

### Scenario: Testing User Registration dengan Auto-Fix

**Setup**: Buat API endpoint dengan bug sengaja

```go
// handlers/user.go (dengan bug)
func CreateUser(c *gin.Context) {
    var input struct {
        Email string `json:"email"`
        Name  string `json:"name"`
    }
    
    if err := c.BindJSON(&input); err != nil {
        c.JSON(400, gin.H{"error": err.Error()})
        return
    }
    
    // BUG: Missing email validation!
    query := "INSERT INTO users (email, name) VALUES ($1, $2)"
    _, err := db.Exec(query, input.Email, input.Name)
    
    if err != nil {
        c.JSON(500, gin.H{"error": "failed to create user"})
        return
    }
    
    c.JSON(201, gin.H{"message": "user created"})
}
```

**Prompt ke AI**:
```
Test API create user endpoint di http://localhost:8080/api/users dengan data:
{
  "email": "invalid-email",
  "name": "Test User"
}

Verify hasilnya di database postgresql://postgres:testpass@localhost:5432/testdb

Jika ada masalah, analyze dan fix code di /path/to/handlers/user.go, 
lalu rebuild project dan test lagi.
```

**AI akan**:
1. ✅ Test API endpoint
2. ❌ Notice no validation
3. 📖 Read source file
4. 🔧 Fix code (add email validation)
5. 🔨 Rebuild project
6. ✅ Test lagi
7. ✅ Verify di database
8. 📊 Report hasil

### Output Example:

```
Test Results:
✅ API endpoint accessible
❌ Initial test failed - invalid email accepted
🔍 Analyzed code - found missing email validation
✅ Fixed code - added email validation
✅ Rebuild successful
✅ Retest passed - invalid email rejected with 400 error
✅ Valid email test passed - user created
✅ Database verification passed - user exists

Summary:
- Bug found and fixed automatically
- Email validation added
- All tests passing
- Total time: 2.3 seconds
```

## Tips untuk Produktivitas Maksimal

### 1. Connection String Shortcut

Buat file `.env` di project directory:
```bash
DB_URL=postgresql://postgres:testpass@localhost:5432/testdb
API_BASE_URL=http://localhost:8080
```

Prompt:
```
"Use DB_URL dari environment untuk query users"
```

AI bisa baca file dan gunakan connection string.

### 2. Test Suites

Buat file `test-scenarios.md`:
```markdown
# Test Scenarios

## User Management
1. Create user with valid data
2. Create user with duplicate email (should fail)
3. Update user profile
4. Delete user

## Authentication
1. Login with valid credentials
2. Login with invalid credentials
3. Access protected endpoint without token
4. Access protected endpoint with valid token
```

Prompt:
```
"Run semua test scenarios dari test-scenarios.md"
```

### 3. Continuous Testing

Prompt:
```
"Watch untuk changes di handlers directory, 
auto rebuild dan run tests setiap ada perubahan"
```

AI akan setup watcher dan auto-test.

### 4. Batch Testing

Prompt:
```
"Test semua endpoints di API:
- GET /api/users
- POST /api/users
- GET /api/users/:id
- PUT /api/users/:id
- DELETE /api/users/:id

Generate test data yang diperlukan dan verify di database."
```

AI akan orchestrate semua tests.

## Troubleshooting

### Issue: "Cannot connect to database"

**Check**:
```bash
psql -U postgres -h localhost -p 5432 -d testdb
```

**Solution**: Pastikan PostgreSQL running dan credentials benar.

### Issue: "API endpoint not responding"

**Check**:
```bash
curl http://localhost:8080/health
```

**Solution**: Pastikan server running di port yang benar.

### Issue: "Build failed"

**Check**:
```bash
go version
go mod verify
```

**Solution**: Install dependencies dan check Go version.

## Next Steps

1. **Explore EXAMPLES.md** - Contoh scenarios lebih advanced
2. **Read README.md** - Full documentation
3. **Check tools** - Semua tools yang tersedia
4. **Integration** - Integrate dengan CI/CD

## Advanced Usage

### Custom Assertions

```
Prompt: "Test API dan assert:
1. Response time < 200ms
2. Status code = 201
3. Response has 'id' field
4. Database record exists
5. Email format is valid"
```

### Performance Testing

```
Prompt: "Run load test: 1000 concurrent requests ke /api/users
dengan random data, track success rate dan average response time"
```

### Data Generation

```
Prompt: "Generate 100 test users dengan realistic data,
insert ke database, lalu verify dengan API"
```

## Resources

- [Model Context Protocol](https://modelcontextprotocol.io)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Go Documentation](https://go.dev/doc/)

## Support

Jika ada issues atau questions, create issue di repository.

---

**Selamat Testing! 🚀**

Dengan gibRun MCP Server, end-to-end testing jadi lebih cepat, smart, dan automated.

