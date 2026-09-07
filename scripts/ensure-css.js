const fs = require('fs');
const path = require('path');

function copyFolderSync(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from).forEach(element => {
    const stat = fs.lstatSync(path.join(from, element));
    if (stat.isFile()) {
      fs.copyFileSync(path.join(from, element), path.join(to, element));
    } else if (stat.isDirectory()) {
      copyFolderSync(path.join(from, element), path.join(to, element));
    }
  });
}

try {
  const cssDir = path.join(process.cwd(), '.next', 'static', 'css');
  const targetDir = path.join(cssDir, 'app');

  if (fs.existsSync(cssDir)) {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const files = fs.readdirSync(cssDir).filter(f => f.endsWith('.css'));
    if (files.length > 0) {
      const sourceCss = path.join(cssDir, files[0]);
      const targetCss = path.join(targetDir, 'layout.css');
      fs.copyFileSync(sourceCss, targetCss);
      console.log(`[ensure-css] Mirrored ${files[0]} -> app/layout.css`);
    }
  }

  // Handle standalone output if present
  const standaloneDir = path.join(process.cwd(), '.next', 'standalone');
  if (fs.existsSync(standaloneDir)) {
    const standaloneStatic = path.join(standaloneDir, '.next', 'static');
    const staticDir = path.join(process.cwd(), '.next', 'static');
    copyFolderSync(staticDir, standaloneStatic);

    const publicDir = path.join(process.cwd(), 'public');
    const standalonePublic = path.join(standaloneDir, 'public');
    copyFolderSync(publicDir, standalonePublic);
    console.log('[ensure-css] Prepared standalone .next/static and public assets');
  }
} catch (err) {
  console.warn('[ensure-css] Warning during CSS sync:', err.message);
}
