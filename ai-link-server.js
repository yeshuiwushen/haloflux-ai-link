#!/usr/bin/env node
/*!
 * HALOFLUX · AI LINK — local telemetry service
 * ============================================================
 * Part of "HALOFLUX · AI LINK", a NONCOMMERCIAL fan modification of
 * HALOFLUX by Ryder191 (RYDER CODE / Ms MAIKEBAIs CAT).
 * Original: https://github.com/Ryder191/haloflux
 * License: PolyForm Noncommercial 1.0.0 (see LICENSE) — noncommercial only.
 * 本文件是「基于 HALOFLUX 修改」的本地 AI 数据联动版的一部分，仅限非商业用途。
 * ============================================================
 *
 * GET  http://127.0.0.1:8737/stats          -> JSON snapshot (CORS: *)
 * GET  http://127.0.0.1:8737/stats?callback=cb -> JSONP fallback (script-tag safe)
 * GET  http://127.0.0.1:8737/health         -> {"ok":true}
 * GET  http://127.0.0.1:8737/               -> tiny human-readable status page
 *
 * Data sources
 *   - system : os.cpus() deltas, os.totalmem()/freemem(), process.uptime()
 *   - gpu    : nvidia-smi (optional, polled every 2s, null when unavailable)
 *   - ai     : %USERPROFILE%\.dsh\sessions\**\session*.jsonl.zstd  (DeepSeek Harness)
 *              parsed incrementally; the most recently modified session is "current".
 *
 * Usage:  node ai-link-server.js            (runs until Ctrl+C)
 *         node ai-link-server.js --once     (print one snapshot to stdout, exit)
 */

'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { execFile, spawn } = require('child_process');

/* ------------------------------------------------------------------ config */

const VERSION = '1.5.0';
const HOST = process.env.AI_LINK_HOST || '127.0.0.1';
const PORT = Number(process.env.AI_LINK_PORT || 8737);
const STATIC_PORT = Number(process.env.AI_LINK_HTTP_PORT || 8738);
const BASE_DIR = __dirname;
const LOG_FILE = path.join(BASE_DIR, 'server.log');
const PID_FILE = path.join(BASE_DIR, 'ai-link.pid');
const SESSIONS_DIR = process.env.DSH_SESSIONS_DIR || path.join(os.homedir(), '.dsh', 'sessions');

const REFRESH_MS = 1000;        // cache refresh cadence
const RATE_WINDOW_MS = 10000;   // tokens/s window
const ACTIVE_WINDOW_MS = 180000; // session counts as an "active agent" if touched in 3 min
const LOG_MAX_BYTES = 4 * 1024 * 1024;
const ONCE = process.argv.includes('--once');

/* ------------------------------------------------------------------- utils */

let logBytes = 0;
try { logBytes = fs.statSync(LOG_FILE).size; } catch (_) { /* no log yet */ }

function log(level, msg) {
  const line = `${new Date().toISOString()} [${level}] ${msg}`;
  try {
    if (logBytes > LOG_MAX_BYTES) { fs.writeFileSync(LOG_FILE, ''); logBytes = 0; }
    fs.appendFileSync(LOG_FILE, line + os.EOL);
    logBytes += Buffer.byteLength(line) + 2;
  } catch (_) { /* logging must never break the service */ }
  if (level === 'ERROR' || level === 'WARN') console.error(line);
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function round(v, d) { const p = Math.pow(10, d); return Math.round(v * p) / p; }

/* ------------------------------------------------------------- system data */

let cpuPrev = null;

function readCpuTimes() {
  const cpus = os.cpus();
  const cores = [];
  let idle = 0, total = 0;
  for (const c of cpus) {
    let t = 0;
    for (const k in c.times) t += c.times[k];
    cores.push({ idle: c.times.idle, total: t });
    idle += c.times.idle;
    total += t;
  }
  return { idle, total, cores };
}

function sampleCpu() {
  const now = readCpuTimes();
  if (!cpuPrev) { cpuPrev = now; return null; }         // first tick has no delta
  const dTotal = now.total - cpuPrev.total;
  const dIdle = now.idle - cpuPrev.idle;
  const prevCores = cpuPrev.cores;
  cpuPrev = now;
  if (dTotal <= 0) return null;
  const cores = now.cores.map((c, i) => {
    const p = prevCores[i];
    if (!p) return 0;
    const dt = c.total - p.total, di = c.idle - p.idle;
    return dt > 0 ? Math.round(clamp(100 * (1 - di / dt), 0, 100)) : 0;
  });
  return { pct: round(clamp(100 * (1 - dIdle / dTotal), 0, 100), 1), cores };
}

function sampleRam() {
  const total = os.totalmem();
  const free = os.freemem();
  if (!total) return null;
  return {
    usedPct: round(clamp(100 * (1 - free / total), 0, 100), 1),
    usedGB: round((total - free) / 1073741824, 2),
    totalGB: round(total / 1073741824, 2)
  };
}

/* -------------------------------------------------------------------- gpu */

const NVSMI = process.env.AI_LINK_NVSMI || 'nvidia-smi';
const GPU_DISABLED = process.env.AI_LINK_GPU === '0';

const gpu = {
  enabled: false,       // set false permanently when nvidia-smi is missing
  name: null,
  value: null,
  busy: false,
  lastError: null,
  mode: null,           // 'pipe' | 'file'
  seq: 0
};

/**
 * Run nvidia-smi and return its stdout.
 * A locked-down host may deny creating pipes for child processes (spawn EPERM).
 * In that case we let nvidia-smi write to a file itself (-f) and read it back,
 * which needs no pipe at all.
 */
function runNv(args, timeoutMs, cb) {
  let settled = false;
  function finish(err, out) { if (settled) return; settled = true; cb(err, out); }

  function viaFile() {
    const outFile = path.join(os.tmpdir(), `haloflux-ai-link-gpu-${process.pid}-${++gpu.seq}.txt`);
    let child;
    try {
      child = spawn(NVSMI, args.concat(['-f', outFile]), { stdio: 'ignore', windowsHide: true });
    } catch (e) { return finish(e); }
    const timer = setTimeout(() => { try { child.kill(); } catch (_) { /* ignore */ } finish(new Error('timeout')); }, timeoutMs);
    child.on('error', (e) => { clearTimeout(timer); finish(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      fs.readFile(outFile, 'utf8', (e, txt) => {
        try { fs.unlink(outFile, () => {}); } catch (_) { /* ignore */ }
        if (e) return finish(new Error('nvidia-smi gave no output' + (code ? ` (exit ${code})` : '')));
        gpu.mode = 'file';
        finish(null, txt);
      });
    });
  }

  try {
    execFile(NVSMI, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout) => {
      if (!err) { gpu.mode = 'pipe'; return finish(null, String(stdout)); }
      const code = err && err.code;
      if (code === 'EPERM' || code === 'EACCES') return viaFile();   // pipe blocked -> file fallback
      finish(err);
    });
  } catch (e) {
    viaFile();
  }
}

function gpuAvailable() {
  if (GPU_DISABLED) { log('INFO', 'GPU: disabled by AI_LINK_GPU=0'); return; }
  try {
    runNv(['--query-gpu=name', '--format=csv,noheader,nounits'], 4000, (err, stdout) => {
      if (err) {
        gpu.enabled = false;
        gpu.lastError = err.message;
        log('INFO', `GPU: nvidia-smi unavailable (${err.code || err.message}); gpu=null`);
        return;
      }
      gpu.enabled = true;
      gpu.name = String(stdout).split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0] || null;
      log('INFO', `GPU: ${gpu.name} (${gpu.mode} transport)`);
      pollGpu();
    });
  } catch (err) {
    gpu.enabled = false;
    log('WARN', 'GPU probe failed: ' + err.message);
  }
}

