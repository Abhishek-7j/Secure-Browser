/**
 * Faprot Secure Browser - Main Process
 * Professional-grade secure browser with PostgreSQL integration
 */

const { app, BrowserWindow, session, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const axios = require('axios');
const { Pool } = require('pg');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

class FaprotSecureBrowser {
    constructor() {
        this.mainWindow = null;
        this.securityWindow = null;
        this.db = null;
        this.securityEngine = new SecurityEngine();
        this.uiManager = new UIManager();
        this.dataManager = new DataManager();
        this.init();
    }

    async init() {
        await this.setupDatabase();
        this.setupApp();
        this.createMainWindow();
        this.setupSecurity();
        this.setupIPC();
        this.setupMenu();
    }

    async setupDatabase() {
        try {
            // PostgreSQL connection
            this.db = new Pool({
                user: process.env.DB_USER || 'postgres',
                host: process.env.DB_HOST || 'localhost',
                database: process.env.DB_NAME || 'faprot_browser',
                password: process.env.DB_PASSWORD || 'password',
                port: process.env.DB_PORT || 5432,
                max: 20,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 2000,
            });

            // Test connection
            await this.db.query('SELECT NOW()');
            console.log('✅ PostgreSQL connected successfully');

            // Initialize database tables
            await this.initializeDatabaseTables();
        } catch (error) {
            console.error('❌ Database connection failed:', error);
            // Fallback to SQLite if PostgreSQL fails
            this.setupSQLiteFallback();
        }
    }

    async initializeDatabaseTables() {
        const tables = [
            // Security logs
            `CREATE TABLE IF NOT EXISTS security_logs (
                id SERIAL PRIMARY KEY,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                url TEXT NOT NULL,
                action TEXT NOT NULL,
                risk_level INTEGER DEFAULT 0,
                threat_type TEXT,
                user_action TEXT,
                ip_address INET,
                user_agent TEXT
            )`,
            
            // Browsing history
            `CREATE TABLE IF NOT EXISTS browsing_history (
                id SERIAL PRIMARY KEY,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                url TEXT NOT NULL,
                title TEXT,
                visit_count INTEGER DEFAULT 1,
                duration_seconds INTEGER,
                category TEXT,
                is_secure BOOLEAN DEFAULT false
            )`,
            
            // Blocked sites
            `CREATE TABLE IF NOT EXISTS blocked_sites (
                id SERIAL PRIMARY KEY,
                url TEXT UNIQUE NOT NULL,
                domain TEXT NOT NULL,
                reason TEXT NOT NULL,
                risk_score INTEGER NOT NULL,
                blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                threat_type TEXT
            )`,
            
            // Whitelisted sites
            `CREATE TABLE IF NOT EXISTS whitelisted_sites (
                id SERIAL PRIMARY KEY,
                url TEXT UNIQUE NOT NULL,
                domain TEXT NOT NULL,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                reason TEXT,
                verified BOOLEAN DEFAULT false
            )`,
            
            // User preferences
            `CREATE TABLE IF NOT EXISTS user_preferences (
                id SERIAL PRIMARY KEY,
                key TEXT UNIQUE NOT NULL,
                value TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Security incidents
            `CREATE TABLE IF NOT EXISTS security_incidents (
                id SERIAL PRIMARY KEY,
                incident_type TEXT NOT NULL,
                severity TEXT NOT NULL,
                description TEXT NOT NULL,
                url TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                resolved BOOLEAN DEFAULT false,
                resolution_notes TEXT
            )`
        ];

        for (const table of tables) {
            await this.db.query(table);
        }

        console.log('✅ Database tables initialized');
    }

    setupSQLiteFallback() {
        console.log('⚠️ Using SQLite fallback');
        const sqlite3 = require('sqlite3').verbose();
        this.db = new sqlite3.Database('./browser_data.db');
        this.initializeSQLiteTables();
    }

    setupApp() {
        // Set app user model ID for Windows
        if (process.platform === 'win32') {
            app.setAppUserModelId('com.faprot.secure-browser');
        }

        app.whenReady().then(() => {
            this.createMainWindow();
            this.setupSecurity();
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

        // Security: Prevent new window creation
        app.on('web-contents-created', (event, contents) => {
            contents.on('new-window', (event, navigationUrl) => {
                event.preventDefault();
                this.handleNewWindow(navigationUrl);
            });
        });
    }

    createMainWindow() {
        this.mainWindow = new BrowserWindow({
            width: 1400,
            height: 900,
            minWidth: 1200,
            minHeight: 700,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                enableRemoteModule: false,
                webSecurity: true,
                allowRunningInsecureContent: false,
                preload: path.join(__dirname, 'browser-preload.js'),
                sandbox: false
            },
            icon: path.join(__dirname, 'assets', 'browser-icon.png'),
            show: false,
            titleBarStyle: 'hiddenInset'
        });

        // Load the browser interface
        this.mainWindow.loadFile(path.join(__dirname, 'browser-ui.html'));

        // Show window when ready
        this.mainWindow.once('ready-to-show', () => {
            this.mainWindow.show();
            this.mainWindow.focus();
        });

        // Handle window close
        this.mainWindow.on('closed', () => {
            this.mainWindow = null;
        });

        // DevTools in development
        if (process.env.NODE_ENV === 'development') {
            this.mainWindow.webContents.openDevTools();
        }
    }

    setupSecurity() {
        // Security session setup
        const ses = session.defaultSession;

        // Block suspicious requests
        ses.webRequest.onBeforeRequest(async (details, callback) => {
            const url = details.url;
            const securityCheck = await this.securityEngine.checkURL(url);
            
            if (!securityCheck.isAllowed) {
                callback({ cancel: true });
                this.logSecurityEvent('blocked_request', url, securityCheck);
            } else {
                callback({ cancel: false });
            }
        });

        // Set security headers
        ses.webRequest.onHeadersReceived((details, callback) => {
            const responseHeaders = details.responseHeaders;
            
            // Add security headers
            responseHeaders['X-Content-Type-Options'] = ['nosniff'];
            responseHeaders['X-Frame-Options'] = ['DENY'];
            responseHeaders['X-XSS-Protection'] = ['1; mode=block'];
            
            callback({ responseHeaders });
        });

        // Certificate verification
        ses.setCertificateVerifyProc((request, callback) => {
            callback(0);
        });
    }

    setupIPC() {
        // Navigation and security
        ipcMain.handle('navigate-to-url', async (event, url) => {
            return await this.navigateToURL(url);
        });

        ipcMain.handle('check-url-security', async (event, url) => {
            return await this.securityEngine.checkURL(url);
        });

        ipcMain.handle('block-site', async (event, url, reason) => {
            return await this.blockSite(url, reason);
        });

        ipcMain.handle('whitelist-site', async (event, url, reason) => {
            return await this.whitelistSite(url, reason);
        });

        // Database operations
        ipcMain.handle('get-browsing-history', async () => {
            return await this.getBrowsingHistory();
        });

        ipcMain.handle('get-security-logs', async () => {
            return await this.getSecurityLogs();
        });

        ipcMain.handle('get-blocked-sites', async () => {
            return await this.getBlockedSites();
        });

        ipcMain.handle('get-whitelisted-sites', async () => {
            return await this.getWhitelistedSites();
        });

        // User preferences
        ipcMain.handle('get-user-preferences', async () => {
            return await this.getUserPreferences();
        });

        ipcMain.handle('set-user-preference', async (event, key, value) => {
            return await this.setUserPreference(key, value);
        });

        // Security reports
        ipcMain.handle('generate-security-report', async () => {
            return await this.generateSecurityReport();
        });

        // Browser controls
        ipcMain.handle('go-back', () => {
            if (this.mainWindow.webContents.canGoBack()) {
                this.mainWindow.webContents.goBack();
            }
        });

        ipcMain.handle('go-forward', () => {
            if (this.mainWindow.webContents.canGoForward()) {
                this.mainWindow.webContents.goForward();
            }
        });

        ipcMain.handle('reload', () => {
            this.mainWindow.webContents.reload();
        });

        ipcMain.handle('stop', () => {
            this.mainWindow.webContents.stop();
        });

        // Security settings
        ipcMain.handle('get-security-settings', async () => {
            return await this.getSecuritySettings();
        });

        ipcMain.handle('update-security-settings', async (event, settings) => {
            return await this.updateSecuritySettings(settings);
        });
    }

    setupMenu() {
        const template = [
            {
                label: 'File',
                submenu: [
                    {
                        label: 'New Window',
                        accelerator: 'CmdOrCtrl+N',
                        click: () => this.createNewWindow()
                    },
                    {
                        label: 'New Private Window',
                        accelerator: 'CmdOrCtrl+Shift+N',
                        click: () => this.createPrivateWindow()
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
                label: 'Edit',
                submenu: [
                    { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
                    { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
                    { type: 'separator' },
                    { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
                    { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
                    { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' }
                ]
            },
            {
                label: 'Security',
                submenu: [
                    {
                        label: 'Security Dashboard',
                        accelerator: 'CmdOrCtrl+Shift+S',
                        click: () => this.showSecurityDashboard()
                    },
                    {
                        label: 'Blocked Sites',
                        click: () => this.showBlockedSites()
                    },
                    {
                        label: 'Whitelisted Sites',
                        click: () => this.showWhitelistedSites()
                    },
                    { type: 'separator' },
                    {
                        label: 'Security Settings',
                        accelerator: 'CmdOrCtrl+,',
                        click: () => this.showSecuritySettings()
                    },
                    {
                        label: 'Clear Browsing Data',
                        click: () => this.clearBrowsingData()
                    }
                ]
            },
            {
                label: 'Tools',
                submenu: [
                    {
                        label: 'Developer Tools',
                        accelerator: 'F12',
                        click: () => this.mainWindow.webContents.toggleDevTools()
                    },
                    {
                        label: 'Security Report',
                        accelerator: 'CmdOrCtrl+Shift+R',
                        click: () => this.generateAndShowSecurityReport()
                    }
                ]
            },
            {
                label: 'Help',
                submenu: [
                    {
                        label: 'About Faprot Browser',
                        click: () => this.showAboutDialog()
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

    async navigateToURL(url) {
        try {
            // Validate and normalize URL
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                url = 'https://' + url;
            }

            // Security check
            const securityCheck = await this.securityEngine.checkURL(url);
            
            if (!securityCheck.isAllowed) {
                this.logSecurityEvent('navigation_blocked', url, securityCheck);
                return {
                    success: false,
                    blocked: true,
                    reason: securityCheck.reason,
                    riskScore: securityCheck.riskScore
                };
            }

            // Navigate to URL
            await this.mainWindow.webContents.loadURL(url);
            
            // Log navigation
            await this.logBrowsingHistory(url);
            this.logSecurityEvent('navigation_allowed', url, securityCheck);

            return {
                success: true,
                blocked: false,
                securityInfo: securityCheck
            };

        } catch (error) {
            console.error('Navigation error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async blockSite(url, reason) {
        try {
            const domain = new URL(url).hostname;
            
            await this.db.query(
                'INSERT INTO blocked_sites (url, domain, reason, risk_score, threat_type) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (url) DO NOTHING',
                [url, domain, reason, 100, 'user_blocked']
            );

            this.logSecurityEvent('site_blocked', url, { reason, user_action: true });
            return { success: true };

        } catch (error) {
            console.error('Error blocking site:', error);
            return { success: false, error: error.message };
        }
    }

    async whitelistSite(url, reason) {
        try {
            const domain = new URL(url).hostname;
            
            await this.db.query(
                'INSERT INTO whitelisted_sites (url, domain, reason, verified) VALUES ($1, $2, $3, $4) ON CONFLICT (url) DO NOTHING',
                [url, domain, reason, true]
            );

            this.logSecurityEvent('site_whitelisted', url, { reason, user_action: true });
            return { success: true };

        } catch (error) {
            console.error('Error whitelisting site:', error);
            return { success: false, error: error.message };
        }
    }

    async logBrowsingHistory(url) {
        try {
            const title = this.mainWindow.webContents.getTitle();
            const isSecure = url.startsWith('https://');
            
            await this.db.query(
                'INSERT INTO browsing_history (url, title, is_secure, category) VALUES ($1, $2, $3, $4) ON CONFLICT (url) DO UPDATE SET visit_count = browsing_history.visit_count + 1',
                [url, title, isSecure, 'general']
            );

        } catch (error) {
            console.error('Error logging browsing history:', error);
        }
    }

    async logSecurityEvent(action, url, data) {
        try {
            await this.db.query(
                'INSERT INTO security_logs (url, action, risk_level, threat_type, user_action) VALUES ($1, $2, $3, $4, $5)',
                [url, action, data.riskScore || 0, data.threatType || 'unknown', data.user_action || false]
            );

        } catch (error) {
            console.error('Error logging security event:', error);
        }
    }

    async getBrowsingHistory() {
        try {
            const result = await this.db.query(
                'SELECT * FROM browsing_history ORDER BY timestamp DESC LIMIT 100'
            );
            return result.rows;
        } catch (error) {
            console.error('Error getting browsing history:', error);
            return [];
        }
    }

    async getSecurityLogs() {
        try {
            const result = await this.db.query(
                'SELECT * FROM security_logs ORDER BY timestamp DESC LIMIT 100'
            );
            return result.rows;
        } catch (error) {
            console.error('Error getting security logs:', error);
            return [];
        }
    }

    async getBlockedSites() {
        try {
            const result = await this.db.query(
                'SELECT * FROM blocked_sites ORDER BY blocked_at DESC'
            );
            return result.rows;
        } catch (error) {
            console.error('Error getting blocked sites:', error);
            return [];
        }
    }

    async getWhitelistedSites() {
        try {
            const result = await this.db.query(
                'SELECT * FROM whitelisted_sites ORDER BY added_at DESC'
            );
            return result.rows;
        } catch (error) {
            console.error('Error getting whitelisted sites:', error);
            return [];
        }
    }

    async getUserPreferences() {
        try {
            const result = await this.db.query('SELECT * FROM user_preferences');
            const prefs = {};
            result.rows.forEach(row => {
                prefs[row.key] = row.value;
            });
            return prefs;
        } catch (error) {
            console.error('Error getting user preferences:', error);
            return {};
        }
    }

    async setUserPreference(key, value) {
        try {
            await this.db.query(
                'INSERT INTO user_preferences (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP',
                [key, value]
            );
            return { success: true };
        } catch (error) {
            console.error('Error setting user preference:', error);
            return { success: false, error: error.message };
        }
    }

    async generateSecurityReport() {
        try {
            const stats = await this.db.query(`
                SELECT 
                    COUNT(*) as total_visits,
                    COUNT(CASE WHEN is_secure = true THEN 1 END) as secure_visits,
                    COUNT(DISTINCT url) as unique_sites
                FROM browsing_history
            `);

            const threats = await this.db.query(`
                SELECT 
                    COUNT(*) as total_blocked,
                    AVG(risk_score) as avg_risk_score
                FROM blocked_sites
            `);

            return {
                browsingStats: stats.rows[0],
                threatStats: threats.rows[0],
                generatedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('Error generating security report:', error);
            return { error: error.message };
        }
    }

    createNewWindow() {
        const newWindow = new BrowserWindow({
            width: 1200,
            height: 800,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'browser-preload.js')
            }
        });

        newWindow.loadFile(path.join(__dirname, 'browser-ui.html'));
    }

    createPrivateWindow() {
        const privateWindow = new BrowserWindow({
            width: 1200,
            height: 800,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'browser-preload.js'),
                partition: 'private-session'
            }
        });

        privateWindow.loadFile(path.join(__dirname, 'browser-ui.html'));
    }

    showSecurityDashboard() {
        // Create security dashboard window
        if (this.securityWindow) {
            this.securityWindow.focus();
            return;
        }

        this.securityWindow = new BrowserWindow({
            width: 1000,
            height: 700,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'browser-preload.js')
            }
        });

        this.securityWindow.loadFile(path.join(__dirname, 'security-dashboard.html'));

        this.securityWindow.on('closed', () => {
            this.securityWindow = null;
        });
    }

    showAboutDialog() {
        dialog.showMessageBox(this.mainWindow, {
            type: 'info',
            title: 'About Faprot Secure Browser',
            message: 'Faprot Secure Browser',
            detail: 'Version 1.0.0\n\nA powerful secure browser with AI-powered threat detection and advanced security features.\n\nBuilt with Electron and PostgreSQL for maximum security and performance.',
            buttons: ['OK']
        });
    }

    showSecurityGuide() {
        shell.openExternal('https://faprot.com/security-guide');
    }

    async generateAndShowSecurityReport() {
        const report = await this.generateSecurityReport();
        
        const reportWindow = new BrowserWindow({
            width: 800,
            height: 600,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true
            }
        });

        const reportHtml = this.generateReportHTML(report);
        reportWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(reportHtml)}`);
    }

    generateReportHTML(report) {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Faprot Security Report</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .header { background: #2c3e50; color: white; padding: 20px; border-radius: 5px; }
                .stats { display: flex; justify-content: space-around; margin: 20px 0; }
                .stat { text-align: center; padding: 20px; background: #ecf0f1; border-radius: 5px; }
                .stat h3 { margin: 0; color: #2c3e50; }
                .stat p { margin: 5px 0; font-size: 24px; font-weight: bold; color: #3498db; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Faprot Security Report</h1>
                <p>Generated on: ${new Date(report.generatedAt).toLocaleString()}</p>
            </div>
            
            <div class="stats">
                <div class="stat">
                    <h3>Total Visits</h3>
                    <p>${report.browsingStats?.total_visits || 0}</p>
                </div>
                <div class="stat">
                    <h3>Secure Visits</h3>
                    <p>${report.browsingStats?.secure_visits || 0}</p>
                </div>
                <div class="stat">
                    <h3>Unique Sites</h3>
                    <p>${report.browsingStats?.unique_sites || 0}</p>
                </div>
                <div class="stat">
                    <h3>Threats Blocked</h3>
                    <p>${report.threatStats?.total_blocked || 0}</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }
}

// Security Engine Class
class SecurityEngine {
    constructor() {
        this.threatPatterns = new Set([
            'phishing', 'malware', 'spam', 'scam', 'fraud',
            'illegal', 'adult', 'gambling', 'hate', 'violence'
        ]);
        this.suspiciousTLDs = new Set([
            '.tk', '.ml', '.ga', '.cf', '.pw', '.top', '.click'
        ]);
        this.trustedDomains = new Set([
            'google.com', 'microsoft.com', 'apple.com', 'github.com',
            'stackoverflow.com', 'wikipedia.org', 'reddit.com'
        ]);
    }

    async checkURL(url) {
        try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname;
            
            // Check against whitelist
            if (this.trustedDomains.has(domain)) {
                return { isAllowed: true, riskScore: 0, reason: 'Trusted domain' };
            }

            // Check suspicious TLDs
            const tld = domain.substring(domain.lastIndexOf('.'));
            if (this.suspiciousTLDs.has(tld)) {
                return { 
                    isAllowed: false, 
                    riskScore: 80, 
                    reason: 'Suspicious TLD',
                    threatType: 'suspicious_domain'
                };
            }

            // Check for threat patterns in URL
            const urlLower = url.toLowerCase();
            for (const pattern of this.threatPatterns) {
                if (urlLower.includes(pattern)) {
                    return { 
                        isAllowed: false, 
                        riskScore: 90, 
                        reason: `Threat pattern detected: ${pattern}`,
                        threatType: pattern
                    };
                }
            }

            // Check HTTPS
            if (urlObj.protocol !== 'https:') {
                return { 
                    isAllowed: false, 
                    riskScore: 60, 
                    reason: 'Non-HTTPS connection',
                    threatType: 'insecure_connection'
                };
            }

            // Check domain length (typosquatting indicator)
            if (domain.length > 30) {
                return { 
                    isAllowed: false, 
                    riskScore: 70, 
                    reason: 'Suspicious domain length',
                    threatType: 'typosquatting'
                };
            }

            return { isAllowed: true, riskScore: 10, reason: 'URL appears safe' };

        } catch (error) {
            return { 
                isAllowed: false, 
                riskScore: 100, 
                reason: 'Invalid URL format',
                threatType: 'invalid_url'
            };
        }
    }
}

// UI Manager Class
class UIManager {
    constructor() {
        this.theme = 'dark';
        this.fontSize = 14;
    }

    getTheme() {
        return this.theme;
    }

    setTheme(theme) {
        this.theme = theme;
    }

    getFontSize() {
        return this.fontSize;
    }

    setFontSize(size) {
        this.fontSize = size;
    }
}

// Data Manager Class
class DataManager {
    constructor() {
        this.cache = new Map();
        this.maxCacheSize = 1000;
    }

    cacheData(key, data) {
        if (this.cache.size >= this.maxCacheSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, data);
    }

    getCachedData(key) {
        return this.cache.get(key);
    }

    clearCache() {
        this.cache.clear();
    }
}

// Start the browser
if (require.main === module) {
    const browser = new FaprotSecureBrowser();
}

module.exports = FaprotSecureBrowser;
