// Example Express server endpoint to upload a file to Cloudinary server-side
// Usage: node cloudinary_upload.js (requires env variables CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)

require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const fs = require('fs');

const upload = multer({ dest: 'tmp_uploads/' });
const app = express();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dsu3ojex3',
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

app.post('/cloudinary/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no_file' });
    const localPath = req.file.path;

    const result = await cloudinary.uploader.upload(localPath, {
      folder: req.body.folder || 'signalements',
      use_filename: true,
      unique_filename: false,
      resource_type: 'image'
    });

    // generate optimized URLs using cloudinary.url
    const publicId = result.public_id;
    const optimized = cloudinary.url(publicId, { fetch_format: 'auto', quality: 'auto' });
    const thumb = cloudinary.url(publicId, { width: 400, height: 400, crop: 'fill', fetch_format: 'auto', quality: 'auto' });

    // cleanup temporary file
    try { fs.unlinkSync(localPath); } catch (e) { /* ignore */ }

    res.json({ secure_url: result.secure_url, public_id: result.public_id, optimized_url: optimized, thumb_url: thumb });
  } catch (err) {
    console.error('Cloudinary upload error', err);
    res.status(500).json({ error: 'upload_failed', details: String(err) });
  }
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log('Cloudinary upload server listening on', port));