function pollGpu() {
  if (!gpu.enabled || gpu.busy) return;
  gpu.busy = true;
  try {
    runNv(['--query-gpu=utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'], 3000,
      (err, stdout) => {
        gpu.busy = false;
        if (err) { gpu.lastError = err.message; return; }  // keep the last good value
        const first = String(stdout).split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0];
        if (!first) return;
        const parts = first.split(',').map(s => Number(String(s).trim()));
        if (parts.length < 3 || parts.some(n => !isFinite(n))) return;
        const memTotal = parts[2];
        gpu.value = {
          utilization: round(parts[0], 1),
          memoryUsedMB: Math.round(parts[1]),
          memoryTotalMB: Math.round(memTotal),
          memoryUsedPct: memTotal > 0 ? round(100 * parts[1] / memTotal, 1) : null,
          name: gpu.name
        };
        gpu.lastError = null;
      });
  } catch (err) {
    gpu.busy = false;
    log('WARN', 'GPU poll failed: ' + err.message);
  }
}

/* -------------------------------------------------------------------- net */
const netStat = { rxPerSec: null, txPerSec: null, totalMB: null, ok: false };
let netPrev = null;

function pollNet() {
  execFile('netstat', ['-e'], { timeout: 2500, windowsHide: true }, (err, stdout) => {
    if (err) { netStat.ok = false; return; }
    const text = String(stdout);
    // netstat -e 的第一行数据永远是 "Bytes 收 发"（各语言版本标签不同、还是 GBK 编码，
    // 所以直接取"第一行只有两个大整数"的那一行）
    let rx = null, tx = null;
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      const m = /^[^\d]*(\d+)\s+(\d+)\s*$/.exec(line);
      if (m) { rx = Number(m[1]); tx = Number(m[2]); break; }
    }
    if (rx === null || tx === null) { netStat.ok = false; return; }
    const now = Date.now();
    netStat.ok = true;
    if (netPrev) {
      const dt = (now - netPrev.t) / 1000;
      if (dt > 0.2) {
        netStat.rxPerSec = Math.max(0, Math.round((rx - netPrev.rx) / dt));
        netStat.txPerSec = Math.max(0, Math.round((tx - netPrev.tx) / dt));
        netStat.totalMB = Math.round((rx + tx) / 1048576);
      }
    }
    netPrev = { rx, tx, t: now };
  });
}

/* ------------------------------------------------------------------- procs
   常驻一个 powershell 子进程，每 2 秒吐一行 "id|name|cpu秒|内存字节"，
   Node 这边做差得到每个进程的 CPU%（单次启动 powershell 要 300ms+，常驻只付一次）。*/

let procPs = null;
let procBuf = '';
let procAt = 0;
let procPrevCpu = new Map();
let procTop = null;
let procAll = null;
let procCount = null;
let procTimer = 0;
const procIcons = new Map();   // 进程名 -> data:image/png;base64
const gpuByPid = new Map();    // pid -> GPU 占用%

/* 应用内部的辅助进程：Windows 上算窗口进程，但用户不认为它是"开着的软件" */
const HELPER_PROCS = new Set([
  'webwallpaper64', 'wallpaperui', 'steamwebhelper', 'steamservice', 'nvidia overlay',
  'nvidia share', 'nvcontainer', 'nvsphelper64', 'crashpad_handler', 'explorer',
  'electron', 'msedgewebview2', 'searchapp', 'textinputhost'
]);
let procGpuSamples = 0;

