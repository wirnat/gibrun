# gibRun MCP Server - Contoh Penggunaan

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

## Tips Penggunaan

### 1. Natural Language Commands

Anda bisa memberikan instruksi natural:
- "Test registration API dengan email baru"
- "Check apakah ada users duplicate di database"
- "Fix error di user handler dan rebuild"
- "Run semua tests dan report results"

### 2. AI akan otomatis:
- Choose tools yang tepat
- Handle errors gracefully
- Retry dengan fixes
- Provide detailed reports

### 3. Complex Workflows

AI bisa handle workflows complex seperti:
```
User: "Test complete user journey: register -> login -> create post -> update post -> delete post, verify semua di database"
```

AI akan orchestrate semua steps automatically.

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

1. **Connection String Security**: Jangan hardcode credentials
   - Use environment variables
   - Use connection string dari secure vault

2. **Transaction Testing**: 
   ```sql
   BEGIN;
   -- Your test queries
   ROLLBACK; -- Don't commit test data
   ```

3. **Cleanup After Tests**:
   ```sql
   DELETE FROM users WHERE email LIKE '%test@example%';
   ```

4. **Idempotent Tests**: 
   - Always check if test data exists
   - Clean up before creating new test data

5. **Error Handling**:
   - AI will handle errors automatically
   - Provide clear error messages in APIs
   - Log detailed errors for debugging

