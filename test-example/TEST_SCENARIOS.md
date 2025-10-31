# Test Scenarios for Sample API

## Database Configuration
- **Connection String**: `postgresql://postgres:postgres@localhost:5432/testdb?sslmode=disable`
- **API Base URL**: `http://localhost:8080`

## Setup Instructions

### 1. Database Setup
```bash
# Create and setup database
psql -U postgres -f schema.sql
```

### 2. Run API Server
```bash
cd test-example
go mod download
go run sample-api.go
```

---

## Test Scenarios

### Scenario 1: Health Check ✅

**Description**: Verify API is running and healthy

**Steps**:
1. Make GET request to `/health`
2. Verify status code is 200
3. Verify response contains `"status": "ok"`

**Expected Results**:
- Status: 200 OK
- Response time: < 100ms
- Response body contains status field

---

### Scenario 2: Create User - Valid Data ✅

**Description**: Create a new user with valid data

**Steps**:
1. Make POST request to `/api/users` with:
   ```json
   {
     "email": "test_new_user@example.com",
     "name": "Test User"
   }
   ```
2. Verify status code is 201
3. Verify response contains user ID
4. Query database to verify user exists
5. Cleanup: Delete test user

**Expected Results**:
- Status: 201 Created
- Response contains: id, email, name, message
- Database record exists with matching data
- Email format is valid

**Database Verification Query**:
```sql
SELECT id, email, name, created_at 
FROM users 
WHERE email = 'test_new_user@example.com';
```

---

### Scenario 3: Create User - Invalid Email ❌

**Description**: Attempt to create user with invalid email format

**Test Cases**:
- Invalid email: `invalid-email` (no @)
- Invalid email: `test@` (no domain)
- Invalid email: `@example.com` (no local part)
- Invalid email: `test@.com` (invalid domain)

**Steps**:
1. Make POST request with invalid email
2. Verify status code is 400
3. Verify error message mentions invalid email
4. Query database to confirm user was NOT created

**Expected Results**:
- Status: 400 Bad Request
- Error message: "Invalid email format"
- No database record created

---

### Scenario 4: Create User - Duplicate Email ❌

**Description**: Attempt to create user with existing email

**Steps**:
1. Create first user with email `test_duplicate@example.com`
2. Verify creation successful
3. Attempt to create second user with same email
4. Verify status code is 409
5. Verify error message about duplicate
6. Query database to confirm only one record exists
7. Cleanup: Delete test user

**Expected Results**:
- First creation: 201 Created
- Second creation: 409 Conflict
- Error message: "Email already exists"
- Database has exactly 1 record

**Database Verification Query**:
```sql
SELECT COUNT(*) as count 
FROM users 
WHERE email = 'test_duplicate@example.com';
```
Expected count: 1

---

### Scenario 5: Get All Users ✅

**Description**: Retrieve list of all users

**Steps**:
1. Create 3 test users
2. Make GET request to `/api/users`
3. Verify status code is 200
4. Verify response is array
5. Verify array contains at least the 3 test users
6. Verify users are ordered by created_at DESC
7. Cleanup: Delete test users

**Expected Results**:
- Status: 200 OK
- Response is array of user objects
- Each user has: id, email, name
- Order is most recent first

---

### Scenario 6: Get User By ID - Valid ID ✅

**Description**: Retrieve specific user by ID

**Steps**:
1. Query database to get existing user ID
2. Make GET request to `/api/users/{id}`
3. Verify status code is 200
4. Verify response matches database record
5. Verify all fields present

**Expected Results**:
- Status: 200 OK
- Response contains: id, email, name
- Data matches database

**Database Query to Get ID**:
```sql
SELECT id FROM users LIMIT 1;
```

---

### Scenario 7: Get User By ID - Invalid ID ❌

**Description**: Attempt to retrieve non-existent user

**Steps**:
1. Generate random UUID
2. Make GET request to `/api/users/{random-uuid}`
3. Verify status code is 404
4. Verify error message

**Expected Results**:
- Status: 404 Not Found
- Error message: "User not found"

---

### Scenario 8: Update User - Valid Data ✅

**Description**: Update existing user information

**Steps**:
1. Create test user
2. Get user ID from response
3. Make PUT request to `/api/users/{id}` with:
   ```json
   {
     "name": "Updated Name",
     "email": "updated_email@example.com"
   }
   ```
4. Verify status code is 200
5. Query database to verify updates
6. Make GET request to verify changes
7. Cleanup: Delete test user

**Expected Results**:
- Status: 200 OK
- Message: "User updated successfully"
- Database record reflects changes
- updated_at timestamp changed

**Database Verification Query**:
```sql
SELECT id, email, name, updated_at 
FROM users 
WHERE id = '{user-id}';
```

---

### Scenario 9: Update User - Partial Update ✅

**Description**: Update only name (not email)

**Steps**:
1. Create test user
2. Update only name field
3. Verify email remains unchanged
4. Verify name updated