/* 系统后台进程：不当作"用户开的软件"显示 */
const SYSTEM_PROCS = new Set([
  'system', 'system idle process', 'registry', 'memory compression', 'secure system',
  'smss', 'csrss', 'wininit', 'winlogon', 'services', 'lsass', 'svchost', 'fontdrvhost',
  'dwm', 'conhost', 'runtimebroker', 'wmiprvse', 'spoolsv', 'audiodg', 'searchindexer',
  'searchapp', 'searchhost', 'sihost', 'taskhostw', 'ctfmon', 'msmpeng', 'nissrv',
  'securityhealthservice', 'securityhealthsystray', 'startmenuexperiencehost',
  'shellexperiencehost', 'textinputhost', 'applicationframehost', 'backgroundtaskhost',
  'lockapp', 'usoclient', 'tiworker', 'trustedinstaller', 'msiexec', 'dllhost',
  'taskmgr', 'sppsvc', 'wuauclt', 'compattelrunner', 'smartscreen', 'wsappx',
  'aggregatorhost', 'crossdeviceservice', 'devicesflowhost', 'gamebar', 'gamebarftserver'
]);

function parseProcLine(payload) {
  const now = Date.now();
  const dt = procAt ? (now - procAt) / 1000 : 0;
  const rows = [];
  const selfPid = process.pid;
  const psPid = procPs ? procPs.pid : 0;
  for (const part of payload.split(';')) {
    const f = part.split('|');
    if (f.length < 4) continue;
    const id = Number(f[0]);
    const name = f[1];
    const cpuSec = Number(f[2]) || 0;
    const ws = Number(f[3]) || 0;
    const sys = f.length > 4 ? (Number(f[4]) === 1) : false;
    const win = f.length > 5 ? (Number(f[5]) === 1) : false;
    if (!id || !name) continue;
    // 别把自己和采集用的 powershell 也算进去
    if (id === selfPid || id === psPid) continue;
    rows.push({ id, name, cpuSec, ws, sys: sys, win: win });
  }
  if (!rows.length) return;
  if (dt > 0.3) {
    const agg = new Map();
    for (const r of rows) {
      const prev = procPrevCpu.get(r.id);
      const delta = prev === undefined ? 0 : Math.max(0, r.cpuSec - prev);
      let item = agg.get(r.name);
      if (!item) { item = { name: r.name, cpu: 0, memMB: 0, sysCnt: 0, winCnt: 0, cnt: 0 }; agg.set(r.name, item); }
      item.cpu += delta / dt / CPU_COUNT * 100;
      item.memMB += r.ws / 1048576;
      item.cnt++;
      if (r.sys) item.sysCnt++;
      if (r.win) item.winCnt++;
    }
    const list = Array.from(agg.values())
      .filter(x => x.memMB >= 8 && !SYSTEM_PROCS.has(x.name.toLowerCase()))
      .map(x => {
        // 把该名字下所有 pid 的 GPU 加总（同一应用多进程时）
        let gpu = 0;
        for (const r of rows) {
          if (r.name === x.name && gpuByPid.has(r.id)) gpu += gpuByPid.get(r.id);
        }
        return {
          name: x.name,
          cpu: Math.round(x.cpu * 10) / 10,
          memMB: Math.round(x.memMB),
          gpu: Math.round(Math.min(gpu, 100) * 10) / 10,
          sys: x.sysCnt >= x.cnt,
          win: x.winCnt > 0,          // 全部实例都在 C:\Windows 下 → Windows 自带
          icon: procIcons.get(x.name) || null
        };
      });
    list.sort((a, b) => b.cpu - a.cpu || b.memMB - a.memMB);
    // 只保留能拿到图标的（= 有 exe 的可见程序），纯后台服务/系统进程不显示
    // 全部进程模式：用户程序和系统进程交替排列，否则系统进程都排到最后、画面上看不到
    const usersL = list.filter(x => !x.sys);
    const sysL = list.filter(x => x.sys);
    const woven = [];
    for (let ui = 0, si2 = 0; woven.length < 90 && (ui < usersL.length || si2 < sysL.length);) {
      if (ui < usersL.length) woven.push(usersL[ui++]);
      if (si2 < sysL.length && woven.length < 90) woven.push(sysL[si2++]);
    }
    procAll = woven;
    procTop = list.filter(x => x.win && !HELPER_PROCS.has(x.name.toLowerCase())).slice(0, 90);   // 仅用户自己装的软件
    procCount = rows.length;
  }
  procPrevCpu = new Map(rows.map(r => [r.id, r.cpuSec]));
  procAt = now;
}

function parseGpuLine(payload) {
  gpuByPid.clear();
  for (const part of payload.split(';')) {
    const f = part.split('|');
    if (f.length < 2) continue;
    const pid = Number(f[0]);
    const v = Number(f[1]);
    if (!pid || !isFinite(v)) continue;
    gpuByPid.set(pid, (gpuByPid.get(pid) || 0) + v);
  }
}

function parseIconLine(payload) {
  const bar = payload.indexOf('|');
  if (bar <= 0) return;
  const name = payload.slice(0, bar);
  const b64 = payload.slice(bar + 1);
  if (!name || b64.length < 40) return;
  procIcons.set(name, 'data:image/png;base64,' + b64);
  if (procTop) {
    for (const t of procTop) if (t.name === name) t.icon = procIcons.get(name);
  }
}

