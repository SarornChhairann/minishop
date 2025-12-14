const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();

// Middleware - IMPORTANT: Remove express.json() for upload routes
app.use(morgan('dev'));
app.use(cors());

// Configure Multer for file uploads
const uploadDir = path.join(__dirname, "../",process.env.PRODUCT_IMAGE_PATH); // product path

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('📁 Created upload directory:', uploadDir);
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
        }
    }
});

// PostgreSQL connection
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: true
});

// Test database connection
pool.connect((err, client, release) => {
    if (err) {
        return console.error('Error acquiring client', err.stack);
    }
    console.log('Connected to PostgreSQL database');
    release();
});

// Serve uploaded images statically
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Handle Multer errors
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File size is too large. Maximum size is 5MB.' });
        }
        return res.status(400).json({ error: err.message });
    } else if (err) {
        return res.status(400).json({ error: err.message });
    }
    next();
};


app.use(express.json()); // For JSON requests

app.get('/api/products', async (req, res) => {
    try {
        const { status, search } = req.query;

        // Build WHERE conditions dynamically
        const conditions = [];
        const params = [];
        let paramIndex = 1;

        // Status filter - if not provided, show all
        if (status && status.toLowerCase() !== 'all') {
            conditions.push(`status = $${paramIndex}`);
            params.push(status.toUpperCase());
            paramIndex++;
        }

        // Search by name or description
        if (search) {
            conditions.push(`(name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
            params.push(`%${search}%`);
            paramIndex++;
        }

        // Build the SQL query
        let whereClause = '';
        if (conditions.length > 0) {
            whereClause = `WHERE ${conditions.join(' AND ')}`;
        }

        const query = `
      SELECT * FROM products 
      ${whereClause}
      ORDER BY product_id
    `;

    const result = await pool.query(query, params);

    result.rows.forEach(row => {
        if (row.image_url) {
            row.image_url = `${process.env.URL}:${process.env.PORT}/${process.env.PRODUCT_IMAGE_PATH}/${row.image_url}`;
        }
    });

    res.json(result.rows);

    } catch (err) {
        console.error('❌ Error fetching products:', err);
        res.status(500).json({
            error: 'Internal server error',
            details: err.message
        });
    }
});

app.get('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT * FROM products WHERE product_id = $1 ', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        // Convert relative path to full URL
        const product = result.rows[0];
        if (product.image_url) {
            product.image_url = `${process.env.URL}:${process.env.PORT}/${process.env.PRODUCT_IMAGE_PATH}/${product.image_url}`;
        }
        res.json(product);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/products', upload.single('image'), handleMulterError, async (req, res) => {
    try {
        // Parse form data from req.body
        const { name, description, price, stock, status } = req.body;

        if (!name || !price || stock === undefined) {
            return res.status(400).json({ error: 'Missing required fields: name, price, stock' });
        }

        let imagePath = null;
        if (req.file) {
            // Store relative path
            imagePath = req.file.filename;
        }

        const result = await pool.query(
            'INSERT INTO products (name, description, price, stock, image_url, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [name, description, parseFloat(price), parseInt(stock), imagePath, status || 'ACTIVE']
        );

        // Convert to full URL for response
        const product = result.rows[0];
        if (product.image_url) {
            product.image_url = `${process.env.URL}:${process.env.PORT}/${process.env.PRODUCT_IMAGE_PATH}/${product.image_url}`;
        }
        res.status(201).json(product);
    } catch (err) {
        console.error('❌ Error creating product:', err);
        res.status(500).json({
            error: 'Internal server error',
            details: err.message
        });
    }
});

// Update product with optional image upload
app.put('/api/products/:id', upload.single('image'), handleMulterError, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { id } = req.params;
        const { name, description, price, stock, status } = req.body;

        if (!name || !price || stock === undefined) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Missing required fields: name, price, stock' });
        }

        const currentProduct = await pool.query('SELECT * FROM products WHERE product_id = $1', [id]);

        let imagePath = currentProduct.rows[0].image_url;
        // If new image uploaded
        if (req.file) {
            // Delete old image file if exists
            if (currentProduct.rows[0]?.image_url) {
                const oldImagePath = path.join(__dirname, '..', process.env.PRODUCT_IMAGE_PATH, currentProduct.rows[0].image_url);
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);
                    console.log('Deleted old image:', oldImagePath);
                }
            }
            imagePath = `${req.file.filename}`;
        }

        const result = await client.query(
            'UPDATE products SET name = $1, description = $2, price = $3, stock = $4, image_url = $5, status = $6 WHERE product_id = $7 RETURNING *',
            [name, description, parseFloat(price), parseInt(stock), imagePath, status || 'ACTIVE', id]
        );

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Product not found' });
        }

        await client.query('COMMIT');

        // Convert to full URL for response
        const product = result.rows[0];
        if (product.image_url) {
            product.image_url = `${process.env.URL}:${process.env.PORT}/${process.env.PRODUCT_IMAGE_PATH}/${product.image_url}`;
        }
        res.json(product);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error updating product:', err);
        res.status(500).json({
            error: 'Internal server error',
            details: err.message
        });
    } finally {
        client.release();
    }
});

// Delete product (soft delete)
app.delete('/api/products/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { id } = req.params;

        const orderItem = await client.query(
            'SELECT * FROM order_items WHERE product_id = $1',
            [id]
        );

        if (orderItem.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Product cannot be deleted as it is in an order' });
        }

        // Get product to delete its image
        const product = await client.query(
            'SELECT image_url FROM products WHERE product_id = $1',
            [id]
        );

        if (product.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Product not found' });
        }

        // HARD DELETE - completely remove from database
        await client.query(
            'DELETE FROM products WHERE product_id = $1',
            [id]
        );

        // Delete image file if exists
        if (product.rows[0]?.image_url) {
            const imagePath = path.join(__dirname, '..', product.rows[0].image_url);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
                console.log('🗑️ Deleted product image:', imagePath);
            }
        }

        await client.query('COMMIT');
        res.status(204).json({message: "success"});
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error deleting product:', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
});

// Orders API with improved stock management
app.post('/api/orders', async (req, res) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const {
            customer_name,
            customer_email,
            customer_phone,
            shipping_address,
            items,
            total_amount
        } = req.body;

        // Validate required fields
        if (!customer_name || !customer_email || !items || items.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: 'Missing required fields: customer_name, customer_email, and at least one item is required'
            });
        }

        // 1. First, validate all products and check stock availability
        for (const item of items) {
            if (!item.product_id || !item.quantity || item.quantity <= 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    error: 'Each item must have a valid product_id and quantity greater than 0'
                });
            }

            // Check product exists and has sufficient stock
            const productCheck = await client.query(
                `SELECT p.product_id, p.name, p.price, p.stock, p.status 
                 FROM products p 
                 WHERE p.product_id = $1 
                 FOR UPDATE`,  // Lock the row for update
                [item.product_id]
            );

            if (productCheck.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({
                    error: `Product with ID ${item.product_id} not found`
                });
            }

            const product = productCheck.rows[0];

            // Check if product is active
            if (product.status !== 'ACTIVE') {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    error: `Product "${product.name}" is not available for purchase`
                });
            }

            // Check stock availability
            if (product.stock < item.quantity) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    error: `Insufficient stock for "${product.name}". Available: ${product.stock}, Requested: ${item.quantity}`
                });
            }
        }

        // 2. Create the order
        const orderResult = await client.query(
            `INSERT INTO orders 
             (customer_name, customer_email, customer_phone, shipping_address, total_amount) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING *`,
            [customer_name, customer_email, customer_phone, shipping_address, total_amount]
        );

        const order = orderResult.rows[0];

        // 3. Process order items and update stock
        for (const item of items) {
            // Insert order item
            await client.query(
                `INSERT INTO order_items 
                 (order_id, product_id, quantity, unit_price, subtotal) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [order.order_id, item.product_id, item.quantity, item.price, item.subtotal]
            );

            // Update product stock
            const updateResult = await client.query(
                `UPDATE products 
                 SET stock = stock - $1 
                 WHERE product_id = $2 
                 RETURNING product_id, name, stock`,
                [item.quantity, item.product_id]
            );

            // Log stock update (optional)
            console.log(`Stock updated for ${updateResult.rows[0].name}: New stock = ${updateResult.rows[0].stock}`);
        }

        const negativeStockCheck = await client.query(
            'SELECT product_id, name, stock FROM products WHERE stock < 0'
        );

        if (negativeStockCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            console.error('Negative stock detected:', negativeStockCheck.rows);
            return res.status(500).json({
                error: 'Inventory error: Negative stock detected. Transaction rolled back.'
            });
        }

        await client.query('COMMIT');
        console.log(order)
        res.status(201).json(order);

    } catch (err) {
        await client.query('ROLLBACK');

        console.error('Order creation error:', err);

        // Handle specific errors
        if (err.code === '23505') { // Unique violation
            res.status(400).json({ error: 'Duplicate order detected' });
        } else if (err.code === '23503') { // Foreign key violation
            res.status(400).json({ error: 'Invalid product reference' });
        } else if (err.code === '22003') { // Numeric value out of range
            res.status(400).json({ error: 'Invalid numeric value' });
        } else {
            res.status(500).json({
                error: 'Internal server error',
                details: process.env.NODE_ENV === 'development' ? err.message : undefined
            });
        }
    } finally {
        client.release();
    }
});

app.get('/api/orders/:id',async (req, res) => {
    try {
        const { id } = req.params;
        const completeOrder = await pool.query(
            `SELECT o.*, 
                    json_agg(
                        json_build_object(
                            'product_id', oi.product_id,
                            'quantity', oi.quantity,
                            'unit_price', oi.unit_price,
                            'subtotal', oi.subtotal,
                            'product_name', p.name
                        )
                    ) as items
             FROM orders o
             LEFT JOIN order_items oi ON o.order_id = oi.order_id
             LEFT JOIN products p ON oi.product_id = p.product_id
             WHERE o.order_id = $1
             GROUP BY o.order_id`,
            [id]
        );
        console.log(completeOrder.rows);
        res.json(completeOrder.rows[0])
    }catch (e){
        res.status(500).json({
            error: "Internal server error",
            details: process.env.NODE_ENV === 'development' ? e.message : undefined
        })
    }
})

app.listen(process.env.PORT, () => {
    console.log(`🚀 Server running on http://localhost:${process.env.PORT}`);
    console.log(`📁 Upload directory: ${uploadDir}`);
    console.log(`🌐 Image access: http://localhost:${process.env.PORT}/uploads/products/`);
});