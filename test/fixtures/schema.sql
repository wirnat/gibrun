-- Test database schema for gibRun testing
-- This schema provides test data for database operations testing

-- Create test tables
CREATE TABLE IF NOT EXISTS test_users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS test_orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES test_users(id),
    amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS test_products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    category VARCHAR(100),
    in_stock BOOLEAN DEFAULT true
);

-- Insert test data
INSERT INTO test_users (email, name, active) VALUES
    ('alice@example.com', 'Alice Johnson', true),
    ('bob@example.com', 'Bob Smith', true),
    ('charlie@example.com', 'Charlie Brown', false),
    ('diana@example.com', 'Diana Prince', true)
ON CONFLICT (email) DO NOTHING;

INSERT INTO test_orders (user_id, amount, status) VALUES
    (1, 100.00, 'completed'),
    (1, 50.00, 'pending'),
    (2, 75.00, 'completed'),
    (3, 25.00, 'cancelled'),
    (4, 200.00, 'completed')
ON CONFLICT DO NOTHING;

INSERT INTO test_products (name, price, category, in_stock) VALUES
    ('Laptop', 999.99, 'Electronics', true),
    ('Book', 19.99, 'Education', true),
    ('Chair', 149.99, 'Furniture', false),
    ('Headphones', 79.99, 'Electronics', true)
ON CONFLICT DO NOTHING;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_test_users_email ON test_users(email);
CREATE INDEX IF NOT EXISTS idx_test_orders_user_id ON test_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_test_orders_status ON test_orders(status);
CREATE INDEX IF NOT EXISTS idx_test_products_category ON test_products(category);