function startProcPoller() {
  if (process.platform !== 'win32') return;
  if (procPs) return;
  // 注意：powershell 的 `-Command -` 会一直等 stdin 结束，所以脚本要作为参数直接传进去
  const script = [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    'Add-Type -AssemblyName System.Drawing',
    '$icons = @{}',
    '$i = 0',
    'while ($true) {',
    '  try {',
    '    $parts = @()',
    '    foreach ($p in Get-Process) {',
    '      $sys = 1',
    '      try { if ($p.Path -and ($p.Path -notlike "C:\Windows\*")) { $sys = 0 } } catch { $sys = 1 }',
    '      $mw = 0',
    '      try { if ($p.MainWindowHandle -ne 0) { $mw = 1 } } catch { $mw = 0 }',
    '      $parts += ("$($p.Id)|$($p.ProcessName)|$([int64]$p.CPU)|$([int64]$p.WorkingSet64)|$sys|$mw")',
    '    }',
    '    $s = $parts -join ";"',
    '    [Console]::Out.WriteLine("##" + $s)',
    '    $added = 0',
    '    $want = 200',
    '    if ($i -gt 0) { $want = 10 }',
    '    foreach ($p in (Get-Process | Sort-Object WorkingSet64 -Descending)) {',
    '      if ($added -ge $want) { break }',
    '      $n = $p.ProcessName',
    '      if (-not $icons.ContainsKey($n)) {',
    '        try {',
    '          $path = $p.Path',
    '          if ($path) {',
    '            $ico = [System.Drawing.Icon]::ExtractAssociatedIcon($path)',
    '            if ($ico) {',
    '              $bmp = $ico.ToBitmap()',
    '              $ms = New-Object System.IO.MemoryStream',
    '              $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)',
    '              $icons[$n] = [Convert]::ToBase64String($ms.ToArray())',
    '              $added++',
    '              $ms.Dispose(); $bmp.Dispose(); $ico.Dispose()',
    '            }',
    '          }',
    '        } catch { }',
    '      }',
    '    }',
    '    if ($added -gt 0 -or $i -eq 0) {',
    '      foreach ($k in @($icons.Keys)) { [Console]::Out.WriteLine("@@$k|$($icons[$k])") }',
    '    }',
    '    if (($i % 3) -eq 0) {',
    '      try {',
    '        $gp = @()',
    '        $cs = Get-Counter "\\GPU Engine(*)\\Utilization Percentage" -ErrorAction SilentlyContinue',
    '        foreach ($smp in $cs.CounterSamples) {',
    '          if ($smp.InstanceName -match "pid_(\d+)") {',
    '            $gp += ("$([int]$Matches[1])|" + [math]::Round($smp.CookedValue, 1))',
    '          }',
    '        }',
    '        [Console]::Out.WriteLine(\'$$\' + ($gp -join ";"))',
    '      } catch { }',
    '    }',
    '  } catch { }',
    '  Start-Sleep -Milliseconds 2000',
    '  $i++',
    '}'
  ].join('\n');
  try {
    procPs = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (err) {
    log('WARN', 'process poller: ' + err.message);
    procPs = null;
    return;
  }
  procPs.on('error', (err) => {
    log('WARN', 'process poller error: ' + err.message + '（进程列表将不可用）');
    procPs = null;
  });
  procPs.on('exit', () => { procPs = null; });
  procPs.stdout.setEncoding('utf8');
  procPs.stdout.on('data', (chunk) => {
    procBuf += chunk;
    let idx;
    while ((idx = procBuf.indexOf('\n')) >= 0) {
      const line = procBuf.slice(0, idx).trim();
      procBuf = procBuf.slice(idx + 1);
      if (line.startsWith('##')) {
        try { parseProcLine(line.slice(2)); } catch (err) { /* ignore */ }
      } else if (line.startsWith('@@')) {
        try { parseIconLine(line.slice(2)); } catch (err) { /* ignore */ }
      } else if (line.startsWith('$$')) {
        try { parseGpuLine(line.slice(2)); } catch (err) { /* ignore */ }
      }
    }
    if (procBuf.length > 2000000) procBuf = '';
  });
  log('INFO', 'process poller started (powershell, 2s)');

  // 子进程死了就定期重开
  clearInterval(procTimer);
  procTimer = setInterval(() => { if (!procPs) { log('INFO', 'restarting process poller'); startProcPoller(); } }, 30000);
  if (procTimer.unref) procTimer.unref();
}

/* 每个进程的 GPU 占用：GPU Engine 计数器有 600+ 实例、一次采样要 ~1 秒，
   所以单独开一个低频任务（每 12 秒跑一次一次性 powershell），不拖慢 2 秒的进程循环。 */
function startGpuPoller() {
  if (process.platform !== 'win32') return;
  const script = [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    'try {',
    '  $parts = @()',
    '  $cs = Get-Counter "\\GPU Engine(*)\\Utilization Percentage" -ErrorAction Stop',
    '  foreach ($smp in $cs.CounterSamples) {',
    '    if ($smp.InstanceName -match "pid_(\d+)") {',
    '      $pp = [int]$Matches[1]',
    '      $parts += ("$pp|" + [math]::Round($smp.CookedValue, 1))',
    '    }',
    '  }',
    '  Write-Output ("##GPU##" + ($parts -join ";"))',
    '} catch { Write-Output ("##ERR##" + $_.Exception.Message) }'
  ].join('\n');
  const run = () => {
    let ps;
    try {
      ps = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (err) { return; }
    let out = '';
    ps.stdout.setEncoding('utf8');
    ps.stdout.on('data', (c) => { out += c; });
    ps.on('close', () => {
      if (out.indexOf('##ERR##') >= 0) {
        log('WARN', 'gpu counter failed: ' + out.slice(out.indexOf('##ERR##') + 7).trim().slice(0, 160));
        return;
      }
      const at = out.indexOf('##GPU##');
      if (at < 0) { log('WARN', 'gpu sample: marker missing (out=' + out.length + ')'); return; }
      const payload = out.slice(at + 7).trim();
      try { parseGpuLine(payload); } catch (err) { /* ignore */ }
    });
    ps.on('error', () => { /* ignore */ });
  };
  setTimeout(run, 3000);
  const t = setInterval(run, 12000);
  if (t.unref) t.unref();
  log('INFO', 'gpu poller started (12s, one-shot)');
}

/* ------------------------------------------------------- deepseek sessions */

const sessionCache = new Map();   // file -> { size, mtimeMs, data }
const rateSamples = [];           // [{ t, total }]
let lastRateFile = null;

/** Recursively collect session files. Never throws (dangling dirs exist). */
function walkSessions(dir, out, depth) {
  out = out || [];
  depth = depth || 0;
  if (depth > 4) return out;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    try {
      if (e.isDirectory()) { walkSessions(full, out, depth + 1); continue; }
      if (!e.isFile()) continue;
      if (!/^session.*\.(jsonl(\.zstd)?|zst)$/i.test(e.name)) continue;
      const st = fs.statSync(full);
      out.push({ file: full, size: st.size, mtimeMs: st.mtimeMs, sessionDir: path.dirname(full) });
    } catch (_) { /* skip unreadable / dangling entries */ }
  }
  return out;
}

function unescapeJsonString(raw) {
  try { return JSON.parse('"' + raw + '"'); } catch (_) { return raw; }
}

/** Parse one session file into aggregate stats. Throws on read/decompress errors. */
function parseSessionFile(entry) {
  const cached = sessionCache.get(entry.file);
  if (cached && cached.size === entry.size && cached.mtimeMs === entry.mtimeMs) return cached.data;

  const buf = fs.readFileSync(entry.file);
  let text;
  if (/\.(zstd|zst)$/i.test(entry.file)) {
    if (typeof zlib.zstdDecompressSync !== 'function') {
      throw new Error('this node build has no zlib.zstdDecompressSync (need Node >= 22.15)');
    }
    text = zlib.zstdDecompressSync(buf).toString('utf8');
  } else {
    text = buf.toString('utf8');
  }

  const d = {
    sessionId: null,
    title: null,
    model: null,
    provider: null,
    startedAt: null,
    tokensTotal: 0,        // sum of usage.totalTokens (input+output+cacheRead+cacheWrite)
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    contextTokens: 0,      // last step's totalTokens (current context size)
    toolCalls: 0,
    messages: 0,
    userMessages: 0,
    assistantMessages: 0,
    turns: 0,
    steps: 0,
    jobsRunning: 0,
    lastEvent: null,
    lastEventType: null,
    lastEventAt: null,
    lastActivityAt: entry.mtimeMs || null
  };

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Fast type extraction: every event starts with {"type":"<name>",...
    const ti = line.indexOf('"type":"');
    if (ti < 0) continue;
    const te = line.indexOf('"', ti + 8);
    if (te < 0) continue;
    const type = line.slice(ti + 8, te);

    // Envelope time (the first "time":N in the line belongs to the event itself)
    let time = 0;
    const tm = /"time":(\d{10,})/.exec(line);
    if (tm) time = Number(tm[1]);

    switch (type) {
      case 'session': {
        const m = /"id":"([^"]+)"/.exec(line);
        if (m) d.sessionId = m[1];
        const c = /"createdAt":(\d{10,})/.exec(line);
        if (c) d.startedAt = Number(c[1]);
        break;
      }
      case 'model/selection': {
        const m = /"provider":"([^"]*)","model":"([^"]*)"/.exec(line);
        if (m) { d.provider = m[1]; d.model = m[2]; }
        break;
      }
      case 'session/title': {
        const m = /"title":("(?:[^"\\]|\\.)*")/.exec(line);
        if (m) d.title = unescapeJsonString(m[1].slice(1, -1));
        break;
      }
      case 'user/message': d.userMessages++; d.messages++; break;
      case 'assistant/message': {
        d.assistantMessages++; d.messages++;
        const u = line.indexOf('"usage":{');
        if (u >= 0) {
          const end = line.indexOf('}', u + 9);
          if (end > u) {
            const usage = {};
            for (const part of line.slice(u + 9, end).split(',')) {
              const c = part.indexOf(':');
              if (c < 0) continue;
              const v = parseInt(part.slice(c + 1).replace(/"/g, ''), 10);
              if (isFinite(v)) usage[part.slice(0, c).replace(/"/g, '')] = v;
            }
            const it = usage.inputTokens || 0;
            const ot = usage.outputTokens || 0;
            const cr = usage.cacheReadTokens || 0;
            const tt = typeof usage.totalTokens === 'number' ? usage.totalTokens : it + ot + cr + (usage.cacheWriteTokens || 0);
            d.inputTokens += it;
            d.outputTokens += ot;
            d.cacheReadTokens += cr;
            d.tokensTotal += tt;
            d.contextTokens = tt;
          }
        }
        break;
      }
      case 'tool/call': {
        d.toolCalls++;
        const m = /"name":"([^"]+)"/.exec(line);
        d.lastEvent = 'tool/call · ' + (m ? m[1] : '?');
        d.lastEventType = type;
        d.lastEventAt = time || null;
        break;
      }
      case 'turn/start': d.turns++; break;
      case 'step/start': d.steps++; break;
      case 'job/registered': d.jobsRunning++; break;
      case 'job/settled': d.jobsRunning = Math.max(0, d.jobsRunning - 1); break;
      default: break;
    }

    if (time && (!d.lastEventAt || time >= d.lastEventAt) && type !== 'tool/call') {
      d.lastEventAt = time;
    }
    if (time && !d.lastEventType) { d.lastEventType = type; d.lastEvent = type; }
  }

  if (!d.lastEventType && lines.length) {
    const li = lines[lines.length - 1];
    const m = /"type":"([^"]+)"/.exec(li);
    if (m) { d.lastEventType = m[1]; d.lastEvent = m[1]; }
  } else if (d.lastEventType !== 'tool/call' && d.lastEventType) {
    d.lastEvent = d.lastEventType;
  }

  sessionCache.set(entry.file, { size: entry.size, mtimeMs: entry.mtimeMs, data: d });
  return d;
}

