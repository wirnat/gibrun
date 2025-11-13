# gibRun MCP Server

MCP Server untuk membantu backend programmer dalam proses end-to-end API testing dengan integrasi PostgreSQL, HTTP requests, dan Go build automation.

## Fitur

### Tools yang Tersedia:

1. **postgres_query** - Execute PostgreSQL queries
   - Mendapatkan UID dari database
   - Verifikasi hasil API di database
   - Query data untuk testing

2. **http_request** - Test API endpoints (seperti curl)
   - Support semua HTTP methods (GET, POST, PUT, PATCH, DELETE)
   - Custom headers dan body
   - Tracking response time

3. **build_go_project** - Build Go project
   - Compile Go code dengan build flags
   - Output binary ke path tertentu
   - Error reporting yang detail

4. **run_go_command** - Execute Go commands
   - Run tests (`go test`)
   - Run aplikasi (`go run`)
   - Manage dependencies (`go mod tidy`)

5. **read_source_file** - Baca source code
   - Examine code sebelum fixing
   - Debug issues

6. **write_source_file** - Write/update source code
   - Fix code issues
   - Update implementation

7. **execute_shell_command** - Execute arbitrary shell commands
   - Custom operations
   - Cleanup tasks
   - Run custom scripts

8. **dap_restart** - Restart VSCode debugger session 🔥 **NEW**
   - Hot reload setelah fix code
   - Auto rebuild before restart
   - Seamless debugging workflow
   - Works dengan VSCode Go debugger

9. **dap_send_command** - Send custom DAP commands
   - Advanced debugger control
   - Set breakpoints programmatically
   - Evaluate expressions
   - Custom DAP operations

### Debugger Tools (mirror `external/mcp-go-debugger`)

gibRun sekarang otomatis menjalankan proxy MCP untuk `external/mcp-go-debugger`, sehingga semua tool debugger Delve tersedia langsung di server ini:

- **launch** – Jalankan binary Go dengan Delve dan mulai sesi debugging baru.
- **attach** – Attach ke proses Go yang sudah berjalan berdasarkan PID.
- **debug** – Compile & debug file Go tertentu (mirip `dlv debug path/to/file.go`).
- **debug_test** – Build serta debug fungsi test tertentu dengan flag tambahan.
- **set_breakpoint** – Pasang breakpoint pada file + nomor baris.
- **list_breakpoints** – Lihat semua breakpoint yang aktif beserta statusnya.
- **remove_breakpoint** – Hapus breakpoint berdasarkan ID Delve.
- **continue** – Lanjutkan eksekusi sampai breakpoint berikutnya atau proses berakhir.
- **step** – Step into baris atau fungsi berikutnya.
- **step_over** – Step over ke baris berikut tanpa masuk ke fungsi.
- **step_out** – Step keluar dari fungsi saat ini.
- **eval_variable** – Evaluasi ekspresi/variable dengan kedalaman custom.
- **get_debugger_output** – Ambil STDOUT/STDERR yang ditangkap oleh Delve beserta konteks eksekusi.
- **close** – Tutup sesi debugging aktif dan hentikan server Delve internal.

## Instalasi

### Prerequisites

- Node.js 18+ 
- PostgreSQL (untuk database testing)
- Go 1.20+ (untuk build automation **dan** agar proxy debugger bisa menjalankan Delve)
- Delve (`dlv`) + dependencies dari [`external/mcp-go-debugger`](external/mcp-go-debugger)

### Install Dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

## Deployment

### Production Deployment

For production deployment with Docker and monitoring:

```bash
# Clone repository
git clone https://github.com/your-org/gibrun-mcp-server.git
cd gibrun-mcp-server

# Configure environment
cp .env.example .env.production
# Edit .env.production with your production values

# Deploy with monitoring stack
docker-compose -f docker-compose.prod.yml --profile monitoring --env-file .env.production up -d

# Or use the automated deployment script
chmod +x scripts/deploy.sh
ENV_FILE=.env.production ./scripts/deploy.sh
```

### Services Included

- **gibrun-mcp**: Main MCP server
- **PostgreSQL**: Database for testing
- **Redis**: Caching layer (optional)
- **Prometheus**: Metrics collection
- **Grafana**: Monitoring dashboards
- **Nginx**: Reverse proxy

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions.

## Konfigurasi

### Menambahkan ke Claude Desktop

Edit file konfigurasi Claude Desktop:

**MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Tambahkan konfigurasi berikut:

```json
{
  "mcpServers": {
    "gibrun": {
      "command": "node",
      "args": ["/path/to/gibRun/build/index.js"]
    }
  }
}
```

Atau menggunakan npx (setelah publish):

```json
{
  "mcpServers": {
    "gibrun": {
      "command": "npx",
      "args": ["-y", "gibrun-mcp-server"]
    }
  }
}
```

### Konfigurasi untuk Cursor

Jika menggunakan Cursor, tambahkan di `.cursor/mcp_config.json`:

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

### Environment Variables untuk PostgreSQL

Anda dapat menyimpan kredensial database langsung di konfigurasi agen MCP sehingga tidak perlu mengetik `connection_string` setiap kali memanggil `postgres_query`. Server akan mencoba urutan berikut:

