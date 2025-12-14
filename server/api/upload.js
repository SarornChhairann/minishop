const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

export const uploadToCloudinary = async (fileBuffer, fileName) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: 'products',
                public_id: fileName.split('.')[0],
                resource_type: 'auto'
            },
            (error, result) => {
                if (error) reject(error);
                else resolve(result);
            }
        );

        // Convert buffer to stream
        const { Readable } = require('stream');
        const stream = Readable.from(fileBuffer);
        stream.pipe(uploadStream);
    });
};

export const deleteFromCloudinary = async (imageUrl, options = {}) => {
    try {
        // Extract public_id from Cloudinary URL
        const getPublicIdFromUrl = (url) => {
            try {
                const urlParts = url.split('/');
                const uploadIndex = urlParts.indexOf('upload');

                if (uploadIndex === -1) return null;

                // Get everything after 'upload' except the version number
                const pathParts = urlParts.slice(uploadIndex + 1);

                // Remove version number (v1234567890/)
                if (pathParts[0].startsWith('v')) {
                    pathParts.shift();
                }

                // Join remaining parts and remove file extension
                return pathParts.join('/').replace(/\.[^/.]+$/, '');
            } catch (error) {
                console.error('Error parsing Cloudinary URL:', error);
                return null;
            }
        };

        const publicId = getPublicIdFromUrl(imageUrl);

        if (!publicId) {
            console.error('❌ Invalid Cloudinary URL:', imageUrl);
            return false;
        }

        // Delete with options
        const deleteOptions = {
            resource_type: options.resource_type || 'image',
            type: options.type || 'upload',
            invalidate: options.invalidate || true, // Invalidate CDN cache
            ...options
        };

        const result = await cloudinary.uploader.destroy(publicId, deleteOptions);

        if (result.result === 'ok') {
            console.log(`Successfully deleted: ${publicId}`);
            return true;
        } else if (result.result === 'not found') {
            console.log(`⚠Image not found in Cloudinary: ${publicId}`);
            return true; // Consider as successful deletion
        } else {
            console.error('Failed to delete image:', result);
            return false;
        }
    } catch (error) {
        console.error('Error deleting from Cloudinary:', error);
        throw error;
    }
};
//
// // Helper function to fetch and transform Cloudinary images
// const fetchCloudinaryImage = async (publicId, options = {}) => {
//
// };
//
// // Get optimized image from Cloudinary with transformations
// app.get('/api/images/:publicId', async (req, res) => {
//     try {
//         const { publicId } = req.params;
//         const {
//             width,
//             height,
//             crop,
//             quality,
//             format,
//             gravity,
//             radius,
//             effect,
//             opacity,
//             background,
//             border
//         } = req.query;
//
//         if (!publicId) {
//             return res.status(400).json({ error: 'Public ID is required' });
//         }
//
//         // Build transformation options
//         const transformations = {};
//
//         if (width) transformations.width = parseInt(width);
//         if (height) transformations.height = parseInt(height);
//         if (crop) transformations.crop = crop;
//         if (quality) transformations.quality = quality;
//         if (format) transformations.format = format;
//         if (gravity) transformations.gravity = gravity;
//         if (radius) transformations.radius = radius;
//         if (effect) transformations.effect = effect;
//         if (opacity) transformations.opacity = opacity;
//         if (background) transformations.background = background;
//         if (border) transformations.border = border;
//
//         // Generate the Cloudinary URL
//         const cloudinaryUrl = cloudinary.url(publicId, {
//             ...transformations,
//             secure: true,
//             sign_url: process.env.NODE_ENV === 'production'
//         });
//
//         // Redirect to Cloudinary URL (recommended for performance)
//         res.redirect(302, cloudinaryUrl);
//
//     } catch (err) {
//         console.error('❌ Error fetching image:', err);
//
//         // Return a placeholder image on error
//         const placeholderUrl = cloudinary.url('sample', {
//             width: req.query.width || 800,
//             height: req.query.height || 600,
//             crop: 'fill',
//             background: 'auto',
//             secure: true
//         });
//
//         res.redirect(302, placeholderUrl);
//     }
// });
//
// // Alternative: Serve images with caching headers
// app.get('/api/images/secure/:publicId', async (req, res) => {
//     try {
//         const { publicId } = req.params;
//         const options = req.query;
//
//         const imageUrl = await fetchCloudinaryImage(publicId, options);
//
//         // Set caching headers
//         res.set({
//             'Cache-Control': 'public, max-age=31536000', // 1 year
//             'Expires': new Date(Date.now() + 31536000000).toUTCString(),
//             'Last-Modified': new Date().toUTCString(),
//             'ETag': `"${publicId}-${Date.now()}"`
//         });
//
//         // Redirect to Cloudinary URL
//         res.redirect(302, imageUrl);
//
//     } catch (err) {
//         console.error('Error serving secure image:', err);
//         res.status(500).json({ error: 'Failed to fetch image' });
//     }
// });
//
// // Get base64 encoded image (for small images/icons)
// app.get('/api/images/base64/:publicId', async (req, res) => {
//     try {
//         const { publicId } = req.params;
//         const { width = 100, height = 100 } = req.query;
//
//         if (!publicId) {
//             return res.status(400).json({ error: 'Public ID is required' });
//         }
//
//         // Generate URL for base64 transformation
//         const base64Url = cloudinary.url(publicId, {
//             width: parseInt(width),
//             height: parseInt(height),
//             crop: 'fill',
//             quality: 'auto',
//             format: 'png',
//             fetch_format: 'auto',
//             flags: 'attachment',
//             secure: true
//         });
//
//         // For base64, you might want to fetch and convert
//         // This is more resource-intensive, so use sparingly
//         res.redirect(302, base64Url);
//
//     } catch (err) {
//         console.error('Error fetching base64 image:', err);
//         res.status(500).json({ error: 'Failed to fetch image' });
//     }
// });
//
// // Get image information (metadata)
// app.get('/api/images/info/:publicId', async (req, res) => {
//     try {
//         const { publicId } = req.params;
//
//         if (!publicId) {
//             return res.status(400).json({ error: 'Public ID is required' });
//         }
//
//         // Fetch image details from Cloudinary
//         const imageInfo = await cloudinary.api.resource(publicId, {
//             resource_type: 'image',
//             colors: true,
//             faces: true,
//             quality_analysis: true,
//             cinemagraph_analysis: true,
//             accessibility_analysis: true
//         });
//
//         res.json({
//             success: true,
//             data: {
//                 public_id: imageInfo.public_id,
//                 format: imageInfo.format,
//                 width: imageInfo.width,
//                 height: imageInfo.height,
//                 bytes: imageInfo.bytes,
//                 created_at: imageInfo.created_at,
//                 url: imageInfo.secure_url,
//                 dominant_color: imageInfo.dominant_color,
//                 colors: imageInfo.colors,
//                 faces: imageInfo.faces,
//                 quality_score: imageInfo.quality_score,
//                 accessibility_score: imageInfo.accessibility_score
//             }
//         });
//
//     } catch (err) {
//         console.error('Error fetching image info:', err);
//
//         if (err.error && err.error.http_code === 404) {
//             return res.status(404).json({ error: 'Image not found' });
//         }
//
//         res.status(500).json({
//             error: 'Failed to fetch image information',
//             details: process.env.NODE_ENV === 'development' ? err.message : undefined
//         });
//     }
// });
//
// // List images in a folder (with pagination)
// app.get('/api/images/folder/:folder', async (req, res) => {
//     try {
//         const { folder } = req.params;
//         const {
//             limit = 20,
//             offset = 0,
//             sort_by = 'created_at',
//             direction = 'desc'
//         } = req.query;
//
//         const result = await cloudinary.api.resources({
//             type: 'upload',
//             resource_type: 'image',
//             prefix: folder,
//             max_results: parseInt(limit),
//             next_cursor: offset || undefined,
//             sort_by: { [sort_by]: direction }
//         });
//
//         res.json({
//             success: true,
//             data: {
//                 images: result.resources.map(img => ({
//                     public_id: img.public_id,
//                     url: img.secure_url,
//                     format: img.format,
//                     width: img.width,
//                     height: img.height,
//                     bytes: img.bytes,
//                     created_at: img.created_at
//                 })),
//                 total_count: result.resources.length,
//                 next_cursor: result.next_cursor
//             }
//         });
//
//     } catch (err) {
//         console.error('Error listing folder images:', err);
//         res.status(500).json({ error: 'Failed to list images' });
//     }
// });
//
// // Search images by tag
// app.get('/api/images/search', async (req, res) => {
//     try {
//         const { tag, expression, max_results = 20 } = req.query;
//
//         if (!tag && !expression) {
//             return res.status(400).json({ error: 'Tag or expression is required' });
//         }
//
//         const searchExpression = expression || `tags=${tag}`;
//
//         const result = await cloudinary.api.resources_by_expression(searchExpression, {
//             resource_type: 'image',
//             max_results: parseInt(max_results),
//             context: true,
//             tags: true
//         });
//
//         res.json({
//             success: true,
//             data: {
//                 images: result.resources.map(img => ({
//                     public_id: img.public_id,
//                     url: img.secure_url,
//                     tags: img.tags,
//                     context: img.context,
//                     format: img.format,
//                     width: img.width,
//                     height: img.height
//                 })),
//                 total_count: result.resources.length
//             }
//         });
//
//     } catch (err) {
//         console.error('Error searching images:', err);
//         res.status(500).json({ error: 'Failed to search images' });
//     }
// });

// Helper middleware to extract public_id from URL
const extractPublicId = (req, res, next) => {
    const publicId = req.params.publicId;

    // Decode URL-encoded public_id
    if (publicId) {
        req.publicId = decodeURIComponent(publicId);
    }

    next();
};

// // Apply middleware to routes
// app.get('/api/images/:publicId', extractPublicId);
// app.get('/api/images/secure/:publicId', extractPublicId);
// app.get('/api/images/base64/:publicId', extractPublicId);
// app.get('/api/images/info/:publicId', extractPublicId);