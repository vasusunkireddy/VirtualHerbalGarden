const express = require('express');
const pool = require('../db');
const authenticate = require('../middleware/authenticate');
const cloudinary = require('cloudinary').v2;
const router = express.Router();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'do9cbfu5l',
  api_key: process.env.CLOUDINARY_API_KEY || '756894868516719',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'A8TnFVGn-nbwY8xzMdWFWZAQsQg',
});

// Input validators
function notEmpty(s) {
  return typeof s === 'string' && s.trim().length > 0;
}

function isUrl(s) {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}

function isYouTubeUrl(s) {
  return notEmpty(s) ? /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/.test(s) : true;
}

function validatePlant(body) {
  const errors = [];
  if (!notEmpty(body.common_name)) errors.push('common_name is required');
  if (!notEmpty(body.scientific_name)) errors.push('scientific_name is required');
  if (!body.system_id || isNaN(parseInt(body.system_id))) errors.push('system_id must be a valid integer');
  if (!notEmpty(body.image_url) || !isUrl(body.image_url)) errors.push('Valid image_url required');
  if (body.model_url && !isUrl(body.model_url)) errors.push('model_url must be a valid URL');
  if (body.youtube_url && !isYouTubeUrl(body.youtube_url)) errors.push('youtube_url must be a valid YouTube URL');
  const allowed = ['draft', 'published', 'archived'];
  if (!allowed.includes((body.status || '').toLowerCase())) errors.push('Invalid status');
  if (body.tags && !Array.isArray(body.tags)) errors.push('tags must be an array');
  return errors;
}