1. Nilai argumen `connection_string` (jika tetap diberikan).
2. Environment variable `POSTGRES_CONNECTION_STRING`.
3. Kombinasi `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST` (default `localhost`), `POSTGRES_PORT` (default `5432`), dan `POSTGRES_DB`.

Contoh konfigurasi Claude/Cursor:

```json
"environment": {
  "POSTGRES_USER": "postgres",
  "POSTGRES_PASSWORD": "postgres",
  "POSTGRES_HOST": "localhost",
  "POSTGRES_PORT": "5432",
  "POSTGRES_DB": "hairkatz_0_0_1"
}
```

Setelah environment di-set, cukup kirim query:

```
Tool: postgres_query
Args:
  query: "SELECT * FROM users LIMIT 5"
```

Jika butuh database lain, override dengan `connection_string` langsung pada tool call.

### Konfigurasi Go Debugger Proxy

Debugger tools di atas dijalankan oleh proses `mcp-go-debugger` yang dipanggil otomatis:

1. gibRun mencoba menjalankan binary `mcp-go-debugger` yang tersedia di `$PATH`.
2. Jika tidak ditemukan, server fallback ke `go run ./cmd/mcp-go-debugger` di folder `external/mcp-go-debugger` (pastikan Anda sudah menjalankan `go mod download` di sana minimal sekali).

Anda dapat mengoverride perilaku tersebut via environment variable pada konfigurasi MCP client:

```json
"environment": {
  "GIBRUN_GO_DEBUGGER_COMMAND": "/abs/path/to/mcp-go-debugger",
  "GIBRUN_GO_DEBUGGER_ARGS": "--log --log-output=rpc",
  "GIBRUN_GO_DEBUGGER_CWD": "/Users/you/Development/mcp/gibrun/external/mcp-go-debugger"
}
```

- `GIBRUN_GO_DEBUGGER_COMMAND` — Path ke executable alternatif (misalnya hasil `go install`).
- `GIBRUN_GO_DEBUGGER_ARGS` — Argumen tambahan yang akan diparsing dengan pemisah spasi sederhana.
- `GIBRUN_GO_DEBUGGER_CWD` — Working directory paksa untuk proses debugger.

Jika proxy gagal start (misalnya Go belum terinstall), gibRun akan tetap berjalan tetapi hanya menampilkan tools lokal.

## Contoh Penggunaan

### Workflow End-to-End Testing

**Scenario**: Testing user registration API

1. **Query database untuk get UID yang tersedia**
```
Tool: postgres_query
Args:
  connection_string: "postgresql://user:pass@localhost:5432/mydb"
  query: "SELECT id FROM users WHERE email = $1"
  params: ["test@example.com"]
```

2. **Test API endpoint**
```
Tool: http_request
Args:
  url: "http://localhost:8080/api/users"
  method: "POST"
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer token123"
  }
  body: {
    "email": "newuser@example.com",
    "name": "Test User"
  }
```

3. **Verify hasil di database**
```
Tool: postgres_query
Args:
  connection_string: "postgresql://user:pass@localhost:5432/mydb"
  query: "SELECT * FROM users WHERE email = $1"
  params: ["newuser@example.com"]
```

4. **Jika ada error, read source code**
```
Tool: read_source_file
Args:
  file_path: "/path/to/project/handlers/user.go"
```

5. **Fix code**
```
Tool: write_source_file
Args:
  file_path: "/path/to/project/handlers/user.go"
  content: "package handlers\n\n// Fixed code here..."
```

6. **Rebuild project**
```
Tool: build_go_project
Args:
  project_path: "/path/to/project"
  build_flags: "-v"
```

7. **Test lagi** (ulangi step 2-3)

### Testing dengan Multiple Assertions

AI dapat melakukan workflow otomatis:
- Query database untuk prepare test data
- Call API endpoint
- Verify response status dan data
- Check database untuk confirm changes
- Jika gagal, analyze error, fix code, rebuild, dan test ulang
- Loop sampai test pass

## API Reference

### postgres_query

Execute PostgreSQL query.

**Parameters:**
- `connection_string` (required): PostgreSQL connection string
- `query` (required): SQL query
- `params` (optional): Query parameters array

**Returns:**
```json
{
  "success": true,
  "rowCount": 1,
  "rows": [...],
  "fields": [...]
}
```

### http_request

Make HTTP request.

**Parameters:**
- `url` (required): Target URL
- `method` (optional): HTTP method (GET, POST, PUT, PATCH, DELETE)
- `headers` (optional): HTTP headers object
- `body` (optional): Request body object
- `timeout` (optional): Timeout in milliseconds

**Returns:**
```json
{
  "success": true,
  "status": 200,
  "statusText": "OK",
  "headers": {...},
  "data": {...},
  "duration_ms": 123
}
```

### build_go_project

Build Go project.

**Parameters:**
- `project_path` (required): Path to Go project
- `build_flags` (optional): Additional build flags
- `output_path` (optional): Output binary path

**Returns:**
```json
{
  "success": true,
  "stdout": "...",
  "stderr": "...",
  "message": "Build completed successfully"
}
```

