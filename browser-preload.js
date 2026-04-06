/**
 * Faprot Secure Browser - Preload Script
 * Secure bridge between renderer and main processes
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose secure APIs to renderer process
contextBridge.exposeInMainWorld('faprotAPI', {
    // Navigation
    navigateToURL: (url) => ipcRenderer.invoke('navigate-to-url', url),
    checkURLSecurity: (url) => ipcRenderer.invoke('check-url-security', url),
    
    // Navigation controls
    goBack: () => ipcRenderer.invoke('go-back'),
    goForward: () => ipcRenderer.invoke('go-forward'),
    reload: () => ipcRenderer.invoke('reload'),
    stop: () => ipcRenderer.invoke('stop'),
    
    // Security management
    blockSite: (url, reason) => ipcRenderer.invoke('block-site', url, reason),
    whitelistSite: (url, reason) => ipcRenderer.invoke('whitelist-site', url, reason),
    
    // Database operations
    getBrowsingHistory: () => ipcRenderer.invoke('get-browsing-history'),
    getSecurityLogs: () => ipcRenderer.invoke('get-security-logs'),
    getBlockedSites: () => ipcRenderer.invoke('get-blocked-sites'),
    getWhitelistedSites: () => ipcRenderer.invoke('get-whitelisted-sites'),
    
    // User preferences
    getUserPreferences: () => ipcRenderer.invoke('get-user-preferences'),
    setUserPreference: (key, value) => ipcRenderer.invoke('set-user-preference', key, value),
    
    // Security reports
    generateSecurityReport: () => ipcRenderer.invoke('generate-security-report'),
    
    // Security settings
    getSecuritySettings: () => ipcRenderer.invoke('get-security-settings'),
    updateSecuritySettings: (settings) => ipcRenderer.invoke('update-security-settings', settings),
    
    // Events
    onSecurityAlert: (callback) => ipcRenderer.on('security-alert', callback),
    onUpdateSecurityData: (callback) => ipcRenderer.on('update-security-data', callback),
    
    // Utility functions
    showNotification: (title, message, type) => {
        // This will be handled by the renderer process
        console.log(`[${type}] ${title}: ${message}`);
    },
    
    // Version info
    getVersion: () => process.env.npm_package_version || '1.0.0',
    getNodeVersion: () => process.versions.node,
    getElectronVersion: () => process.versions.electron,
    
    // Security utilities
    getCurrentURL: () => window.location.href,
    isSecureContext: () => window.isSecureContext,
    getUserAgent: () => navigator.userAgent
});

// Expose security features
contextBridge.exposeInMainWorld('securityAPI', {
    // URL validation
    isValidURL: (url) => {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    },
    
    // Domain extraction
    extractDomain: (url) => {
        try {
            return new URL(url).hostname;
        } catch {
            return null;
        }
    },
    
    // Protocol check
    isHTTPS: (url) => {
        try {
            return new URL(url).protocol === 'https:';
        } catch {
            return false;
        }
    },
    
    // Security score calculation
    calculateSecurityScore: (securityInfo) => {
        let score = 100;
        
        if (!securityInfo.isAllowed) score -= 50;
        if (securityInfo.riskScore > 60) score -= 30;
        if (securityInfo.threatType) score -= 20;
        
        return Math.max(0, score);
    }
});

// Expose browser utilities
contextBridge.exposeInMainWorld('browserAPI', {
    // Local storage management
    setLocalStorage: (key, value) => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch {
            return false;
        }
    },
    
    getLocalStorage: (key) => {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : null;
        } catch {
            return null;
        }
    },
    
    removeLocalStorage: (key) => {
        try {
            localStorage.removeItem(key);
            return true;
        } catch {
            return false;
        }
    },
    
    // Session storage
    setSessionStorage: (key, value) => {
        try {
            sessionStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch {
            return false;
        }
    },
    
    getSessionStorage: (key) => {
        try {
            const value = sessionStorage.getItem(key);
            return value ? JSON.parse(value) : null;
        } catch {
            return null;
        }
    },
    
    // Clipboard operations
    copyToClipboard: async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            return false;
        }
    },
    
    readFromClipboard: async () => {
        try {
            return await navigator.clipboard.readText();
        } catch {
            return '';
        }
    },
    
    // Download management
    downloadFile: (url, filename) => {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename || 'download';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },
    
    // Fullscreen API
    toggleFullscreen: () => {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            document.documentElement.requestFullscreen();
        }
    },
    
    isFullscreen: () => !!document.fullscreenElement,
    
    // Theme management
    setTheme: (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        browserAPI.setLocalStorage('theme', theme);
    },
    
    getTheme: () => {
        return browserAPI.getLocalStorage('theme') || 'dark';
    },
    
    // Performance monitoring
    getPerformanceMetrics: () => {
        const navigation = performance.getEntriesByType('navigation')[0];
        return {
            loadTime: navigation.loadEventEnd - navigation.loadEventStart,
            domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
            firstPaint: performance.getEntriesByType('paint')[0]?.startTime || 0,
            firstContentfulPaint: performance.getEntriesByType('paint')[1]?.startTime || 0
        };
    }
});

// Security enhancements
contextBridge.exposeInMainWorld('securityFeatures', {
    // Content security policy
    getCSP: () => {
        const metaTags = document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]');
        return metaTags.length > 0 ? metaTags[0].getAttribute('content') : null;
    },
    
    // Mixed content detection
    hasMixedContent: () => {
        const resources = document.querySelectorAll('img, script, link, iframe');
        return Array.from(resources).some(resource => {
            const src = resource.src || resource.href;
            return src && window.location.protocol === 'https:' && src.startsWith('http://');
        });
    },
    
    // Cookie security
    getCookieSecurity: () => {
        const cookies = document.cookie.split(';').map(cookie => cookie.trim());
        return {
            total: cookies.length,
            secure: cookies.filter(cookie => cookie.includes('Secure')).length,
            httpOnly: cookies.filter(cookie => cookie.includes('HttpOnly')).length,
            sameSite: cookies.filter(cookie => cookie.includes('SameSite')).length
        };
    },
    
    // Certificate information
    getCertificateInfo: async () => {
        if (window.location.protocol === 'https:') {
            try {
                const cert = await window.crypto.subtle.exportKey('spki', await window.crypto.subtle.generateKey(
                    { name: 'RSA-OAEP', modulusLength: 2048 },
                    true,
                    ['encrypt']
                ));
                return { exported: true };
            } catch {
                return { exported: false };
            }
        }
        return { secure: false };
    }
});

// Development utilities (only in development mode)
if (process.env.NODE_ENV === 'development') {
    contextBridge.exposeInMainWorld('devAPI', {
        // Debug logging
        log: (...args) => console.log('[Renderer]', ...args),
        error: (...args) => console.error('[Renderer]', ...args),
        warn: (...args) => console.warn('[Renderer]', ...args),
        
        // Component inspection
        inspectElement: (selector) => {
            const element = document.querySelector(selector);
            return element ? {
                tagName: element.tagName,
                className: element.className,
                id: element.id,
                textContent: element.textContent?.substring(0, 100),
                children: element.children.length
            } : null;
        },
        
        // Performance debugging
        measurePerformance: (name, fn) => {
            const start = performance.now();
            const result = fn();
            const end = performance.now();
            console.log(`[Performance] ${name}: ${end - start}ms`);
            return result;
        },
        
        // Memory usage
        getMemoryUsage: () => {
            if (performance.memory) {
                return {
                    used: Math.round(performance.memory.usedJSHeapSize / 1048576),
                    total: Math.round(performance.memory.totalJSHeapSize / 1048576),
                    limit: Math.round(performance.memory.jsHeapSizeLimit / 1048576)
                };
            }
            return null;
        }
    });
}

// Error handling
window.addEventListener('error', (event) => {
    console.error('Renderer Error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled Promise Rejection:', event.reason);
});

// Security: Prevent access to Node.js APIs directly
delete window.require;
delete window.exports;
delete window.module;

console.log('Faprot Secure Browser - Preload script loaded successfully');
