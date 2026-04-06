# 🗄️ Faprot Secure Browser - PostgreSQL Database Setup

## 🚀 **Quick Setup Guide**

### **Step 1: Install PostgreSQL**
```bash
# Windows (using Chocolatey)
choco install postgresql

# Windows (manual download)
# Download from: https://www.postgresql.org/download/windows/

# macOS (using Homebrew)
brew install postgresql

# Linux (Ubuntu/Debian)
sudo apt update
sudo apt install postgresql postgresql-contrib
```

### **Step 2: Start PostgreSQL Service**
```bash
# Windows
net start postgresql-x64-15

# macOS
brew services start postgresql

# Linux
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### **Step 3: Create Database**
```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE faprot_browser;

# Create user (optional but recommended)
CREATE USER faprot_user WITH PASSWORD 'your_secure_password';

# Grant privileges
GRANT ALL PRIVILEGES ON DATABASE faprot_browser TO faprot_user;

# Exit
\q
```

### **Step 4: Configure Environment**
```bash
# Copy environment file
cp .env.example .env

# Edit .env file with your database settings
```

### **Step 5: Initialize Database Tables**
```bash
# Install dependencies
npm install

# Run database initialization
npm run db:init

# Run migrations
npm run db:migrate

# Seed with sample data (optional)
npm run db:seed
```

---

## 🔧 **Environment Configuration**

Edit your `.env` file:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=faprot_browser
DB_USER=postgres
DB_PASSWORD=your_password

# Alternative: SQLite Fallback (if PostgreSQL fails)
SQLITE_DB_PATH=./browser_data.sqlite
```

---

## 📊 **Database Schema Overview**

### **Security Logs Table**
```sql
CREATE TABLE security_logs (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    url TEXT NOT NULL,
    action TEXT NOT NULL,
    risk_level INTEGER DEFAULT 0,
    threat_type TEXT,
    user_action TEXT,
    ip_address INET,
    user_agent TEXT
);
```

### **Browsing History Table**
```sql
CREATE TABLE browsing_history (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    url TEXT NOT NULL,
    title TEXT,
    visit_count INTEGER DEFAULT 1,
    duration_seconds INTEGER,
    category TEXT,
    is_secure BOOLEAN DEFAULT false
);
```

### **Blocked Sites Table**
```sql
CREATE TABLE blocked_sites (
    id SERIAL PRIMARY KEY,
    url TEXT UNIQUE NOT NULL,
    domain TEXT NOT NULL,
    reason TEXT NOT NULL,
    risk_score INTEGER NOT NULL,
    blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    threat_type TEXT
);
```

### **Whitelisted Sites Table**
```sql
CREATE TABLE whitelisted_sites (
    id SERIAL PRIMARY KEY,
    url TEXT UNIQUE NOT NULL,
    domain TEXT NOT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reason TEXT,
    verified BOOLEAN DEFAULT false
);
```

### **User Preferences Table**
```sql
CREATE TABLE user_preferences (
    id SERIAL PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### **Security Incidents Table**
```sql
CREATE TABLE security_incidents (
    id SERIAL PRIMARY KEY,
    incident_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    description TEXT NOT NULL,
    url TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved BOOLEAN DEFAULT false,
    resolution_notes TEXT
);
```

---

## 🔍 **Database Management**

### **Connect to Database**
```bash
# Using psql
psql -h localhost -U postgres -d faprot_browser

# Using connection string
psql "postgresql://username:password@localhost:5432/faprot_browser"
```

### **Common Queries**
```sql
-- View recent security logs
SELECT * FROM security_logs ORDER BY timestamp DESC LIMIT 10;

-- View blocked sites
SELECT * FROM blocked_sites ORDER BY blocked_at DESC;

-- View browsing history
SELECT * FROM browsing_history ORDER BY timestamp DESC LIMIT 20;

-- View security incidents
SELECT * FROM security_incidents WHERE resolved = false;

-- Get security statistics
SELECT 
    COUNT(*) as total_logs,
    COUNT(CASE WHEN risk_level > 60 THEN 1 END) as high_risk,
    COUNT(CASE WHEN action = 'blocked' THEN 1 END) as blocked_sites
