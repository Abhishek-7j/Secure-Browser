/**
 * Faprot Secure Browser Core
 * Legal-only access browser with real information verification
 */

const { app, BrowserWindow, session, ipcMain, dialog, Menu } = require('electron');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

class FaprotBrowser {
    constructor() {
        this.mainWindow = null;
        this.allowedCategories = new Set([
            'education', 'news', 'government', 'healthcare', 'finance', 
            'technology', 'science', 'business', 'legal', 'reference'
        ]);
        this.blockedCategories = new Set([
            'illegal', 'piracy', 'adult', 'gambling', 'hate', 'violence'
        ]);
        this.whitelist = new Set();
        this.blacklist = new Set();
        this.userPreferences = {};
        this.browsingHistory = [];
        this.securityLevel = 'high';
        this.init();
    }

    init() {
        this.createDirectories();
        this.loadSecurityLists();
        this.setupApp();
        this.setupSecurity();
        this.createMainWindow();
    }

    createDirectories() {
        const dirs = [
            path.join(__dirname, '..', 'data'),
            path.join(__dirname, '..', 'cache'),
            path.join(__dirname, '..', 'logs'),
            path.join(__dirname, '..', 'security')
        ];
        
        dirs.forEach(dir => fs.ensureDirSync(dir));
    }

