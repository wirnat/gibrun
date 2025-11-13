# Troubleshooting DAP Integration

## Common Issue: "DAP request timeout"

### Symptom
```json
{
  "success": false,
  "command": "restart",
  "error": "DAP request timeout",
  "dap_server": "127.0.0.1:49279"
}
```

### Root Cause

Go debugger (Delve) via VSCode menggunakan **Debug Adapter Protocol (DAP)** dengan cara yang berbeda untuk restart:

1. ❌ **Direct `restart` command** - Not supported by Delve
2. ✅ **`disconnect` with `restart: true`** - Proper way untuk Go debugger

### Solution

**Update gibRun** ke versi terbaru yang sudah di-fix:

```bash
cd /Users/iturban/development/mcp/gibRun
git pull  # atau download versi terbaru
npm install
npm run build
```

**Restart Claude Desktop** untuk load updated MCP server.

### How It Works Now

#### Before (Broken):
```typescript
// Direct restart command - timeout karena not supported
sendDAPRequest(host, port, "restart")
```

#### After (Fixed):
```typescript
// Proper method: disconnect with restart=true
sendDAPRequest(host, port, "disconnect", {
    restart: true,
    terminateDebuggee: false
})

// VSCode akan automatically restart debugger
```

---

## Common Issue: "DAP initialize timeout" / Session never becomes ready

### Symptom
```json
{
  "success": false,
  "stage": "dap",
  "error": "Debugger tidak pernah mengirim event 'initialized'. Jalankan ulang sesi VSCode lalu coba lagi.",
  "dap_server": "127.0.0.1:64469"
}
```
or
```json
{
  "success": false,
  "stage": "dap",
  "error": "DAP initialize timeout - debugger tidak merespons. Pastikan sesi VSCode masih berjalan."
}
```

### Root Cause
- VSCode debugger berhenti / ditutup sehingga port DAP masih LISTEN tetapi tidak ada sesi aktif
- VSCode belum pernah menjalankan `initialize → initialized → configurationDone`, sehingga perintah seperti `restart`/`evaluate` tidak akan dijawab
- Port berubah setelah restart manual, tetapi gibRun masih mencoba port lama

### Fix Steps
1. **Buka VSCode ➜ Debug Console**, pastikan ada log terbaru `DAP server listening at: 127.0.0.1:PORT`.
2. Jika log lama / tidak ada:
   - Tekan `Shift+F5` untuk menghentikan debugger
   - Tekan `F5` untuk menjalankan lagi sampai pesan listening muncul
3. Jalankan kembali perintah MCP (`dap_restart`/`dap_send_command`). gibRun akan otomatis mengirim `initialize → configurationDone` sebelum command utama; tanpa sesi aktif, kamu tetap akan mendapat timeout.
4. Masih error? Jalankan `dap_send_command` sederhana untuk memastikan koneksi:
   ```json
   {
     "name": "dap_send_command",
     "arguments": {
       "command": "evaluate",
       "arguments": {
         "expression": "1+1",
         "context": "repl"
       }
     }
   }
   ```
   - ✅ Jika mendapat hasil evaluasi, koneksi siap
   - ❌ Jika tetap timeout, ulangi langkah 1-2

### Quick Checklist
- [ ] VSCode status bar hijau (debugger aktif)
- [ ] Debug Console menunjukkan port terbaru
- [ ] Tidak ada firewall / VPN yang memblokir koneksi lokal
- [ ] `dap_restart` dijalankan setelah VSCode finish loading (tunggu ±2 detik setelah F5)

---

## Common Issue: `go build` → `no Go files in ...`