/** tokens/s over the trailing RATE_WINDOW_MS, derived from cumulative token deltas. */
function updateTokenRate(file, total, output, now) {
  if (lastRateFile !== file) { rateSamples.length = 0; lastRateFile = file; }
  const last = rateSamples[rateSamples.length - 1];
  if (!last || last.total !== total) {
    if (last && total < last.total) rateSamples.length = 0;   // file replaced -> restart
    rateSamples.push({ t: now, total, output });
  }
  while (rateSamples.length > 1 && now - rateSamples[0].t > RATE_WINDOW_MS) rateSamples.shift();
  if (rateSamples.length < 2) return { tokensPerSec: 0, outputTokensPerSec: 0, windowSec: 0 };
  const first = rateSamples[0];
  const spanSec = (now - first.t) / 1000;
  if (spanSec < 0.5) return { tokensPerSec: 0, outputTokensPerSec: 0, windowSec: round(spanSec, 1) };
  return {
    tokensPerSec: round(Math.max(0, (total - first.total) / spanSec), 2),
    outputTokensPerSec: round(Math.max(0, (output - first.output) / spanSec), 2),
    windowSec: round(spanSec, 1)
  };
}

/** Build the whole `ai` block. Returns nulls + notes when data is unavailable. */
function sampleAi(now) {
  const ai = {
    tokensTotal: null,
    tokensPerSec: null,
    toolCalls: null,
    messages: null,
    sessions: null,
    activeAgents: null,
    model: null,
    lastEvent: null,
    sessionTitle: null,
    // --- extras ---
    outputTokensPerSec: null,
    cacheHitRate: null,
    provider: null,
    sessionId: null,
    sessionFile: null,
    sessionUpdatedAt: null,
    lastEventType: null,
    lastEventAgeSec: null,
    inputTokens: null,
    outputTokens: null,
    cacheReadTokens: null,
    contextTokens: null,
    turns: null,
    steps: null,
    jobsRunning: null,
    tokensWindowSec: null,
    unavailable: []
  };

  const files = walkSessions(SESSIONS_DIR);
  if (!files.length) {
    for (const k of ['tokensTotal', 'tokensPerSec', 'toolCalls', 'messages', 'sessions',
      'activeAgents', 'model', 'lastEvent', 'sessionTitle']) ai.unavailable.push(k);
    ai.note = 'no session files found under ' + SESSIONS_DIR;
    return ai;
  }

  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  ai.sessions = files.length;
  ai.activeAgents = files.filter(f => now - f.mtimeMs < ACTIVE_WINDOW_MS).length;

  const current = files[0];
  ai.sessionFile = current.file;
  ai.sessionUpdatedAt = Math.round(current.mtimeMs);

  let d;
  try {
    d = parseSessionFile(current);
  } catch (err) {
    for (const k of ['tokensTotal', 'tokensPerSec', 'toolCalls', 'messages', 'model', 'lastEvent', 'sessionTitle']) ai.unavailable.push(k);
    ai.note = 'session parse failed: ' + err.message;
    return ai;
  }

  ai.tokensTotal = d.tokensTotal;
  ai.toolCalls = d.toolCalls;
  ai.messages = d.messages;
  ai.model = d.model;
  ai.provider = d.provider;
  ai.sessionId = d.sessionId;
  ai.sessionTitle = d.title;
  ai.lastEvent = d.lastEvent;
  ai.lastEventType = d.lastEventType;
  ai.lastEventAgeSec = d.lastEventAt ? Math.max(0, Math.round((now - d.lastEventAt) / 1000)) : null;
  ai.inputTokens = d.inputTokens;
  ai.outputTokens = d.outputTokens;
  ai.cacheReadTokens = d.cacheReadTokens;
  ai.contextTokens = d.contextTokens;
  // 缓存命中率 = cacheRead / (cacheRead + input)，用于驱动画面上的细线亮度
  const hitDenom = d.cacheReadTokens + d.inputTokens;
  ai.cacheHitRate = hitDenom > 0 ? round(100 * d.cacheReadTokens / hitDenom, 1) : null;
  ai.turns = d.turns;
  ai.steps = d.steps;
  ai.jobsRunning = d.jobsRunning;

  const rate = updateTokenRate(current.file, d.tokensTotal, d.outputTokens, now);
  ai.tokensPerSec = rate.tokensPerSec;
  ai.outputTokensPerSec = rate.outputTokensPerSec;
  ai.tokensWindowSec = rate.windowSec;

  for (const k of ['tokensTotal', 'tokensPerSec', 'toolCalls', 'messages', 'sessions',
    'activeAgents', 'model', 'lastEvent', 'sessionTitle']) {
    if (ai[k] === null || ai[k] === undefined) ai.unavailable.push(k);
  }
  if (ai.unavailable.length === 0) delete ai.unavailable;
  return ai;
}