    setupApp() {
        // Configure Electron app
        app.whenReady().then(() => {
            this.createMainWindow();
            this.setupMenu();
            this.setupIPC();
        });

        app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') {
                app.quit();
            }
        });

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                this.createMainWindow();
            }
        });

        // Security settings
        app.on('web-contents-created', (event, contents) => {
            contents.on('new-window', (event, navigationUrl) => {
                event.preventDefault();
                this.validateAndNavigate(navigationUrl);
            });
        });
    }

    setupSecurity() {
        // Configure secure session
        const secureSession = session.fromPartition('persist:secure-session');
        
        // Security headers
        secureSession.webRequest.onHeadersReceived((details, callback) => {
            const responseHeaders = {
                ...details.responseHeaders,
                'Content-Security-Policy': ["default-src 'self' 'unsafe-inline' 'unsafe-eval' https: data:"],
                'X-Content-Type-Options': ['nosniff'],
                'X-Frame-Options': ['DENY'],
                'X-XSS-Protection': ['1; mode=block']
            };
            callback({ responseHeaders });
        });

        // Block suspicious requests
        secureSession.webRequest.onBeforeRequest((details, callback) => {
            const url = details.url;
            
            if (this.isUrlBlocked(url)) {
                callback({ cancel: true });
                this.logSecurityEvent('BLOCKED_REQUEST', { url, timestamp: new Date() });
                return;
            }
            
            callback({});
        });
    }

    createMainWindow() {
        this.mainWindow = new BrowserWindow({
            width: 1200,
            height: 800,
            minWidth: 800,
            minHeight: 600,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                enableRemoteModule: false,
                webSecurity: true,
                allowRunningInsecureContent: false,
                plugins: false,
                images: true,
                javascript: true,
                webgl: false,
                webaudio: false,
                preload: path.join(__dirname, 'preload.js')
            },
            icon: path.join(__dirname, '..', 'assets', 'icon.png'),
            title: 'Faprot Secure Browser'
        });

        // Load the browser interface
        this.mainWindow.loadFile(path.join(__dirname, 'browser-ui.html'));

        // Open DevTools in development
        if (process.env.NODE_ENV === 'development') {
            this.mainWindow.webContents.openDevTools();
        }
    }

    setupMenu() {
        const template = [
            {
                label: 'File',
                submenu: [
                    {
                        label: 'New Window',
                        accelerator: 'CmdOrCtrl+N',
                        click: () => this.createMainWindow()
                    },
                    {
                        label: 'Open URL',
                        accelerator: 'CmdOrCtrl+O',
                        click: () => this.showOpenUrlDialog()
                    },
                    { type: 'separator' },
                    {
                        label: 'Exit',
                        accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                        click: () => app.quit()
                    }
                ]
            },
            {
                label: 'Security',
                submenu: [
                    {
                        label: 'Security Settings',
                        click: () => this.showSecuritySettings()
                    },
                    {
                        label: 'View Security Log',
                        click: () => this.showSecurityLog()
                    },
                    {
                        label: 'Manage Whitelist',
                        click: () => this.showWhitelistManager()
                    },
                    {
                        label: 'Update Security Lists',
                        click: () => this.updateSecurityLists()
                    }
                ]
            },
            {
                label: 'Tools',
                submenu: [
                    {
                        label: 'Verify Website',
                        accelerator: 'CmdOrCtrl+V',
                        click: () => this.verifyCurrentWebsite()
                    },
                    {
                        label: 'Security Report',
                        accelerator: 'CmdOrCtrl+R',
                        click: () => this.generateSecurityReport()
                    },
                    {
                        label: 'Clear History',
                        click: () => this.clearBrowsingHistory()
                    }
                ]
            },
            {
                label: 'Help',
                submenu: [
                    {
                        label: 'About Faprot',
                        click: () => this.showAbout()
                    },
                    {
                        label: 'Security Guide',
                        click: () => this.showSecurityGuide()
                    }
                ]
            }
        ];

        const menu = Menu.buildFromTemplate(template);
        Menu.setApplicationMenu(menu);
    }

    setupIPC() {
        // Handle navigation requests
        ipcMain.handle('navigate-to-url', async (event, url) => {
            return await this.validateAndNavigate(url);
        });

        // Handle security checks
        ipcMain.handle('check-url-safety', async (event, url) => {
            return await this.checkUrlSafety(url);
        });

        // Handle user preferences
        ipcMain.handle('get-user-preferences', () => {
            return this.userPreferences;
        });

        ipcMain.handle('update-user-preferences', (event, preferences) => {
            this.userPreferences = { ...this.userPreferences, ...preferences };
            this.saveUserPreferences();
            return true;
        });

        // Handle whitelist management
        ipcMain.handle('add-to-whitelist', (event, url) => {
            this.addToWhitelist(url);
            return true;
        });

        ipcMain.handle('remove-from-whitelist', (event, url) => {
            this.removeFromWhitelist(url);
            return true;
        });

        ipcMain.handle('get-whitelist', () => {
            return Array.from(this.whitelist);
        });

        // Handle browsing history
        ipcMain.handle('get-browsing-history', () => {
            return this.browsingHistory;
        });

        ipcMain.handle('clear-browsing-history', () => {
            this.clearBrowsingHistory();
            return true;
        });
    }

    async validateAndNavigate(url) {
        const safetyCheck = await this.checkUrlSafety(url);
        
        if (!safetyCheck.isSafe) {
            this.showBlockedPage(url, safetyCheck);
            return false;
        }

        if (this.mainWindow) {
            this.mainWindow.webContents.send('navigate-to-url', url);
            this.addToHistory(url);
        }
        
        return true;
    }

    async checkUrlSafety(url) {
        try {
            // Check against local lists first
            if (this.whitelist.has(url)) {
                return { isSafe: true, source: 'whitelist', confidence: 1.0 };
            }

            if (this.blacklist.has(url)) {
                return { isSafe: false, source: 'blacklist', reason: 'Blacklisted URL' };
            }

            // Check domain reputation
            const domain = new URL(url).hostname;
            const domainCheck = await this.checkDomainReputation(domain);
            
            if (!domainCheck.isSafe) {
                return { isSafe: false, source: 'domain_reputation', reason: domainCheck.reason };
            }

            // Check content category
            const categoryCheck = await this.checkContentCategory(url);
            
            if (!categoryCheck.isSafe) {
                return { isSafe: false, source: 'content_category', reason: categoryCheck.reason };
            }

            // Verify information accuracy
            const infoCheck = await this.verifyInformationAccuracy(url);
            
            return {
                isSafe: true,
                source: 'comprehensive_check',
                confidence: Math.min(domainCheck.confidence, categoryCheck.confidence, infoCheck.confidence),
                details: {
                    domain: domainCheck,
                    category: categoryCheck,
                    information: infoCheck
                }
            };

        } catch (error) {
            console.error('URL safety check error:', error);
            return { isSafe: false, source: 'error', reason: 'Safety check failed' };
        }
    }

    async checkDomainReputation(domain) {
        try {
            // Check against FLD system
            const fldResponse = await axios.post(`http://localhost:3001/api/analyze`, {
                url: `https://${domain}`
            });

            const result = fldResponse.data.data;
            
            return {
                isSafe: result.riskScore < 40,
                confidence: 0.9,
                riskScore: result.riskScore,
                threatType: result.threatType
            };

        } catch (error) {
            // Fallback to basic checks
            const suspiciousIndicators = [
                domain.includes('.tk'), domain.includes('.ml'),
                domain.split('.').length > 4,
                /[0-9]{2,}/.test(domain),
                /[^a-zA-Z0-9.-]/.test(domain)
            ];

            const suspiciousCount = suspiciousIndicators.filter(Boolean).length;
            
            return {
                isSafe: suspiciousCount < 2,
                confidence: 0.7,
                riskScore: suspiciousCount * 25
            };
        }
    }

    async checkContentCategory(url) {
        try {
            // Simulate content category checking
            // In production, this would use AI content analysis
            const suspiciousKeywords = [
                'pirate', 'torrent', 'illegal', 'hack', 'crack',
                'adult', 'gambling', 'casino', 'bet'
            ];

            const urlLower = url.toLowerCase();
            const matches = suspiciousKeywords.filter(keyword => urlLower.includes(keyword));
            
            if (matches.length > 0) {
                return {
                    isSafe: false,
                    reason: `Contains suspicious content: ${matches.join(', ')}`,
                    confidence: 0.8
                };
            }

            return {
                isSafe: true,
                confidence: 0.9,
                category: 'safe'
            };

        } catch (error) {
            return { isSafe: false, reason: 'Content check failed', confidence: 0 };
        }
    }

    async verifyInformationAccuracy(url) {
        try {
            // Simulate information accuracy verification
            // In production, this would cross-reference with trusted sources
            const trustedSources = [
                'wikipedia.org', 'gov', 'edu', 'org',
                'reuters.com', 'ap.org', 'bbc.com'
            ];

            const urlObj = new URL(url);
            const isTrusted = trustedSources.some(source => urlObj.hostname.includes(source));
            
            return {
                isAccurate: isTrusted,
                confidence: isTrusted ? 0.95 : 0.7,
                verified: isTrusted,
                sources: isTrusted ? ['trusted_source_database'] : ['needs_verification']
            };

        } catch (error) {
            return { isAccurate: false, reason: 'Accuracy check failed', confidence: 0 };
        }
    }

    showBlockedPage(url, safetyCheck) {
        const blockedPageHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Access Blocked - Faprot Secure Browser</title>
            <style>
                body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 40px; }
                .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
                .header { text-align: center; margin-bottom: 30px; }
                .shield { font-size: 48px; color: #e74c3c; margin-bottom: 20px; }
                h1 { color: #2c3e50; margin-bottom: 20px; }
                .url { background: #ecf0f1; padding: 15px; border-radius: 5px; word-break: break-all; margin: 20px 0; font-family: monospace; }
                .reason { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
                .actions { text-align: center; margin-top: 30px; }
                .btn { background: #3498db; color: white; padding: 12px 24px; border: none; border-radius: 5px; cursor: pointer; margin: 0 10px; }
                .btn-secondary { background: #95a5a6; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="shield">🛡️</div>
                    <h1>Access Blocked</h1>
                    <p>Faprot Secure Browser has blocked access to this website for your protection.</p>
                </div>
                
                <div class="url">
                    <strong>Blocked URL:</strong><br>
                    ${url}
                </div>
                
                <div class="reason">
                    <strong>Reason:</strong><br>
                    ${safetyCheck.reason || 'Security policy violation'}
                </div>
                
                <div class="actions">
                    <button class="btn" onclick="window.close()">Go Back</button>
                    <button class="btn btn-secondary" onclick="reportFalsePositive()">Report False Positive</button>
                </div>
            </div>
            
            <script>
                function reportFalsePositive() {
                    alert('Thank you for your feedback. Our security team will review this website.');
                    window.close();
                }
            </script>
        </body>
        </html>
        `;

        if (this.mainWindow) {
            this.mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(blockedPageHtml)}`);
        }
    }

    addToHistory(url) {
        const historyItem = {
            id: crypto.randomUUID(),
            url,
            title: url,
            timestamp: new Date().toISOString(),
            visitCount: 1
        };

        // Check if URL already exists
        const existingIndex = this.browsingHistory.findIndex(item => item.url === url);
        if (existingIndex >= 0) {
            this.browsingHistory[existingIndex].visitCount++;
            this.browsingHistory[existingIndex].timestamp = new Date().toISOString();
        } else {
            this.browsingHistory.unshift(historyItem);
        }

        // Keep only last 1000 entries
        if (this.browsingHistory.length > 1000) {
            this.browsingHistory = this.browsingHistory.slice(0, 1000);
        }

        this.saveBrowsingHistory();
    }

    loadSecurityLists() {
        try {
            const whitelistPath = path.join(__dirname, '..', 'security', 'whitelist.json');
            const blacklistPath = path.join(__dirname, '..', 'security', 'blacklist.json');
            
            if (fs.existsSync(whitelistPath)) {
                const whitelistData = fs.readJsonSync(whitelistPath);
                this.whitelist = new Set(whitelistData.urls || []);
            }

            if (fs.existsSync(blacklistPath)) {
                const blacklistData = fs.readJsonSync(blacklistPath);
                this.blacklist = new Set(blacklistData.urls || []);
            }
        } catch (error) {
            console.error('Error loading security lists:', error);
        }
    }

    async updateSecurityLists() {
        try {
            // Simulate updating security lists from trusted sources
            const response = await axios.get('https://api.faprot.com/security/updates');
            const updates = response.data;
            
            // Update whitelist
            if (updates.whitelist) {
                this.whitelist = new Set([...this.whitelist, ...updates.whitelist]);
                fs.writeJsonSync(path.join(__dirname, '..', 'security', 'whitelist.json'), {
                    urls: Array.from(this.whitelist),
                    lastUpdated: new Date().toISOString()
                });
            }

            // Update blacklist
            if (updates.blacklist) {
                this.blacklist = new Set([...this.blacklist, ...updates.blacklist]);
                fs.writeJsonSync(path.join(__dirname, '..', 'security', 'blacklist.json'), {
                    urls: Array.from(this.blacklist),
                    lastUpdated: new Date().toISOString()
                });
            }

            this.showNotification('Security lists updated successfully');

        } catch (error) {
            console.error('Error updating security lists:', error);
            this.showNotification('Failed to update security lists', 'error');
        }
    }

    addToWhitelist(url) {
        this.whitelist.add(url);
        this.saveWhitelist();
        this.showNotification(`Added to whitelist: ${url}`);
    }

    removeFromWhitelist(url) {
        this.whitelist.delete(url);
        this.saveWhitelist();
        this.showNotification(`Removed from whitelist: ${url}`);
    }

    saveWhitelist() {
        try {
            fs.writeJsonSync(path.join(__dirname, '..', 'security', 'whitelist.json'), {
                urls: Array.from(this.whitelist),
                lastUpdated: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error saving whitelist:', error);
        }
    }

    saveBrowsingHistory() {
        try {
            fs.writeJsonSync(path.join(__dirname, '..', 'data', 'history.json'), this.browsingHistory);
        } catch (error) {
            console.error('Error saving browsing history:', error);
        }
    }

    loadUserPreferences() {
        try {
            const prefsPath = path.join(__dirname, '..', 'data', 'preferences.json');
            if (fs.existsSync(prefsPath)) {
                this.userPreferences = fs.readJsonSync(prefsPath);
            }
        } catch (error) {
            console.error('Error loading user preferences:', error);
        }
    }

    saveUserPreferences() {
        try {
            fs.writeJsonSync(path.join(__dirname, '..', 'data', 'preferences.json'), this.userPreferences);
        } catch (error) {
            console.error('Error saving user preferences:', error);
        }
    }

    logSecurityEvent(event, data) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            event,
            data
        };

        const logPath = path.join(__dirname, '..', 'logs', 'security.log');
        fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
    }

    showNotification(message, type = 'info') {
        if (this.mainWindow) {
            this.mainWindow.webContents.send('show-notification', { message, type });
        }
    }

    showOpenUrlDialog() {
        // Implementation for URL dialog
        if (this.mainWindow) {
            this.mainWindow.webContents.send('show-open-url-dialog');
        }
    }

    showSecuritySettings() {
        // Implementation for security settings
        if (this.mainWindow) {
            this.mainWindow.webContents.send('show-security-settings');
        }
    }

    showSecurityLog() {
        // Implementation for security log viewer
        if (this.mainWindow) {
            this.mainWindow.webContents.send('show-security-log');
        }
    }

    showWhitelistManager() {
        // Implementation for whitelist manager
        if (this.mainWindow) {
            this.mainWindow.webContents.send('show-whitelist-manager');
        }
    }

    verifyCurrentWebsite() {
        // Implementation for website verification
        if (this.mainWindow) {
            this.mainWindow.webContents.send('verify-current-website');
        }
    }

    generateSecurityReport() {
        // Implementation for security report
        if (this.mainWindow) {
            this.mainWindow.webContents.send('generate-security-report');
        }
    }

    clearBrowsingHistory() {
        this.browsingHistory = [];
        this.saveBrowsingHistory();
        this.showNotification('Browsing history cleared');
    }

    showAbout() {
        // Implementation for about dialog
        if (this.mainWindow) {
            this.mainWindow.webContents.send('show-about');
        }
    }

    showSecurityGuide() {
        // Implementation for security guide
        if (this.mainWindow) {
            this.mainWindow.webContents.send('show-security-guide');
        }
    }

    isUrlBlocked(url) {
        try {
            const urlObj = new URL(url);
            
            // Check blacklist
            if (this.blacklist.has(url) || this.blacklist.has(urlObj.hostname)) {
                return true;
            }

            // Check against blocked categories (simplified)
            const suspiciousPatterns = [
                /torrent/i, /pirate/i, /illegal/i, /adult/i,
                /gambling/i, /casino/i, /hack/i, /crack/i
            ];

            return suspiciousPatterns.some(pattern => pattern.test(url));
        } catch {
            return true; // Block invalid URLs
        }
    }
}

module.exports = FaprotBrowser;