// routes/admindashboard.routes.js
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db'); // mysql2/promise pool
require('dotenv').config();

const router = express.Router();

/* =========================
   Authentication Middleware
========================= */
const requireAdmin = async (req, res, next) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ message: 'Not authenticated' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload || payload.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access only' });
    }
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};
router.use(requireAdmin);

/* =========================
   Categories CRUD
   Table: categories(id PK AI, name, type ENUM('AYUSH','Ailment','UseCase'),
              icon_url, display_order, created_at, updated_at)
========================= */
router.get('/categories', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const offset = (page - 1) * limit;
    const wantCount = req.query.count === 'false' ? false : true;

    const where = [];
    const params = [];
    if (q) {
      where.push('(name LIKE ? OR type LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT id, name, type, icon_url, display_order, created_at, updated_at
       FROM categories
       ${whereSql}
       ORDER BY display_order ASC, name ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    if (!wantCount) return res.json({ items: rows });

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM categories ${whereSql}`,
      params
    );
    res.json({ items: rows, count: total });
  } catch (error) {
    console.error('[categories:list]', error);
    res.status(500).json({ message: 'Failed to load categories' });
  }
});

router.post('/categories', async (req, res) => {
  try {
    const { name, type = 'AYUSH', icon_url = null, display_order = 0 } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ message: 'Name is required' });

    const validTypes = ['AYUSH', 'Ailment', 'UseCase'];
    const typeVal = validTypes.includes(type) ? type : 'AYUSH';

    const [result] = await pool.query(
      `INSERT INTO categories (name, type, icon_url, display_order)
       VALUES (?, ?, ?, ?)`,
      [name.trim(), typeVal, icon_url || null, parseInt(display_order, 10) || 0]
    );
    res.json({ id: result.insertId, message: 'Category created' });
  } catch (error) {
    console.error('[categories:create]', error);
    res.status(500).json({ message: 'Failed to create category' });
  }
});

router.put('/categories/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10) || 0;
    if (!id) return res.status(400).json({ message: 'Invalid id' });

    const { name, type, icon_url, display_order } = req.body || {};
    if (name !== undefined && (!name || !name.trim())) {
      return res.status(400).json({ message: 'Name cannot be empty' });
    }

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name.trim());
    }
    if (type !== undefined) {
      const validTypes = ['AYUSH', 'Ailment', 'UseCase'];
      const typeVal = validTypes.includes(type) ? type : 'AYUSH';
      updates.push('type = ?');
      params.push(typeVal);
    }
    if (icon_url !== undefined) {
      updates.push('icon_url = ?');
      params.push(icon_url || null);
    }
    if (display_order !== undefined) {
      updates.push('display_order = ?');
      params.push(parseInt(display_order, 10) || 0);
    }

    if (!updates.length) return res.json({ message: 'No changes' });

    params.push(id);
    await pool.query(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ message: 'Category updated' });
  } catch (error) {
    console.error('[categories:update]', error);
    res.status(500).json({ message: 'Failed to update category' });
  }
});

router.delete('/categories/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10) || 0;
    if (!id) return res.status(400).json({ message: 'Invalid id' });
    await pool.query('DELETE FROM categories WHERE id = ?', [id]);
    res.json({ message: 'Category deleted' });
  } catch (error) {
    console.error('[categories:delete]', error);
    res.status(500).json({ message: 'Failed to delete category' });
  }
});

/* =========================
   Plants CRUD
   Table: plants(id PK AI, name, slug UNIQUE, botanical_name,
              tags JSON/TEXT, status ENUM('draft','published'), featured TINYINT,
              hero_image, video_url, model_url,
              benefits JSON/TEXT, description, created_at, updated_at)
========================= */
router.get('/plants', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const offset = (page - 1) * limit;
    const wantCount = req.query.count === 'false' ? false : true;

    const where = [];
    const params = [];
    if (q) {
      where.push(`(name LIKE ? OR botanical_name LIKE ?)`);
      params.push(`%${q}%`, `%${q}%`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT id, name, slug, botanical_name, tags, status, featured,
              hero_image, video_url, model_url, benefits, description, updated_at
       FROM plants
       ${whereSql}
       ORDER BY updated_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const items = rows.map(row => ({
      ...row,
      tags: row.tags ? JSON.parse(row.tags) : [],
      benefits: row.benefits ? JSON.parse(row.benefits) : [],
    }));

    if (!wantCount) return res.json({ items });

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM plants ${whereSql}`,
      params
    );
    const [[{ published }]] = await pool.query(
      `SELECT COUNT(*) AS published FROM plants WHERE status='published'`
    );
    const publishedPct = total ? Math.round((published / total) * 100) : 0;

    res.json({ items, count: total, publishedPct });
  } catch (error) {
    console.error('[plants:list]', error);
    res.status(500).json({ message: 'Failed to load plants' });
  }
});