/* ------------------------------------------------------------------ snapshot */

const startedAt = Date.now();
const CPU_COUNT = os.cpus().length;
const CPU_NAME = (os.cpus()[0] && os.cpus()[0].model || '').replace(/\s+/g, ' ').trim();
let latestJson = '{}';
let latestObj = null;

function buildSnapshot() {
  const now = Date.now();
  const cpuSample = sampleCpu();
  const ram = sampleRam();
  const ai = sampleAi(now);

  const snap = {
    ts: now,
    tsIso: new Date(now).toISOString(),
    link: true,
    cpu: cpuSample ? cpuSample.pct : (latestObj ? latestObj.cpu : null),
    cpuCores: cpuSample ? cpuSample.cores : (latestObj ? latestObj.cpuCores : null),
    cpuName: CPU_NAME,
    cpuCount: CPU_COUNT,
    ram: ram ? ram.usedPct : null,
    net: (netStat.ok && netStat.rxPerSec !== null)
      ? { rxPerSec: netStat.rxPerSec, txPerSec: netStat.txPerSec, totalMB: netStat.totalMB }
      : null,
    ramDetail: ram,
    gpu: gpu.value,
    top: procTop,
    topAll: procAll,
    procCount: procCount,
    uptimeSec: Math.round((now - startedAt) / 1000),
    ai: ai,
    nulls: [],
    server: {
      version: VERSION,
      pid: process.pid,
      port: PORT,
      startedAt: Math.round(startedAt),
      node: process.version,
      host: os.hostname(),
      platform: process.platform,
      arch: process.arch,
      cores: os.cpus().length,
      sessionsDir: SESSIONS_DIR
    }
  };

  for (const k of ['cpu', 'ram', 'gpu']) if (snap[k] === null || snap[k] === undefined) snap.nulls.push(k);
  for (const [k, v] of Object.entries(ai)) {
    if (v === null || v === undefined) snap.nulls.push('ai.' + k);
  }
  latestObj = snap;
  latestJson = JSON.stringify(snap);
  return snap;
}

