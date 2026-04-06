#!/usr/bin/env node

/**
 * Database Initialization Script
 * Initializes PostgreSQL database with required tables and indexes
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class DatabaseInitializer {
    constructor() {
        this.pool = null;
        this.dbConfig = {
            user: process.env.DB_USER || 'postgres',
            host: process.env.DB_HOST || 'localhost',
            database: process.env.DB_NAME || 'faprot_browser',
            password: process.env.DB_PASSWORD || 'password',
            port: process.env.DB_PORT || 5432,
        };
    }

    async initialize() {
        try {
            console.log('🚀 Initializing Faprot Secure Browser Database...');
            
            // Test connection
            await this.testConnection();
            
            // Create database if it doesn't exist
            await this.createDatabase();
            
            // Connect to the database
            await this.connect();
            
            // Create tables
            await this.createTables();
            
            // Create indexes
            await this.createIndexes();
            
            // Seed initial data
            await this.seedData();
            
            console.log('✅ Database initialized successfully!');
            console.log('🎉 Your Faprot Secure Browser is ready to use!');
            
        } catch (error) {
            console.error('❌ Database initialization failed:', error.message);
            process.exit(1);
        } finally {
            if (this.pool) {
                await this.pool.end();
            }
        }
    }

    async testConnection() {
        console.log('🔍 Testing PostgreSQL connection...');
        
        const testPool = new Pool({
            ...this.dbConfig,
            database: 'postgres' // Connect to default database first
        });

        try {
            const result = await testPool.query('SELECT NOW()');
            console.log('✅ PostgreSQL connection successful');
            console.log(`📊 Connected to PostgreSQL ${result.rows[0].now}`);
        } finally {
            await testPool.end();
        }
    }

    async createDatabase() {
        console.log('📝 Creating database...');
        
        const createPool = new Pool({
            ...this.dbConfig,
            database: 'postgres'
        });

        try {
            // Check if database exists
            const result = await createPool.query(
                'SELECT 1 FROM pg_database WHERE datname = $1',
                [this.dbConfig.database]
            );

            if (result.rows.length === 0) {
                await createPool.query(`CREATE DATABASE "${this.dbConfig.database}"`);
                console.log(`✅ Database '${this.dbConfig.database}' created`);
            } else {
                console.log(`ℹ️  Database '${this.dbConfig.database}' already exists`);
            }
        } finally {
            await createPool.end();
        }
    }

    async connect() {
        console.log('🔗 Connecting to database...');
        this.pool = new Pool(this.dbConfig);
        
        // Test connection
        const result = await this.pool.query('SELECT NOW()');
        console.log('✅ Connected to browser database');
    }

    async createTables() {
        console.log('📋 Creating tables...');
        
        const tables = [
            // Security logs table
            `CREATE TABLE IF NOT EXISTS security_logs (
                id SERIAL PRIMARY KEY,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                url TEXT NOT NULL,
                action TEXT NOT NULL,
                risk_level INTEGER DEFAULT 0,
                threat_type TEXT,
                user_action TEXT,
                ip_address INET,
                user_agent TEXT,
                details JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Browsing history table
            `CREATE TABLE IF NOT EXISTS browsing_history (
                id SERIAL PRIMARY KEY,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                url TEXT NOT NULL,
                title TEXT,
                visit_count INTEGER DEFAULT 1,
                duration_seconds INTEGER DEFAULT 0,
                category TEXT,
                is_secure BOOLEAN DEFAULT false,
                domain TEXT,
                favicon_url TEXT,
                screenshot_path TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Blocked sites table
            `CREATE TABLE IF NOT EXISTS blocked_sites (
                id SERIAL PRIMARY KEY,
                url TEXT UNIQUE NOT NULL,
                domain TEXT NOT NULL,
                reason TEXT NOT NULL,
                risk_score INTEGER NOT NULL,
                blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                threat_type TEXT,
                user_reported BOOLEAN DEFAULT false,
                reporter_ip INET,
                details JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Whitelisted sites table
            `CREATE TABLE IF NOT EXISTS whitelisted_sites (
                id SERIAL PRIMARY KEY,
                url TEXT UNIQUE NOT NULL,
                domain TEXT NOT NULL,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                reason TEXT,
                verified BOOLEAN DEFAULT false,
                verification_date TIMESTAMP,
                category TEXT,
                details JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // User preferences table
            `CREATE TABLE IF NOT EXISTS user_preferences (
                id SERIAL PRIMARY KEY,
                key TEXT UNIQUE NOT NULL,
                value TEXT NOT NULL,
                type TEXT DEFAULT 'string',
                category TEXT DEFAULT 'general',
                description TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Security incidents table
            `CREATE TABLE IF NOT EXISTS security_incidents (
                id SERIAL PRIMARY KEY,
                incident_type TEXT NOT NULL,
                severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
                description TEXT NOT NULL,
                url TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                resolved BOOLEAN DEFAULT false,
                resolution_notes TEXT,
                resolved_at TIMESTAMP,
                resolved_by TEXT,
                details JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Threat intelligence table
            `CREATE TABLE IF NOT EXISTS threat_intelligence (
                id SERIAL PRIMARY KEY,
                threat_type TEXT NOT NULL,
                indicator TEXT NOT NULL,
                confidence INTEGER DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 100),
                source TEXT NOT NULL,
                first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                active BOOLEAN DEFAULT true,
                details JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Browser sessions table
            `CREATE TABLE IF NOT EXISTS browser_sessions (
                id SERIAL PRIMARY KEY,
                session_id TEXT UNIQUE NOT NULL,
                start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                end_time TIMESTAMP,
                duration_seconds INTEGER,
                pages_visited INTEGER DEFAULT 0,
                threats_blocked INTEGER DEFAULT 0,
                user_agent TEXT,
                ip_address INET,
                details JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Performance metrics table
            `CREATE TABLE IF NOT EXISTS performance_metrics (
                id SERIAL PRIMARY KEY,
                metric_type TEXT NOT NULL,
                metric_value NUMERIC NOT NULL,
                unit TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                details JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`
        ];

        for (const table of tables) {
            await this.pool.query(table);
        }

        console.log('✅ All tables created successfully');
    }

    async createIndexes() {
        console.log('📊 Creating indexes...');
        
        const indexes = [
            // Security logs indexes
            'CREATE INDEX IF NOT EXISTS idx_security_logs_timestamp ON security_logs(timestamp DESC)',
            'CREATE INDEX IF NOT EXISTS idx_security_logs_url ON security_logs(url)',
            'CREATE INDEX IF NOT EXISTS idx_security_logs_action ON security_logs(action)',
            'CREATE INDEX IF NOT EXISTS idx_security_logs_risk_level ON security_logs(risk_level)',
            'CREATE INDEX IF NOT EXISTS idx_security_logs_threat_type ON security_logs(threat_type)',
            
            // Browsing history indexes
            'CREATE INDEX IF NOT EXISTS idx_browsing_history_timestamp ON browsing_history(timestamp DESC)',
            'CREATE INDEX IF NOT EXISTS idx_browsing_history_url ON browsing_history(url)',
            'CREATE INDEX IF NOT EXISTS idx_browsing_history_domain ON browsing_history(domain)',
            'CREATE INDEX IF NOT EXISTS idx_browsing_history_category ON browsing_history(category)',
            'CREATE INDEX IF NOT EXISTS idx_browsing_history_is_secure ON browsing_history(is_secure)',
            
            // Blocked sites indexes
            'CREATE INDEX IF NOT EXISTS idx_blocked_sites_domain ON blocked_sites(domain)',
            'CREATE INDEX IF NOT EXISTS idx_blocked_sites_blocked_at ON blocked_sites(blocked_at DESC)',
            'CREATE INDEX IF NOT EXISTS idx_blocked_sites_risk_score ON blocked_sites(risk_score)',
            'CREATE INDEX IF NOT EXISTS idx_blocked_sites_threat_type ON blocked_sites(threat_type)',
            
            // Whitelisted sites indexes
            'CREATE INDEX IF NOT EXISTS idx_whitelisted_sites_domain ON whitelisted_sites(domain)',
            'CREATE INDEX IF NOT EXISTS idx_whitelisted_sites_added_at ON whitelisted_sites(added_at DESC)',
            'CREATE INDEX IF NOT EXISTS idx_whitelisted_sites_verified ON whitelisted_sites(verified)',
            
            // User preferences indexes
            'CREATE INDEX IF NOT EXISTS idx_user_preferences_key ON user_preferences(key)',
            'CREATE INDEX IF NOT EXISTS idx_user_preferences_category ON user_preferences(category)',
            
            // Security incidents indexes
            'CREATE INDEX IF NOT EXISTS idx_security_incidents_timestamp ON security_incidents(timestamp DESC)',
            'CREATE INDEX IF NOT EXISTS idx_security_incidents_severity ON security_incidents(severity)',
            'CREATE INDEX IF NOT EXISTS idx_security_incidents_resolved ON security_incidents(resolved)',
            'CREATE INDEX IF NOT EXISTS idx_security_incidents_type ON security_incidents(incident_type)',
            
            // Threat intelligence indexes
            'CREATE INDEX IF NOT EXISTS idx_threat_intelligence_indicator ON threat_intelligence(indicator)',
            'CREATE INDEX IF NOT EXISTS idx_threat_intelligence_type ON threat_intelligence(threat_type)',
            'CREATE INDEX IF NOT EXISTS idx_threat_intelligence_active ON threat_intelligence(active)',
            'CREATE INDEX IF NOT EXISTS idx_threat_intelligence_confidence ON threat_intelligence(confidence)',
            
            // Browser sessions indexes
            'CREATE INDEX IF NOT EXISTS idx_browser_sessions_session_id ON browser_sessions(session_id)',
            'CREATE INDEX IF NOT EXISTS idx_browser_sessions_start_time ON browser_sessions(start_time DESC)',
            
            // Performance metrics indexes
            'CREATE INDEX IF NOT EXISTS idx_performance_metrics_timestamp ON performance_metrics(timestamp DESC)',
            'CREATE INDEX IF NOT EXISTS idx_performance_metrics_type ON performance_metrics(metric_type)'
        ];

        for (const index of indexes) {
            await this.pool.query(index);
        }

        console.log('✅ All indexes created successfully');
    }

    async seedData() {
        console.log('🌱 Seeding initial data...');
        
        // Insert default user preferences
        const preferences = [
            ['security_level', 'high', 'string', 'security', 'Overall security level'],
            ['auto_block_suspicious', 'true', 'boolean', 'security', 'Automatically block suspicious sites'],
            ['https_only', 'true', 'boolean', 'security', 'Only allow HTTPS connections'],
            ['block_trackers', 'true', 'boolean', 'privacy', 'Block tracking scripts'],
            ['block_ads', 'false', 'boolean', 'privacy', 'Block advertisements'],
            ['theme', 'dark', 'string', 'ui', 'UI theme'],
            ['font_size', '14', 'number', 'ui', 'Font size in pixels'],
            ['search_engine', 'https://www.google.com/search?q=', 'string', 'browsing', 'Default search engine'],
            ['homepage', 'https://www.google.com', 'string', 'browsing', 'Homepage URL'],
            ['enable_javascript', 'true', 'boolean', 'browsing', 'Enable JavaScript'],
            ['enable_cookies', 'true', 'boolean', 'privacy', 'Enable cookies'],
            ['private_mode', 'false', 'boolean', 'privacy', 'Private browsing mode'],
            ['clear_history_on_exit', 'false', 'boolean', 'privacy', 'Clear history on exit'],
            ['show_security_panel', 'true', 'boolean', 'ui', 'Show security panel by default'],
            ['notification_level', 'medium', 'string', 'ui', 'Notification level']
        ];

        for (const [key, value, type, category, description] of preferences) {
            await this.pool.query(
                'INSERT INTO user_preferences (key, value, type, category, description) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (key) DO NOTHING',
                [key, value, type, category, description]
            );
        }

        // Insert default threat intelligence data
        const threats = [
            ['phishing', 'login', 95, 'internal', 'Common phishing pattern'],
            ['phishing', 'secure', 90, 'internal', 'Common phishing pattern'],
            ['phishing', 'verify', 85, 'internal', 'Common phishing pattern'],
            ['phishing', 'update', 80, 'internal', 'Common phishing pattern'],
            ['malware', 'download', 75, 'internal', 'Suspicious download pattern'],
            ['typosquatting', 'amaz0n', 95, 'external', 'Amazon typo'],
            ['typosquatting', 'paypaI', 95, 'external', 'PayPal typo'],
            ['typosquatting', 'micr0soft', 95, 'external', 'Microsoft typo']
        ];

        for (const [type, indicator, confidence, source, details] of threats) {
            await this.pool.query(
                'INSERT INTO threat_intelligence (threat_type, indicator, confidence, source, details) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (indicator) DO NOTHING',
                [type, indicator, confidence, source, JSON.stringify({ description: details })]
            );
        }

        // Insert default whitelisted sites
        const trustedSites = [
            ['https://www.google.com', 'google.com', 'Trusted search engine', true, 'search'],
            ['https://www.github.com', 'github.com', 'Trusted development platform', true, 'development'],
            ['https://www.stackoverflow.com', 'stackoverflow.com', 'Trusted Q&A platform', true, 'development'],
            ['https://www.wikipedia.org', 'wikipedia.org', 'Trusted encyclopedia', true, 'reference'],
            ['https://www.mozilla.org', 'mozilla.org', 'Trusted browser developer', true, 'technology'],
            ['https://www.electronjs.org', 'electronjs.org', 'Trusted framework', true, 'technology'],
            ['https://www.nodejs.org', 'nodejs.org', 'Trusted runtime', true, 'technology'],
            ['https://www.postgresql.org', 'postgresql.org', 'Trusted database', true, 'technology']
        ];

        for (const [url, domain, reason, verified, category] of trustedSites) {
            await this.pool.query(
                'INSERT INTO whitelisted_sites (url, domain, reason, verified, category) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (url) DO NOTHING',
                [url, domain, reason, verified, category]
            );
        }

        console.log('✅ Initial data seeded successfully');
    }

    async getDatabaseStats() {
        const stats = {};
        
        const tables = ['security_logs', 'browsing_history', 'blocked_sites', 'whitelisted_sites', 'user_preferences', 'security_incidents'];
        
        for (const table of tables) {
            const result = await this.pool.query(`SELECT COUNT(*) as count FROM ${table}`);
            stats[table] = parseInt(result.rows[0].count);
        }
        
        return stats;
    }
}

// Run the initialization
if (require.main === module) {
    const initializer = new DatabaseInitializer();
    initializer.initialize().catch(console.error);
}

module.exports = DatabaseInitializer;
