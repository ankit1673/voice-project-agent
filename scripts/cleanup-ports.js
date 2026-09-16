const { execSync } = require('child_process');

const ports = [5000, 5173, 5174, 5175];

for (const port of ports) {
  try {
    const command = `powershell -NoProfile -Command "$p = Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue; if ($p) { foreach ($x in $p) { if ($x.OwningProcess) { Stop-Process -Id $x.OwningProcess -Force -ErrorAction SilentlyContinue } } }"`;
    execSync(command, { stdio: 'ignore' });
  } catch (error) {
    // Ignore failures from ports that aren't in use.
  }
}

console.log('Cleared stale processes on common app ports.');
