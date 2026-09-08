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
    const staticDir = path.join(process.cwd(), '.next', 'static');
    const publicDir = path.join(process.cwd(), 'public');

    // 1. Mirror directly into .next/standalone
    const standaloneStatic = path.join(standaloneDir, '.next', 'static');
    const standalonePublic = path.join(standaloneDir, 'public');
    copyFolderSync(staticDir, standaloneStatic);
    copyFolderSync(publicDir, standalonePublic);

    // 2. Recursively find any nested directories containing server.js and mirror assets there too
    function findServerDirs(dir) {
      let results = [];
      const list = fs.readdirSync(dir);
      for (const item of list) {
        if (item === '.next' || item === 'node_modules') continue;
        const fullPath = path.join(dir, item);
        const stat = fs.lstatSync(fullPath);
        if (stat.isDirectory()) {
          if (fs.existsSync(path.join(fullPath, 'server.js'))) {
            results.push(fullPath);
          }
          results = results.concat(findServerDirs(fullPath));
        }
      }
      return results;
    }

    const nestedServerDirs = findServerDirs(standaloneDir);
    for (const nestedDir of nestedServerDirs) {
      const nestedStatic = path.join(nestedDir, '.next', 'static');
      const nestedPublic = path.join(nestedDir, 'public');
      copyFolderSync(staticDir, nestedStatic);
      copyFolderSync(publicDir, nestedPublic);
      console.log(`[ensure-css] Mirrored static & public to nested standalone: ${path.relative(process.cwd(), nestedDir)}`);
    }

    console.log('[ensure-css] Prepared standalone .next/static and public assets across all deployment targets');
  }
} catch (err) {
  console.warn('[ensure-css] Warning during CSS sync:', err.message);
}