function refresh() {
  try {
    buildSnapshot();
  } catch (err) {
    log('ERROR', 'refresh failed: ' + (err && err.stack || err));
  }
}

/* --------------------------------------------------------------- http layer */

function send(res, status, body, type, extra) {
  const headers = Object.assign({
    'Content-Type': type,
    'Access-Control-Allow-Origin': (res && res.__cors) || 'null',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Private-Network': 'false',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Vary': 'Origin',
    'Content-Length': Buffer.byteLength(body)
  }, extra || {});
  res.writeHead(status, headers);
  res.end(body);
}

let requestCount = 0;
let lastRequestLog = 0;

const server = http.createServer((req, res) => {
  requestCount++;
  const now = Date.now();
  res.__cors = CORS_ORIGIN(req);
  if (now - lastRequestLog > 120000) {
    lastRequestLog = now;
    log('INFO', `requests: ${requestCount} total (${req.method} ${req.url} from ${req.headers.origin || 'null'})`);
  }

  try {
    let url;
    try { url = new URL(req.url, 'http://127.0.0.1'); }
    catch (_) { return send(res, 400, '{"error":"bad url"}', 'application/json; charset=utf-8'); }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': (res && res.__cors) || 'null',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Private-Network': 'false',
        'Access-Control-Max-Age': '86400',
        'Content-Length': '0'
      });
      return res.end();
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return send(res, 405, '{"error":"method not allowed"}', 'application/json; charset=utf-8',
        { 'Allow': 'GET, HEAD, OPTIONS' });
    }

    if (url.pathname === '/stats' || url.pathname === '/stats/') {
      const cb = url.searchParams.get('callback');
      if (cb) {
        if (!/^[A-Za-z_$][\w$.]{0,63}$/.test(cb)) {
          return send(res, 400, '{"error":"bad callback"}', 'application/json; charset=utf-8');
        }
        return send(res, 200, cb + '(' + latestJson + ');', 'application/javascript; charset=utf-8');
      }
      return send(res, 200, latestJson, 'application/json; charset=utf-8');
    }

    if (url.pathname === '/health') {
      return send(res, 200, JSON.stringify({ ok: true, ts: Date.now(), uptimeSec: Math.round(process.uptime()) }),
        'application/json; charset=utf-8');
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      const html = `<!doctype html><meta charset="utf-8"><title>HALOFLUX · AI LINK</title>
<body style="background:#08090b;color:#98e0cf;font:12px ui-monospace,Consolas,monospace;padding:24px">
<h1 style="letter-spacing:2px;color:#f4f5f7">HALOFLUX · AI LINK</h1>
<p>local telemetry service v${VERSION} · uptime ${Math.round(process.uptime())}s</p>
<p><a style="color:#98e0cf" href="/stats">/stats</a> · <a style="color:#98e0cf" href="/health">/health</a>
 · 预览：<a style="color:#98e0cf" href="http://${HOST}:${STATIC_PORT}/index.html">http://${HOST}:${STATIC_PORT}/index.html</a></p>
<p style="color:#6b6f78">Noncommercial fan modification of HALOFLUX by Ryder191. PolyForm Noncommercial 1.0.0.</p>
</body>`;
      return send(res, 200, html, 'text/html; charset=utf-8');
    }

    return send(res, 404, '{"error":"not found"}', 'application/json; charset=utf-8');
  } catch (err) {
    log('ERROR', 'request handler: ' + (err && err.stack || err));
    try { send(res, 500, '{"error":"internal"}', 'application/json; charset=utf-8'); } catch (_) { /* ignore */ }
  }
});