function sanitizeInput(str) {
  return String(str || '').replace(/[&<>"']/g, '');
}

// GET /api/plants
router.get('/', authenticate('admin'), async (req, res) => {
  console.log('GET /api/plants called with query:', req.query);
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    let where = 'WHERE 1=1';
    const params = [];

    if (req.query.search) {
      where += ' AND (p.common_name LIKE ? OR p.scientific_name LIKE ? OR p.aliases LIKE ?)';
      const term = `%${sanitizeInput(req.query.search)}%`;
      params.push(term, term, term);
    }
    if (req.query.system) {
      where += ' AND p.system_id = ?';
      params.push(parseInt(req.query.system));
    }
    if (req.query.status) {
      where += ' AND p.status = ?';
      params.push(req.query.status.toLowerCase());
    }

    const [rows] = await pool.query(
      `SELECT SQL_CALC_FOUND_ROWS p.id, p.common_name, p.scientific_name, p.aliases, p.system_id, s.name AS system_name, 
       p.image_url, p.model_url, p.youtube_url, p.status, p.updated_at 
       FROM plants p LEFT JOIN systems s ON p.system_id = s.id 
       ${where} ORDER BY p.updated_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [[{ total }]] = await pool.query('SELECT FOUND_ROWS() AS total');

    res.json({ items: rows, total });
  } catch (err) {
    console.error('Error fetching plants:', err.stack);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/plants/:id
router.get('/:id', authenticate('admin'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.common_name, p.scientific_name, p.aliases, p.system_id, s.name AS system_name,
       p.parts_used, p.indications, p.image_url, p.model_url, p.youtube_url, p.status, p.tags, p.updated_at 
       FROM plants p LEFT JOIN systems s ON p.system_id = s.id WHERE p.id = ?`,
      [parseInt(req.params.id)]
    );
    if (!rows.length) return res.status(404).json({ message: 'Plant not found' });
    res.json({
      ...rows[0],
      tags: rows[0].tags ? rows[0].tags.split(',').map(tag => tag.trim()) : [],
    });
  } catch (err) {
    console.error('Error fetching plant:', err.stack);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/plants
router.post('/', authenticate('admin'), async (req, res) => {
  try {
    const errors = validatePlant(req.body);
    if (errors.length) return res.status(400).json({ message: errors.join(', ') });

    const {
      common_name, scientific_name, aliases, system_id,
      parts_used, indications, image_url, model_url,
      youtube_url, status, tags
    } = req.body;

    if (!image_url.includes('cloudinary.com')) {
      return res.status(400).json({ message: 'image_url must be a valid Cloudinary URL' });
    }
    if (model_url && !model_url.includes('cloudinary.com')) {
      return res.status(400).json({ message: 'model_url must be a valid Cloudinary URL' });
    }

    const [system] = await pool.query('SELECT id FROM systems WHERE id = ?', [parseInt(system_id)]);
    if (!system.length) return res.status(400).json({ message: 'Invalid system_id' });

    const [result] = await pool.query(
      `INSERT INTO plants 
       (common_name, scientific_name, aliases, system_id, parts_used, indications, image_url, model_url, youtube_url, status, tags, created_at, updated_at) 
       VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
      [
        sanitizeInput(common_name.trim()),
        sanitizeInput(scientific_name.trim()),
        sanitizeInput(aliases || ''),
        parseInt(system_id),
        sanitizeInput(parts_used || ''),
        sanitizeInput(indications || ''),
        image_url.trim(),
        model_url ? model_url.trim() : '',
        youtube_url ? youtube_url.trim() : '',
        status.toLowerCase(),
        Array.isArray(tags) ? tags.map(tag => sanitizeInput(tag)).join(',') : ''
      ]
    );
    res.status(201).json({ id: result.insertId, message: 'Plant created successfully' });
  } catch (err) {
    console.error('Error creating plant:', err.stack);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/plants/:id
router.put('/:id', authenticate('admin'), async (req, res) => {
  try {
    const errors = validatePlant(req.body);
    if (errors.length) return res.status(400).json({ message: errors.join(', ') });

    const {
      common_name, scientific_name, aliases, system_id,
      parts_used, indications, image_url, model_url,
      youtube_url, status, tags
    } = req.body;

    if (!image_url.includes('cloudinary.com')) {
      return res.status(400).json({ message: 'image_url must be a valid Cloudinary URL' });
    }
    if (model_url && !model_url.includes('cloudinary.com')) {
      return res.status(400).json({ message: 'model_url must be a valid Cloudinary URL' });
    }

    const [system] = await pool.query('SELECT id FROM systems WHERE id = ?', [parseInt(system_id)]);
    if (!system.length) return res.status(400).json({ message: 'Invalid system_id' });

    const [existing] = await pool.query('SELECT image_url, model_url FROM plants WHERE id = ?', [parseInt(req.params.id)]);
    if (!existing.length) return res.status(404).json({ message: 'Plant not found' });

    if (existing[0].image_url !== image_url) {
      const publicIdImage = existing[0].image_url.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(`virtual_herbal/images/${publicIdImage}`).catch(err => console.warn('Failed to delete old image:', err));
    }
    if (existing[0].model_url && model_url && existing[0].model_url !== model_url) {
      const publicIdModel = existing[0].model_url.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(`virtual_herbal/models/${publicIdModel}`, { resource_type: 'raw' }).catch(err => console.warn('Failed to delete old model:', err));
    }

    const [result] = await pool.query(
      `UPDATE plants SET 
       common_name = ?, scientific_name = ?, aliases = ?, system_id = ?, 
       parts_used = ?, indications = ?, image_url = ?, model_url = ?, 
       youtube_url = ?, status = ?, tags = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        sanitizeInput(common_name.trim()),
        sanitizeInput(scientific_name.trim()),
        sanitizeInput(aliases || ''),
        parseInt(system_id),
        sanitizeInput(parts_used || ''),
        sanitizeInput(indications || ''),
        image_url.trim(),
        model_url ? model_url.trim() : '',
        youtube_url ? youtube_url.trim() : '',
        status.toLowerCase(),
        Array.isArray(tags) ? tags.map(tag => sanitizeInput(tag)).join(',') : '',
        parseInt(req.params.id)
      ]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Plant not found' });
    res.json({ message: 'Plant updated successfully' });
  } catch (err) {
    console.error('Error updating plant:', err.stack);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/plants/:id
router.delete('/:id', authenticate('admin'), async (req, res) => {
  try {
    const [plant] = await pool.query('SELECT image_url, model_url FROM plants WHERE id = ?', [parseInt(req.params.id)]);
    if (!plant.length) return res.status(404).json({ message: 'Plant not found' });

    if (plant[0].image_url) {
      const publicIdImage = plant[0].image_url.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(`virtual_herbal/images/${publicIdImage}`).catch(err => console.warn('Failed to delete image:', err));
    }
    if (plant[0].model_url) {
      const publicIdModel = plant[0].model_url.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(`virtual_herbal/models/${publicIdModel}`, { resource_type: 'raw' }).catch(err => console.warn('Failed to delete model:', err));
    }

    const [result] = await pool.query('DELETE FROM plants WHERE id = ?', [parseInt(req.params.id)]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Plant not found' });
    res.status(204).end();
  } catch (err) {
    console.error('Error deleting plant:', err.stack);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/systems
router.get('/systems', authenticate('admin'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name FROM systems ORDER BY name');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching systems:', err.stack);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;