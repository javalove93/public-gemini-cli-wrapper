const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Register host file browsing API for the master.js landing page.
 * @param {object} app - Express app instance
 */
function registerHostFileApi(app) {
    app.get('/api/host/env', (req, res) => {
        try {
            res.json({
                cwd: process.cwd(),
                home: os.homedir()
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/host/files', (req, res) => {
        let dir = req.query.dir || '/';
        dir = path.resolve(dir);
        try {
            const items = fs.readdirSync(dir, { withFileTypes: true });
            const list = [];
            
            for (const item of items) {
                // Ignore hidden files/folders
                if (item.name.startsWith('.')) continue;

                let isDir = item.isDirectory();
                let isSymlink = item.isSymbolicLink();

                // If it's a symlink, resolve it to see if the target is a directory
                if (isSymlink) {
                    try {
                        const targetStat = fs.statSync(path.join(dir, item.name));
                        isDir = targetStat.isDirectory();
                    } catch (err) {
                        // Broken symlink or permission denied, skip
                        continue;
                    }
                }

                if (isDir) {
                    list.push({
                        name: item.name,
                        isDirectory: true,
                        isSymlink: isSymlink,
                        path: path.join(dir, item.name)
                    });
                }
            }
            
            // Add parent directory link
            if (dir !== '/' && dir !== path.parse(dir).root) {
                list.unshift({
                    name: '..',
                    isDirectory: true,
                    isSymlink: false,
                    path: path.resolve(dir, '..')
                });
            }
            res.json({ dir, list });
        } catch (e) {
            console.error('[HOST_FILE_API] Error reading directory:', e.message);
            res.status(500).json({ error: e.message });
        }
    });
}

module.exports = { registerHostFileApi };