### run_go_command

Execute Go command.

**Parameters:**
- `project_path` (required): Path to Go project
- `command` (required): Go command (e.g., "test ./...", "run main.go")

**Returns:**
```json
{
  "success": true,
  "stdout": "...",
  "stderr": "...",
  "command": "go test ./..."
}
```

### read_source_file

Read source code file.

**Parameters:**
- `file_path` (required): Path to file

**Returns:**
```json
{
  "success": true,
  "file_path": "...",
  "content": "...",
  "size": 1234
}
```

### write_source_file

Write source code file.

**Parameters:**
- `file_path` (required): Path to file
- `content` (required): File content

**Returns:**
```json
{
  "success": true,
  "file_path": "...",
  "size": 1234,
  "message": "File written successfully"
}
```

### execute_shell_command

Execute shell command.

**Parameters:**
- `command` (required): Shell command
- `working_dir` (optional): Working directory

**Returns:**
```json
{
  "success": true,
  "command": "...",
  "stdout": "...",
  "stderr": "..."
}
```

### dap_restart

Restart VSCode debugger session via Debug Adapter Protocol.

**Parameters:**
- `port` (optional): DAP server port (lihat di VSCode debug console: "DAP server listening at: 127.0.0.1:PORT"). Jika dikosongkan, gibRun akan mencari port otomatis memakai `lsof -i -P -n | grep "dlv.*LISTEN"` dan memverifikasi proses `dlv dap`.
- `host` (optional): DAP server host (default: "127.0.0.1"). Ikut terdeteksi otomatis jika `port` dikosongkan.
- `rebuild_first` (optional): Rebuild project before restart (default: true)
- `project_path` (required if rebuild_first=true): Path to Go project

**Returns:**
```json
{
  "success": true,
  "message": "Debugger restarted successfully",
  "dap_response": {...},
  "build_result": {...},
  "dap_server": "127.0.0.1:49279"
}
```

**Example Usage:**
```
AI Prompt: "Fix the bug di user_handler.go line 45, 
           rebuild, dan restart debugger di port 49279"

AI akan:
1. Read source file
2. Identify bug
3. Write fixed code
4. Use dap_restart dengan port 49279 
   (automatically rebuilds dan restarts debugger)
```

**Auto-detecting DAP Address:**
- Tidak perlu mengisi `port` jika hanya ada satu proses `dlv dap` yang LISTEN — gibRun akan menjalankan perintah berikut dan memakai host/port yang ditemukan:
  ```
  lsof -i -P -n | grep "dlv.*LISTEN" | while read line; do 
    pid=$(echo "$line" | awk '{print $2}')
    if ps -p $pid -o command= 2>/dev/null | grep -q "dlv dap"; then
      echo "$line" | awk '{print "Port:", $9, "PID:", $2}'
    fi
  done
  ```
- Jika lebih dari satu proses ditemukan, gibRun akan menampilkan daftar port tersebut dan meminta kamu memilih dengan mengisi `port` (dan opsional `host`).
- Manual fallback: jalankan debugger VSCode (F5), buka Debug Console, lalu cari pesan `DAP server listening at: 127.0.0.1:XXXXX` dan masukkan port tersebut.

### dap_send_command

Send custom DAP command for advanced debugger control.

**Parameters:**
- `port` (optional): DAP server port. Kosongkan untuk auto-detect seperti di atas.
- `command` (required): DAP command name (e.g., "restart", "disconnect", "evaluate")
- `host` (optional): DAP server host (default: "127.0.0.1"). Ikut terdeteksi otomatis jika `port` tidak diisi.
- `arguments` (optional): Command arguments as object

**Returns:**
```json
{
  "success": true,
  "command": "evaluate",
  "response": {...},
  "dap_server": "127.0.0.1:49279"
}
```

**Example Commands:**
- `restart` - Restart debugging session
- `disconnect` - Stop debugging
- `evaluate` - Evaluate expression
- `setBreakpoints` - Set breakpoints programmatically

## Development

### Watch mode untuk development

```bash
npm run dev
```

### Testing MCP Server

Gunakan MCP Inspector untuk testing:

```bash
npx @modelcontextprotocol/inspector node build/index.js
```

## Keuntungan Menggunakan gibRun

1. **Automated Testing Workflow**: AI dapat menjalankan complete test cycle secara otomatis
2. **Database Integration**: Direct access ke PostgreSQL untuk verify data
3. **Quick Iteration**: Auto-rebuild dan re-test ketika menemukan errors
4. **Seamless Development**: Integrated dengan VSCode debugger workflow
5. **Smart Error Handling**: AI dapat analyze errors dan propose fixes

## Troubleshooting

### Database Connection Issues

Pastikan PostgreSQL running dan connection string benar:
```
postgresql://username:password@host:port/database
```

### Build Failures

Cek Go installation:
```bash
go version
```

Pastikan semua dependencies tersedia:
```bash
go mod download
```

### Permission Issues

Pastikan file permissions correct untuk read/write operations.

## License

MIT

## Contributing

Contributions welcome! Please submit issues atau pull requests.