/* ----------------------------------------------------- static preview server
   Same process, second port: serves this folder over HTTP so the wallpaper can
   be previewed in a normal browser at http://127.0.0.1:8738/index.html
   (file:// also works — this is only a convenience for quick previews). */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function CORS_ORIGIN(req) {
  const o = (req && req.headers && req.headers.origin) || '';
  if (!o) return 'null';
  if (o === 'null') return 'null';                                   // file:// 壁纸端
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(o)) return o; // 本机预览
  return 'null';                                                     // 其它站点一律不放行
}

function startStaticServer() {
  const srv = http.createServer((req, res) => {
    let filePath = '/index.html';
    try {
      let p = decodeURIComponent(String(req.url || '/').split('?')[0]);
      if (!p || p === '/') p = '/index.html';
      filePath = p;
      if (/\.(token|log|pid)$/i.test(p)) { res.writeHead(403); return res.end('forbidden'); }
      const full = path.normalize(path.join(BASE_DIR, p));
      if (full !== BASE_DIR && full.indexOf(BASE_DIR + path.sep) !== 0) {
        res.writeHead(403); return res.end('forbidden');
      }
      fs.stat(full, (err, st) => {
        if (err || !st.isFile()) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end('404 ' + filePath);
        }
        const ext = path.extname(full).toLowerCase();
        const type = MIME[ext] || 'application/octet-stream';
        const range = req.headers.range;
        const head = {
          'Content-Type': type,
          'Access-Control-Allow-Origin': (res && res.__cors) || 'null',
          'Cache-Control': 'no-cache',
          'Accept-Ranges': 'bytes'
        };
        if (range) {
          const m = /bytes=(\d*)-(\d*)/.exec(range);
          if (m) {
            let start = m[1] ? parseInt(m[1], 10) : 0;
            let end = m[2] ? parseInt(m[2], 10) : st.size - 1;
            if (!isFinite(start) || start < 0) start = 0;
            if (!isFinite(end) || end >= st.size) end = st.size - 1;
            if (start > end) { res.writeHead(416); return res.end(); }
            res.writeHead(206, Object.assign({}, head, {
              'Content-Range': `bytes ${start}-${end}/${st.size}`,
              'Content-Length': end - start + 1
            }));
            fs.createReadStream(full, { start, end }).pipe(res);
            return;
          }
        }
        res.writeHead(200, Object.assign({}, head, { 'Content-Length': st.size }));
        fs.createReadStream(full).pipe(res);
      });
    } catch (err) {
      try { res.writeHead(500); res.end('error'); } catch (_) { /* ignore */ }
    }
  });
  srv.on('error', (err) => {
    if (err.code === 'EADDRINUSE') log('WARN', `static preview port ${STATIC_PORT} already in use — preview disabled`);
    else log('WARN', 'static preview: ' + err.message);
  });
  srv.listen(STATIC_PORT, HOST, () => {
    log('INFO', `static preview: http://${HOST}:${STATIC_PORT}/index.html`);
  });
  return srv;
}

/* -------------------------------------------------------------------- boot */

function main() {
  // CPU needs a baseline sample before the first meaningful number.
  cpuPrev = readCpuTimes();

  if (ONCE) {
    // give the CPU delta + nvidia-smi probe a moment, then print one snapshot
    gpuAvailable();
    setTimeout(() => {
      refresh();
      process.stdout.write(latestJson + '\n');
    }, 900);
    return;
  }

  refresh();

  try { fs.writeFileSync(PID_FILE, String(process.pid)); } catch (err) { log('WARN', 'cannot write pid file: ' + err.message); }

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      log('ERROR', `port ${PORT} already in use — service already running? (${err.message})`);
      process.exit(3);
    }
    log('ERROR', 'server error: ' + (err && err.stack || err));
    process.exit(4);
  });

  server.listen(PORT, HOST, () => {
    log('INFO', `HALOFLUX AI LINK service v${VERSION} listening on http://${HOST}:${PORT}/stats (node ${process.version}, pid ${process.pid})`);
    log('INFO', `sessions dir: ${SESSIONS_DIR}`);
    if (process.stdout.isTTY) {
      console.log(`HALOFLUX · AI LINK  ->  http://${HOST}:${PORT}/stats   (Ctrl+C to stop)`);
      console.log(`preview             ->  http://${HOST}:${STATIC_PORT}/index.html`);
    }
    gpuAvailable();
  });

  startStaticServer();

  setInterval(refresh, REFRESH_MS);
  setInterval(pollGpu, 2000);
  setInterval(pollNet, 2000);
  pollNet();
  startProcPoller();

  // heartbeats so server.log is useful when someone reports "it stopped"
  setInterval(() => {
    const a = latestObj && latestObj.ai;
    log('INFO', `heartbeat up=${Math.round(process.uptime())}s cpu=${latestObj ? latestObj.cpu : '?'}% ` +
      `gpu=${gpu.value ? gpu.value.utilization + '%' : 'null'} ai.tokens=${a ? a.tokensTotal : '?'} ` +
      `tps=${a ? a.tokensPerSec : '?'} req=${requestCount}`);
  }, 60000);

  const shutdown = (sig) => {
    log('INFO', `shutting down (${sig})`);
    try { fs.unlinkSync(PID_FILE); } catch (_) { /* ignore */ }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 800).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('exit', () => { try { fs.unlinkSync(PID_FILE); } catch (_) { /* ignore */ } });

  process.on('uncaughtException', (err) => log('ERROR', 'uncaughtException: ' + (err && err.stack || err)));
  process.on('unhandledRejection', (err) => log('ERROR', 'unhandledRejection: ' + (err && err.stack || err)));
}

main();