**Expected Results**:
- Status: 200 OK
- Name updated
- Email unchanged
- updated_at timestamp changed

---

### Scenario 10: Update User - Invalid Email ❌

**Description**: Attempt to update with invalid email

**Steps**:
1. Create test user
2. Attempt to update with invalid email
3. Verify status code is 400
4. Verify original data unchanged

**Expected Results**:
- Status: 400 Bad Request
- Error about invalid email format
- Database record unchanged

---

### Scenario 11: Delete User - Valid ID ✅

**Description**: Delete existing user

**Steps**:
1. Create test user
2. Get user ID
3. Make DELETE request to `/api/users/{id}`
4. Verify status code is 200
5. Query database to confirm deletion
6. Make GET request to verify 404

**Expected Results**:
- Status: 200 OK
- Message: "User deleted successfully"
- Database record removed
- Subsequent GET returns 404

**Database Verification Query**:
```sql
SELECT COUNT(*) as count 
FROM users 
WHERE id = '{user-id}';
```
Expected count: 0

---

### Scenario 12: Delete User - Invalid ID ❌

**Description**: Attempt to delete non-existent user

**Steps**:
1. Generate random UUID
2. Make DELETE request
3. Verify status code is 404

**Expected Results**:
- Status: 404 Not Found
- Error message: "User not found"

---

## Load Testing Scenarios

### Scenario 13: Concurrent User Creation

**Description**: Test API under load

**Steps**:
1. Create 100 users concurrently
2. Track success rate
3. Track average response time
4. Verify all users in database
5. Cleanup: Delete all test users

**Expected Results**:
- Success rate: > 95%
- Average response time: < 500ms
- No database inconsistencies

---

### Scenario 14: Mixed Operations Load Test

**Description**: Simulate real-world usage

**Steps**:
1. 50 concurrent CREATE operations
2. 100 concurrent READ operations
3. 30 concurrent UPDATE operations
4. 20 concurrent DELETE operations
5. Track metrics for each operation type
6. Verify database consistency

---

## Edge Cases

### Scenario 15: Very Long Name

**Test Data**:
```json
{
  "email": "test_long@example.com",
  "name": "A very long name that exceeds normal expectations and tests the database field limits to see how the system handles it properly without breaking or causing errors"
}
```

**Expected**: Should handle gracefully (accept if within DB limits, reject otherwise)

---

### Scenario 16: Special Characters in Name

**Test Data**:
```json
{
  "email": "test_special@example.com",
  "name": "Test O'Brien-Smith (Mr.) [Admin] 123 #@!"
}
```

**Expected**: Should accept and store correctly

---

### Scenario 17: International Characters

**Test Data**:
```json
{
  "email": "test_intl@example.com",
  "name": "José García-Müller François 日本語"
}
```

**Expected**: Should handle UTF-8 correctly

---

## Security Testing

### Scenario 18: SQL Injection Attempt

**Test Data**:
```json
{
  "email": "test@example.com'; DROP TABLE users; --",
  "name": "Malicious User"
}
```

**Expected**: 
- Should NOT execute SQL
- Should return validation error or safely escape

---

### Scenario 19: XSS Attempt

**Test Data**:
```json
{
  "email": "xss@example.com",
  "name": "<script>alert('XSS')</script>"
}
```

**Expected**: 
- Should store safely
- Should return safely encoded

---

## Performance Benchmarks

### Target Metrics:
- Health check: < 50ms
- Get all users: < 200ms
- Get user by ID: < 100ms
- Create user: < 300ms
- Update user: < 250ms
- Delete user: < 200ms

### Database Query Performance:
- All queries should use indexes
- No full table scans for ID lookups
- Email uniqueness check should use index

---

## Cleanup Commands

After testing, cleanup test data:

```sql
-- Delete all test users
DELETE FROM users WHERE email LIKE 'test_%@%';
DELETE FROM users WHERE email LIKE '%@test.com';

-- Or use helper function
SELECT cleanup_test_data();

-- Verify cleanup
SELECT COUNT(*) FROM users WHERE email LIKE 'test_%@%';
```

---

## CI/CD Integration

These scenarios can be run automatically using gibRun MCP Server:

**Example Prompt for AI**:
```
Run all test scenarios from TEST_SCENARIOS.md for the sample API.
For each scenario:
1. Execute the test steps
2. Verify expected results
3. Log pass/fail status
4. Capture performance metrics
5. If any test fails, analyze the error and suggest fixes

Generate a comprehensive test report at the end.
```

**Expected Output**:
```
Test Report:
✅ Scenario 1: Health Check - PASSED (45ms)
✅ Scenario 2: Create User Valid - PASSED (234ms)
✅ Scenario 3: Invalid Email - PASSED (89ms)
... (all scenarios)

Summary:
- Total: 19 scenarios
- Passed: 19
- Failed: 0
- Total time: 12.3s
- Average response time: 187ms
```

