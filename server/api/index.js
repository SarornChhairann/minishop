const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { Pool } = require('pg');
const cloudinary = require('cloudinary').v2;
const {memoryStorage} = require("multer");
const multer = require("multer");
const path = require("path");
require('dotenv').config();


const app = express();

app.use(morgan('dev'));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// PostgreSQL connection
let pool = null;

const getPool = () => {
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
            max: 1,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000
        });
    }
    return pool;
};

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Upload to Cloudinary function
const uploadToCloudinary = async (fileBuffer, fileName, options = {}) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: 'products',
                public_id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                resource_type: 'auto',
                overwrite: false,
                ...options
            },
            (error, result) => {
                if (error) reject(error);
                else resolve(result);
            }
        );

        const { Readable } = require('stream');
        const stream = Readable.from(fileBuffer);
        stream.pipe(uploadStream);
    });
};

// Delete from Cloudinary function
const deleteFromCloudinary = async (imageUrl) => {
    try {
        if (!imageUrl || !imageUrl.includes('cloudinary.com')) {
            console.log('Not a Cloudinary URL, skipping deletion');
            return true;
        }

        // Extract public_id from Cloudinary URL
        const regex = /\/upload\/(?:v\d+\/)?(.+?)\.(?:jpg|png|gif|webp|jpeg)/;
        const match = imageUrl.match(regex);

        if (!match || !match[1]) {
            console.error('Could not extract public_id from URL:', imageUrl);
            return false;
        }

        const publicId = match[1];
        const result = await cloudinary.uploader.destroy(publicId);

        if (result.result === 'ok') {
            console.log(`Deleted image: ${publicId}`);
            return true;
        } else {
            console.error('Failed to delete image:', result);
            return false;
        }
    } catch (error) {
        console.error('Error deleting from Cloudinary:', error);
        return false;
    }
};

// Configure Multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024
    },
    fileFilter: function (req, file, cb) {
        // Define allowed MIME types
        const allowedMimeTypes = [
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/gif',
            'image/webp'
        ];

        // Check MIME type
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only images (jpeg, jpg, png, gif, webp) are allowed.'));
        }
    }
});