router.post('/plants', async (req, res) => {
  try {
    const { name, slug, botanical_name = null, tags = null, status = 'draft', featured = false,
            hero_image = null, video_url = null, model_url = null, benefits = null, description = null } = req.body || {};

    if (!name || !name.trim()) return res.status(400).json({ message: 'Name is required' });
    const validStatus = ['draft', 'published'];
    const s = validStatus.includes(status) ? status : 'draft';
    const slugVal = slug && slug.trim() ? slug.trim().toLowerCase().replace(/\s+/g, '-') : name.trim().toLowerCase().replace(/\s+/g, '-');

    const tagsJson = tags ? JSON.stringify(tags.filter(t => t && t.trim())) : null;
    const benefitsJson = benefits ? JSON.stringify(benefits.filter(b => b && b.trim())) : null;

    const [result] = await pool.query(
      `INSERT INTO plants (name, slug, botanical_name, tags, status, featured, hero_image, video_url, model_url, benefits, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        slugVal,
        botanical_name || null,
        tagsJson,
        s,
        featured ? 1 : 0,
        hero_image || null,
        video_url || null,
        model_url || null,
        benefitsJson,
        description || null
      ]
    );

    res.json({ id: result.insertId, message: 'Plant created' });
  } catch (error) {
    console.error('[plants:create]', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Slug already exists' });
    }
    res.status(500).json({ message: 'Failed to create plant' });
  }
});

router.put('/plants/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10) || 0;
    if (!id) return res.status(400).json({ message: 'Invalid id' });

    const { name, slug, botanical_name, tags, status, featured, hero_image, video_url, model_url, benefits, description } = req.body || {};

    const updates = [];
    const params = [];

    if (name !== undefined) {
      if (!name || !name.trim()) return res.status(400).json({ message: 'Name cannot be empty' });
      updates.push('name = ?');
      params.push(name.trim());
    }
    if (slug !== undefined) {
      const slugVal = slug && slug.trim() ? slug.trim().toLowerCase().replace(/\s+/g, '-') : null;
      updates.push('slug = ?');
      params.push(slugVal);
    }
    if (botanical_name !== undefined) { updates.push('botanical_name = ?'); params.push(botanical_name || null); }
    if (tags !== undefined) { updates.push('tags = ?'); params.push(tags ? JSON.stringify(tags.filter(t => t && t.trim())) : null); }
    if (status !== undefined) {
      const validStatus = ['draft', 'published'];
      const s = validStatus.includes(status) ? status : 'draft';
      updates.push('status = ?');
      params.push(s);
    }
    if (featured !== undefined) { updates.push('featured = ?'); params.push(featured ? 1 : 0); }
    if (hero_image !== undefined) { updates.push('hero_image = ?'); params.push(hero_image || null); }
    if (video_url !== undefined) { updates.push('video_url = ?'); params.push(video_url || null); }
    if (model_url !== undefined) { updates.push('model_url = ?'); params.push(model_url || null); }
    if (benefits !== undefined) { updates.push('benefits = ?'); params.push(benefits ? JSON.stringify(benefits.filter(b => b && b.trim())) : null); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description || null); }

    if (!updates.length) return res.json({ message: 'No changes' });

    params.push(id);
    await pool.query(`UPDATE plants SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ message: 'Plant updated' });
  } catch (error) {
    console.error('[plants:update]', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Slug already exists' });
    }
    res.status(500).json({ message: 'Failed to update plant' });
  }
});

router.delete('/plants/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10) || 0;
    if (!id) return res.status(400).json({ message: 'Invalid id' });
    await pool.query('DELETE FROM plants WHERE id = ?', [id]);
    res.json({ message: 'Plant deleted' });
  } catch (error) {
    console.error('[plants:delete]', error);
    res.status(500).json({ message: 'Failed to delete plant' });
  }
});

module.exports = router;