FROM security_logs;
```

### **Database Maintenance**
```sql
-- Clean old logs (older than 90 days)
DELETE FROM security_logs WHERE timestamp < NOW() - INTERVAL '90 days';

-- Clean old browsing history (older than 1 year)
DELETE FROM browsing_history WHERE timestamp < NOW() - INTERVAL '1 year';

-- Optimize database
VACUUM ANALYZE;

-- Reindex tables
REINDEX DATABASE faprot_browser;
```

---

## 🔄 **Backup and Restore**

### **Create Backup**
```bash
# Full database backup
pg_dump -h localhost -U postgres -d faprot_browser > backup.sql

# Compressed backup
pg_dump -h localhost -U postgres -d faprot_browser | gzip > backup.sql.gz

# Custom format backup (recommended)
pg_dump -h localhost -U postgres -d faprot_browser -Fc > backup.dump
```

### **Restore Backup**
```bash
# From SQL file
psql -h localhost -U postgres -d faprot_browser < backup.sql

# From compressed backup
gunzip -c backup.sql.gz | psql -h localhost -U postgres -d faprot_browser

# From custom format
pg_restore -h localhost -U postgres -d faprot_browser backup.dump
```

### **Automated Backup Script**
```bash
#!/bin/bash
# backup.sh

DB_NAME="faprot_browser"
DB_USER="postgres"
BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Create backup
pg_dump -h localhost -U $DB_USER -d $DB_NAME -Fc > "$BACKUP_DIR/backup_$DATE.dump"

# Keep only last 7 backups
cd $BACKUP_DIR
ls -t backup_*.dump | tail -n +8 | xargs -r rm

echo "Backup completed: backup_$DATE.dump"
```

---

## 🐛 **Troubleshooting**

### **Connection Issues**
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check if PostgreSQL is running
pg_isready

# Check connection
psql -h localhost -U postgres -c "SELECT version();"
```

### **Permission Issues**
```bash
# Grant permissions to user
GRANT ALL PRIVILEGES ON DATABASE faprot_browser TO faprot_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO faprot_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO faprot_user;
```

### **Performance Issues**
```sql
-- Check slow queries
SELECT query, mean_time, calls 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;

-- Check table sizes
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check index usage
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
```

### **Database Size Management**
```sql
-- Check database size
SELECT pg_size_pretty(pg_database_size('faprot_browser'));

-- Check table sizes
SELECT 
    tablename,
    pg_size_pretty(pg_total_relation_size(tablename)) as size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(tablename) DESC;

-- Check index sizes
SELECT 
    indexname,
    pg_size_pretty(pg_relation_size(indexname)) as size
FROM pg_indexes 
WHERE schemaname = 'public';
```

---

## 📈 **Performance Optimization**

### **Index Creation**
```sql
-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_security_logs_timestamp ON security_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_security_logs_url ON security_logs(url);
CREATE INDEX IF NOT EXISTS idx_security_logs_risk_level ON security_logs(risk_level);

CREATE INDEX IF NOT EXISTS idx_browsing_history_timestamp ON browsing_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_browsing_history_url ON browsing_history(url);
CREATE INDEX IF NOT EXISTS idx_browsing_history_category ON browsing_history(category);

CREATE INDEX IF NOT EXISTS idx_blocked_sites_domain ON blocked_sites(domain);
CREATE INDEX IF NOT EXISTS idx_blocked_sites_blocked_at ON blocked_sites(blocked_at);

CREATE INDEX IF NOT EXISTS idx_whitelisted_sites_domain ON whitelisted_sites(domain);
CREATE INDEX IF NOT EXISTS idx_whitelisted_sites_added_at ON whitelisted_sites(added_at);
```

### **Configuration Tuning**
```sql
-- PostgreSQL performance settings
-- Add to postgresql.conf

# Memory settings
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB
maintenance_work_mem = 64MB

# Connection settings
max_connections = 100
shared_preload_libraries = 'pg_stat_statements'

# Logging settings
log_statement = 'all'
log_duration = on
log_min_duration_statement = 1000
```