### Symptom
```json
{
  "success": false,
  "stage": "build",
  "error": "Command failed: go build",
  "build_stderr": "no Go files in /Users/iturban/Development/Hairkatz/go-hairkatz",
  "hints": [
    "go build tidak menemukan file Go di \"/Users/.../go-hairkatz\". Isi 'project_path' dengan folder yang berisi file Go (contoh: direktori dengan main.go).",
    "Folder \"cmd\" terdeteksi. Jika aplikasimu berada di dalamnya, arahkan 'project_path' ke subfolder yang sesuai, misalnya: /Users/.../go-hairkatz/cmd/<service>."
  ]
}
```

### Root Cause
- `project_path` diarahkan ke root module (`go.mod`) yang tidak memiliki file Go (`main`) langsung
- Aplikasi berada di `cmd/<service>` atau submodule lain
- Ada kesalahan penamaan folder ketika mengisi prompt (typo, huruf kapital, dsb)

### Fix Steps
1. Jalankan perintah berikut di terminal untuk melihat folder yang punya `main.go`:
   ```bash
   find /path/to/project -maxdepth 3 -name main.go
   ```
2. Pilih folder yang berisi file Go yang ingin dibuild (sering kali `cmd/api`, `cmd/server`, dsb).
3. Set `project_path` ke folder tersebut:
   ```
   "project_path": "/Users/.../go-hairkatz/cmd/api"
   ```
4. Ulangi `dap_restart` / `build_go_project`. Response baru akan menyertakan `stage: "build"` jika masih gagal sehingga kamu tahu masalahnya terjadi sebelum menyentuh DAP.

### Tips
- `go build ./cmd/api` berjalan sukses? Gunakan folder `cmd/api` sebagai `project_path`.
- Jika struktur non-standar, tambahkan catatan di README supaya agen lain tahu path yang benar.

---

## Testing the Fix

### Step 1: Verify Build

```bash
cd /Users/iturban/development/mcp/gibRun
npm run build
# Should complete without errors
```

### Step 2: Restart Claude Desktop

1. Quit Claude Desktop completely (Cmd+Q)
2. Reopen Claude Desktop
3. MCP server akan reload dengan code yang sudah di-fix

### Step 3: Test DAP Restart

#### Setup Test Environment:

1. **Start VSCode with Go project**
2. **Start debugger** (F5)
3. **Get DAP port** dari Debug Console:
   ```
   DAP server listening at: 127.0.0.1:49279
   ```

> **Auto-detect info:** Jika kamu tidak menentukan `port`, gibRun akan menjalankan perintah berikut untuk mencari proses `dlv dap` yang sedang LISTEN dan memverifikasi bahwa proses tersebut dijalankan dengan `dlv dap`:
> ```
> lsof -i -P -n | grep "dlv.*LISTEN" | while read line; do 
>   pid=$(echo "$line" | awk '{print $2}')
>   if ps -p $pid -o command= 2>/dev/null | grep -q "dlv dap"; then
>     echo "$line" | awk '{print "Port:", $9, "PID:", $2}'
>   fi
> done
> ```
> - ✅ Jika hanya ada satu proses, host/port itu dipakai otomatis
> - ⚠️ Jika lebih dari satu proses ditemukan, kamu akan diminta memilih salah satunya dengan mengisi `port` (atau hentikan proses yang tidak terpakai)
> - ⏳ Jika tidak ada proses, jalankan debugger VSCode (F5) terlebih dahulu

#### Test Commands:

**Test 1: Simple restart without rebuild**
```
Prompt AI: "Restart debugger port 49279 tanpa rebuild"
```

Expected response:
```json
{
  "success": true,
  "message": "Debugger restart initiated (disconnect with restart=true)",
  "note": "Debugger will restart automatically..."
}
```

**Test 2: Restart with rebuild**
```
Prompt AI: "Rebuild project di /path/to/project dan restart debugger port 49279"
```

Expected:
1. ✅ Build succeeds
2. ✅ Debugger restarts
3. ✅ New binary loaded

---

## Understanding the Fix

### What Changed

#### 1. Better Message Parsing

**Before:**
- Single response parsing
- Didn't handle DAP events properly
- Timeout on first message