app.get('/api/images/:publicId', async (req, res) => {
    try {
        let publicId = req.params.publicId;

        // Decode URL-encoded public_id
        if (publicId) {
            publicId = decodeURIComponent(publicId);
        }

        if (!publicId) {
            return res.status(400).json({ error: 'Public ID is required' });
        }

        const options = req.query;

        // Generate Cloudinary URL with transformations
        const defaultOptions = {
            width: options.width || 800,
            height: options.height || null,
            crop: options.crop || 'limit',
            quality: options.quality || 'auto',
            format: options.format || 'auto',
            fetch_format: options.fetch_format || 'auto',
            ...options
        };

        // Remove null/undefined options
        Object.keys(defaultOptions).forEach(key => {
            if (defaultOptions[key] === null || defaultOptions[key] === undefined) {
                delete defaultOptions[key];
            }
        });

        // Generate image URL
        const imageUrl = cloudinary.url(publicId, {
            ...defaultOptions,
            secure: true,
            sign_url: process.env.NODE_ENV === 'production'
        });

        res.redirect(302, imageUrl);

    } catch (error) {
        console.error('Error generating Cloudinary URL:', error);

        // Return error or placeholder image
        if (error.http_code === 404) {
            return res.status(404).json({ error: 'Image not found' });
        }

        res.status(500).json({
            error: 'Failed to generate image URL',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

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
        res.json(product);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/products', upload.single('image'), async (req, res) => {
    try {
        const { name, description, price, stock, status } = req.body;

        if (!name || !price || stock === undefined) {
            return res.status(400).json({ error: 'Missing required fields: name, price, stock' });
        }

        let imageUrl = '';

        if (req.file) {
            // Upload to cloud storage
            const uploadResult = await uploadToCloudinary(req.file.buffer, req.file.originalname);
            imageUrl = uploadResult.secure_url; // Use secure_url instead of url
        }

        const pool = getPool();

        const result = await pool.query(
            'INSERT INTO products (name, description, price, stock, image_url, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [name, description, parseFloat(price), parseInt(stock), imageUrl, status || 'ACTIVE']
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating product:', err);
        res.status(500).json({
            error: 'Internal server error',
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});

app.put('/api/products/:id', upload.single('image'), async (req, res) => {
    const pool = getPool();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { id } = req.params;
        const { name, description, price, stock, status } = req.body;

        if (!name || !price || stock === undefined) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Missing required fields: name, price, stock' });
        }

        // Get existing product
        const existingProduct = await client.query(
            'SELECT image_url FROM products WHERE product_id = $1',
            [id]
        );

        if (existingProduct.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Product not found' });
        }

        let imageUrl = existingProduct.rows[0].image_url;

        if (req.file) {
            // Delete old image if it exists
            if (imageUrl) {
                await deleteFromCloudinary(imageUrl);
            }

            // Upload new image to cloud storage
            const uploadResult = await uploadToCloudinary(req.file.buffer, req.file.originalname);
            imageUrl = uploadResult.secure_url;
        }

        const result = await client.query(
            'UPDATE products SET name = $1, description = $2, price = $3, stock = $4, image_url = $5, status = $6 WHERE product_id = $7 RETURNING *',
            [name, description, parseFloat(price), parseInt(stock), imageUrl, status || 'ACTIVE', id]
        );

        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error updating product:', err);
        res.status(500).json({
            error: 'Internal server error',
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    } finally {
        client.release();
    }
});

app.delete('/api/products/:id', async (req, res) => {
    const pool = getPool();
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

        const result = await client.query(
            'DELETE FROM products WHERE product_id = $1 RETURNING product_id',
            [id]
        );

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Product not found' });
        }

        const imageUrl = result.rows[0].image_url;
        if(imageUrl){
            await deleteFromCloudinary(imageUrl);
        }

        await client.query('COMMIT');
        res.status(204).send();
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error deleting product:', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
});

// Orders API (unchanged, works on Vercel)
app.post('/api/orders', async (req, res) => {
    const pool = getPool();
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

        if (!customer_name || !customer_email || !items || items.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: 'Missing required fields: customer_name, customer_email, and at least one item is required'
            });
        }

        for (const item of items) {
            if (!item.product_id || !item.quantity || item.quantity <= 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    error: 'Each item must have a valid product_id and quantity greater than 0'
                });
            }

            const productCheck = await client.query(
                `SELECT p.product_id, p.name, p.price, p.stock, p.status 
                 FROM products p 
                 WHERE p.product_id = $1 
                 FOR UPDATE`,
                [item.product_id]
            );

            if (productCheck.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({
                    error: `Product with ID ${item.product_id} not found`
                });
            }

            const product = productCheck.rows[0];

            if (product.status !== 'ACTIVE') {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    error: `Product "${product.name}" is not available for purchase`
                });
            }

            if (product.stock < item.quantity) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    error: `Insufficient stock for "${product.name}". Available: ${product.stock}, Requested: ${item.quantity}`
                });
            }
        }

        const orderResult = await client.query(
            `INSERT INTO orders 
             (customer_name, customer_email, customer_phone, shipping_address, total_amount) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING *`,
            [customer_name, customer_email, customer_phone, shipping_address, total_amount]
        );

        const order = orderResult.rows[0];

        for (const item of items) {
            await client.query(
                `INSERT INTO order_items 
                 (order_id, product_id, quantity, unit_price, subtotal) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [order.order_id, item.product_id, item.quantity, item.price, item.subtotal]
            );

            await client.query(
                `UPDATE products 
                 SET stock = stock - $1 
                 WHERE product_id = $2`,
                [item.quantity, item.product_id]
            );
        }

        await client.query('COMMIT');
        res.status(201).json(order);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Order creation error:', err);

        if (err.code === '23505') {
            res.status(400).json({ error: 'Duplicate order detected' });
        } else if (err.code === '23503') {
            res.status(400).json({ error: 'Invalid product reference' });
        } else if (err.code === '22003') {
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

app.get('/api/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const pool = getPool();

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

        if (completeOrder.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        res.json(completeOrder.rows[0]);
    } catch (e) {
        res.status(500).json({
            error: "Internal server error",
            details: process.env.NODE_ENV === 'development' ? e.message : undefined
        });
    }
});


module.exports = app;

// Local development only
if (process.env.NODE_ENV !== 'production' && require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running locally on http://localhost:${PORT}`);
    });
}