---

## 🔐 **Security Considerations**

### **Database Security**
```sql
-- Create read-only user for analytics
CREATE USER analytics_user WITH PASSWORD 'analytics_password';
GRANT CONNECT ON DATABASE faprot_browser TO analytics_user;
GRANT USAGE ON SCHEMA public TO analytics_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics_user;

-- Revoke unnecessary permissions
REVOKE CREATE ON SCHEMA public FROM public;
REVOKE ALL ON SCHEMA public FROM public;
GRANT USAGE ON SCHEMA public TO public;
```

### **Encryption**
```sql
-- Enable encryption (PostgreSQL 15+)
-- Add to postgresql.conf
ssl = on
ssl_cert_file = 'server.crt'
ssl_key_file = 'server.key'
ssl_ca_file = 'ca.crt'
```

---

## 📊 **Monitoring and Analytics**

### **Database Monitoring**
```sql
-- Active connections
SELECT * FROM pg_stat_activity WHERE datname = 'faprot_browser';

-- Database statistics
SELECT * FROM pg_stat_database WHERE datname = 'faprot_browser';

-- Table statistics
SELECT * FROM pg_stat_user_tables WHERE schemaname = 'public';
```

### **Performance Dashboard Query**
```sql
-- Comprehensive security dashboard
SELECT 
    (SELECT COUNT(*) FROM security_logs WHERE timestamp > NOW() - INTERVAL '24 hours') as logs_today,
    (SELECT COUNT(*) FROM blocked_sites WHERE blocked_at > NOW() - INTERVAL '24 hours') as blocked_today,
    (SELECT COUNT(*) FROM browsing_history WHERE timestamp > NOW() - INTERVAL '24 hours') as visits_today,
    (SELECT AVG(risk_level) FROM security_logs WHERE timestamp > NOW() - INTERVAL '24 hours') as avg_risk_today,
    (SELECT COUNT(*) FROM security_incidents WHERE resolved = false) as open_incidents;
```

---

## 🚀 **Production Deployment**

### **Production Settings**
```env
# Production environment
NODE_ENV=production
DB_HOST=your-production-db-host
DB_PORT=5432
DB_NAME=faprot_browser_prod
DB_USER=faprot_prod_user
DB_PASSWORD=strong_production_password

# Connection pooling
DB_POOL_MIN=2
DB_POOL_MAX=20
DB_POOL_IDLE=30000
DB_POOL_ACQUIRE=60000
DB_POOL_EVICT=1000
```

### **Docker PostgreSQL Setup**
```dockerfile
# Dockerfile for PostgreSQL
FROM postgres:15

ENV POSTGRES_DB=faprot_browser
ENV POSTGRES_USER=faprot_user
ENV POSTGRES_PASSWORD=secure_password

COPY init.sql /docker-entrypoint-initdb.d/
EXPOSE 5432
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: faprot_browser
      POSTGRES_USER: faprot_user
      POSTGRES_PASSWORD: secure_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"

volumes:
  postgres_data:
```

---

## 📋 **Checklist**

### **Before Starting Browser:**
- [ ] PostgreSQL installed and running
- [ ] Database created (`faprot_browser`)
- [ ] User created with proper permissions
- [ ] Environment variables configured
- [ ] Database tables initialized
- [ ] Indexes created for performance
- [ ] Backup strategy in place
- [ ] Security settings configured

### **After Setup:**
- [ ] Test database connection
- [ ] Verify table creation
- [ ] Test browser functionality
- [ ] Check security logging
- [ ] Verify performance
- [ ] Set up monitoring
- [ ] Configure automated backups

---

## 🎯 **Ready to Start!**

Once you've completed these steps, your **Faprot Secure Browser** will have a powerful PostgreSQL database backend with:

- ✅ **Professional security logging**
- ✅ **Browsing history tracking**
- ✅ **Threat detection storage**
- ✅ **User preference management**
- ✅ **Incident tracking**
- ✅ **Performance optimization**
- ✅ **Backup and recovery**
- ✅ **Production-ready configuration**

**Your secure browser is now ready for professional deployment!** 🚀