**After:**
- Parses multiple messages in buffer
- Distinguishes between responses and events
- Waits for actual response message

```typescript
// Now handles multiple messages
while (true) {
    const message = parseNextMessage(buffer);
    if (message.type === "response") {
        resolve(message);  // Only resolve on responses
    }
    // Ignore events, continue reading
}
```

#### 2. Proper Restart Method

**Before:**
```typescript
// Direct restart - not supported by Go debugger
await sendDAPRequest(host, port, "restart");
```

**After:**
```typescript
// Proper method for Go debugger
await sendDAPRequest(host, port, "disconnect", {
    restart: true,         // Signal VSCode to restart
    terminateDebuggee: false  // Keep process alive during restart
});
```

#### 3. Automatic Session Initialization

gibRun kini menjalankan urutan DAP standar sebelum mengirim perintah utama:

1. `initialize`
2. menunggu event `initialized`
3. mengirim `configurationDone`
4. baru menjalankan perintah yang diminta (`disconnect`, `restart`, `evaluate`, dll)

Jika debugger tidak pernah mengirim event `initialized`, gibRun akan menghentikan koneksi dan menampilkan error khusus sehingga kamu tahu bahwa sesi VSCode belum siap. Lihat bagian *Common Issue: "DAP initialize timeout"* untuk langkah perbaikannya.

#### 4. Fallback Strategy

```typescript
try {
    // Try disconnect with restart (preferred)
    await disconnect({ restart: true });
} catch {
    // Fallback: try direct restart command
    await sendDAPRequest("restart");
}
```

### Why Go Debugger is Different

**Standard DAP (Node.js, Python):**
- Support `restart` command directly
- Simple single-command restart

**Go Debugger (Delve):**
- Restart via `disconnect` with `restart: true`
- VSCode handles the actual restart
- More complex but more reliable

---

## Verification Checklist

After update, verify:

- [ ] Build succeeds: `npm run build`
- [ ] Claude Desktop restarted
- [ ] VSCode debugger running
- [ ] DAP port visible in Debug Console (atau auto-detect menemukan proses `dlv dap`)
- [ ] Test restart: `"Restart debugger port XXXXX"`
- [ ] Success response received
- [ ] VSCode debugger actually restarted
- [ ] New code loaded (if rebuilt)

---

## Alternative Workarounds (If Still Issues)

### Workaround 1: Manual Restart via Shell

```
Prompt AI: "Build project lalu restart VSCode debugger manually"

AI akan:
1. go build
2. execute_shell_command: "pkill -f your-app"
3. Prompt: "Please restart debugger (F5) manually"
```

### Workaround 2: Use VSCode Task

Create `.vscode/tasks.json`:
```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "rebuild-and-restart",
      "type": "shell",
      "command": "go build && echo 'Please restart debugger (Shift+F5, then F5)'"
    }
  ]
}
```

Prompt AI:
```
"Run VSCode task rebuild-and-restart"
```

### Workaround 3: Hot Reload Configuration

**Not recommended** but possible - configure auto-restart on file changes:

`.vscode/settings.json`:
```json
{
  "go.delveConfig": {
    "dlvLoadConfig": {
      "followPointers": true,
      "maxVariableRecurse": 1,
      "maxStringLen": 120,
      "maxArrayValues": 64,
      "maxStructFields": -1
    }
  }
}
```

---

## Debug Mode

### Enable Verbose DAP Logging

Set environment variable before starting Claude:
```bash
export GIBRUN_DEBUG=1
```

This will show detailed DAP communication in MCP server logs.

### Check DAP Communication

Look for these in logs:
```
Connecting to DAP server at 127.0.0.1:49279...
Sending DAP request: disconnect
Received DAP response: {...}
Debugger restart initiated
```

---

## Advanced Debugging

### Test DAP Connection Manually

Use `telnet` or `nc` to test DAP server:

