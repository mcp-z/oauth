import { spawn } from 'child_process';
import { readFileSync } from 'fs';

// Windows Subsystem for Linux reports platform 'linux' but needs the Windows browser.
function isWsl(): boolean {
  if (process.platform !== 'linux') return false;
  if (process.env.WSL_DISTRO_NAME) return true;
  try {
    return readFileSync('/proc/version', 'utf8').toLowerCase().indexOf('microsoft') >= 0;
  } catch (_err) {
    return false;
  }
}

function command(url: string): { file: string; args: string[] } {
  if (process.platform === 'darwin') return { file: 'open', args: [url] };
  if (process.platform === 'win32') return { file: 'cmd', args: ['/c', 'start', '""', url.replace(/&/g, '^&')] };
  // PowerShell reaches the Windows browser from inside WSL, where xdg-open cannot.
  if (isWsl()) return { file: 'powershell.exe', args: ['-NoProfile', '-Command', 'Start-Process', `"${url}"`] };
  return { file: 'xdg-open', args: [url] };
}

// Opens a URL in the default browser. Only http/https: the URL reaches a shell builtin on
// Windows, and the launcher exits before the browser does, so nothing here waits on it.
export default function openUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch (_err) {
      return reject(new Error(`openUrl: not a valid URL: ${url}`));
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return reject(new Error(`openUrl: refusing to open ${parsed.protocol} URL`));

    const { file, args } = command(url);
    const child = spawn(file, args, { detached: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}