```bash
# Connect to DAP server
nc 127.0.0.1 49279

# Send test request (type this):
Content-Length: 78

{"seq":1,"type":"request","command":"disconnect","arguments":{"restart":true}}
```

Expected response:
```
Content-Length: XX

{"seq":1,"type":"response","request_seq":1,"success":true,...}
```

### Check VSCode DAP Configuration

**Verify launch.json:**
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Launch Go",
      "type": "go",
      "request": "launch",
      "mode": "debug",
      "program": "${workspaceFolder}",
      "stopOnEntry": false,
      "console": "integratedTerminal"
    }
  ]
}
```

**Key points:**
- `type: "go"` - Must be Go debugger
- `mode: "debug"` - Debug mode enabled
- `console: "integratedTerminal"` - See DAP messages

---

## Known Limitations

### 1. VSCode Must Be Active

DAP restart only works when VSCode debugger is active:
- ✅ Green play button in status bar
- ✅ Debug Console shows "DAP server listening..."
- ❌ Won't work if debugger stopped

### 2. Breakpoints During Restart

During restart (1-2 seconds):
- Breakpoints temporarily inactive
- Can't evaluate variables
- Wait for "Debugger attached" message

### 3. File Changes During Debug

If you modify files during debugging:
- Must rebuild before restart
- Use `rebuild_first: true` (default)
- Or build manually first

### 4. Port Changes

DAP port changes on each VSCode restart:
- Always check Debug Console for current port
- Don't hardcode port in scripts
- AI should ask for port if needed

---

## Getting Help

### Issue Persists?

1. **Check gibRun version:**
   ```bash
   cd /Users/iturban/development/mcp/gibRun
   git log -1 --oneline
   # Should show latest commit with DAP fix
   ```

2. **Check Claude Desktop config:**
   ```bash
   cat ~/Library/Application\ Support/Claude/claude_desktop_config.json
   # Verify gibRun path is correct
   ```

3. **Test MCP server directly:**
   ```bash
   npx @modelcontextprotocol/inspector node build/index.js
   # Try dap_restart tool in inspector
   ```

4. **Report issue with details:**
   - gibRun version
   - VSCode version
   - Go version
   - Delve version: `dlv version`
   - Full error message
   - DAP port from Debug Console

---

## Success Indicators

When working correctly:

1. **Build Phase (if rebuild_first=true):**
   ```
   Building project at /path/to/project...
   Build completed successfully
   ```

2. **DAP Phase:**
   ```
   Restarting debugger at 127.0.0.1:49279...
   ```

3. **Success Response:**
   ```json
   {
     "success": true,
     "message": "Debugger restart initiated (disconnect with restart=true)",
     "note": "Debugger will restart automatically. Wait a few seconds..."
   }
   ```

4. **VSCode Behavior:**
   - Status bar briefly shows orange (restarting)
   - Then back to green (running)
   - Debug Console shows: "Debugger attached"
   - Breakpoints re-activate

---

## Performance Notes

### Timing
- **Without rebuild:** ~1-2 seconds
- **With rebuild:** ~3-5 seconds (depending on project size)
- **First-time connection:** May take slightly longer

### Optimization Tips

1. **Disable rebuild if not needed:**
   ```typescript
   { 
     port: 49279, 
     rebuild_first: false  // Skip rebuild if no code changes
   }
   ```

2. **Use incremental builds:**
   ```bash
   # In project directory
   go build -i  # Use installed packages
   ```

3. **Cache dependencies:**
   ```bash
   go mod download  # Pre-download deps
   ```

---

## Summary

**Problem:** DAP timeout karena direct `restart` command not supported by Go debugger

**Solution:** Use `disconnect` with `restart: true` flag

**Result:** Seamless debugger restart that works dengan Go/Delve

**Update Required:** Ya, perlu update ke versi terbaru gibRun

---

**Questions?**

- Check DAP_INTEGRATION.md untuk detailed guide
- Check README.md untuk API reference
- GitHub Issues untuk bug reports
