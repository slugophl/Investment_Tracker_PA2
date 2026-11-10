require('dotenv').config();
const express = require('express');
const Database = require('better-sqlite3');
const argon2 = require('argon2');
const fs = require('node:fs');
const path = require('node:path');
const {configureSecurity,requireAuth} = require('./security');
const {validatePurchase} = require('./validation');
const app=express();
const db=new Database(path.join(__dirname,'tracker.db'));
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));
app.use(express.json({limit:'16kb'}));
configureSecurity(app);
const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
const todo = res => res.status(501).json({error:'Complete this numbered step'});

// S1: Implement GET /api/health -> {ok:true}.
app.get('/api/health', (req,res) => res.json({ok:true}));

// S2: Validate credentials. Normalize only email. Query duplicate email safely.
// await argon2.hash(password,{type:argon2.argon2id}); insert email/hash; return 201 {id,email}.
// Catch uniqueness conflicts as 409, without leaking SQL or hashes.
app.post('/api/register', asyncRoute(async(req,res) => {
  const email = req.body.email.trim();
  const pwd = req.body.password;

  const emailNormalized = email.toLowerCase();
  const emailRegexPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (emailNormalized.length < 3 || 
      emailNormalized.length > 254 || 
      !emailRegexPattern.test(emailNormalized) ||
      typeof pwd !== 'string' || 
      pwd.length < 8 || 
      pwd.length > 128) 
    return res.status(400).json({error:'Invalid email or password value'});

  try {
    const resultSelect = db.prepare('SELECT email FROM users WHERE email = ?').get(emailNormalized);
    if (resultSelect) 
      return res.status(409).json({error:'Email already exists'});
  } catch (error) {
    throw error;
  }

  const hash = await argon2.hash(pwd, {type:argon2.argon2id});
  try {
    const result = db.prepare('INSERT INTO users (email,password_hash) VALUES (?,?)').run(emailNormalized,hash);
    return res.status(201).json({id:result.lastInsertRowid,email:emailNormalized});
  } catch (error) {
    throw error;
  }
}));

// S3: SELECT by normalized email; await argon2.verify(storedHash,password).
// Invalid credentials -> generic 401. Regenerate, set userId, save, then respond.
// Promise wrappers: await new Promise((resolve,reject)=>req.session.regenerate(e=>e?reject(e):resolve()));
// Use the same pattern for session.save. Do not keep the old CSRF token after regeneration.
app.post('/api/login', asyncRoute(async(req,res) => {
  const email = req.body.email.trim();
  const pwd = req.body.password.trim();
  const emailNormalized = email.toLowerCase();

  try {
    const user = db.prepare('SELECT id,email,password_hash FROM users WHERE email = ?').get(emailNormalized);

    if (!user || !await argon2.verify(user.password_hash,pwd))
      return res.status(401).json({error:'Invalid email or password'});

    await new Promise((resolve,reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
    req.session.userId = user.id;

    await new Promise((resolve,reject) => req.session.save(err => err ? reject(err) : resolve()));
    return res.json({id:user.id,email:user.email});
  } catch (error) {
    throw error;
  }
}));

app.get('/api/me',requireAuth,(req,res)=> {
  // S4: Return only the session user's {id,email}.
  try {
    const user = db.prepare('SELECT id,email FROM users WHERE id = ?').get(req.session.userId);

    if (!user)
      return res.status(404).json({error:'User not found'});

    return res.json({id:user.id,email:user.email});
  } catch (error) {
    throw error;
  }
});

app.post('/api/logout',requireAuth,(req,res,next)=> {
  // S5: destroy session; forward an error if needed; clear sid with path '/'; return {ok:true}.
  req.session.destroy(err => {
    if (err) 
      return next(err);

    res.clearCookie('sid',{path:'/'});

    return res.json({ok:true});
  });
});

app.get('/api/categories',requireAuth,(req,res)=> {
  // S6: SELECT id,name FROM categories ORDER BY id, using all().
  try {
    const categories = db.prepare('SELECT id,name FROM categories ORDER BY id').all();

    if (!categories || categories.length === 0)
      return res.status(404).json({error:'Categories not found'});

    return res.json(categories);
  } catch (error) {
    throw error;
  }
});

// S7: Write a reusable SELECT with JOIN purchases to categories, aliases matching
// the API fields, and calculated quantity*unit_price_cents AS costCents.
// Owner restrictions belong in every record operation, including PUT and DELETE.
app.get('/api/purchases',requireAuth,(req,res)=> {
  // S8: return all owned records in ascending ID order.
  try {
    const purchases = db.prepare(`
      SELECT p.id,p.name,p.quantity,p.unit_price_cents AS unitPriceCents,p.category_id AS categoryId,c.name AS categoryName,p.quantity*p.unit_price_cents AS costCents
      FROM purchases p
      JOIN categories c ON c.id = p.category_id
      WHERE p.owner_id = ?
      ORDER BY p.id
    `).all(req.session.userId);

    return res.json(purchases);
  } catch (error) {
    throw error;
  }
});

app.post('/api/purchases',requireAuth,(req,res)=> {
  // S9: read category IDs, validatePurchase, INSERT with req.session.userId.
  // Use result.lastInsertRowid to SELECT the created joined record; return 201.
  try {
    const categoryIds = db.prepare('SELECT id FROM categories').all().map(category => category.id);
    const validation = validatePurchase(req.body, categoryIds);

    if (!validation.valid)
      return res.status(400).json({error:validation.error});

    const result = db.prepare(`
      INSERT INTO purchases (name,quantity,unit_price_cents,category_id,owner_id)
      VALUES (?,?,?,?,?)
    `).run(
      validation.data.name,
      validation.data.quantity,
      validation.data.unitPriceCents,
      validation.data.categoryId,
      req.session.userId
    );

    const purchase = db.prepare(`
      SELECT p.id,p.name,p.quantity,p.unit_price_cents AS unitPriceCents,p.category_id AS categoryId,c.name AS categoryName,p.quantity*p.unit_price_cents AS costCents
      FROM purchases p
      JOIN categories c ON c.id = p.category_id
      WHERE p.id = ?
    `).get(result.lastInsertRowid);

    return res.status(201).json(purchase);
  } catch (error) {
    throw error;
  }
});

app.put('/api/purchases/:id',requireAuth,(req,res)=> {
  // S10: validate positive integer path ID; lookup using ID AND owner_id.
  // 404 if not owned/found. Validate all editable fields, then UPDATE with both predicates.
  // SELECT and return the updated joined record.
  try {
    const purchaseId = Number(req.params.id);
    if (!Number.isInteger(purchaseId) || purchaseId <= 0)
      return res.status(400).json({error:'Invalid purchase ID'});

    const existingPurchase = db.prepare(`
      SELECT id FROM purchases
      WHERE id = ? AND owner_id = ?
    `).get(purchaseId, req.session.userId);

    if (!existingPurchase)
      return res.status(404).json({error:'Purchase not found'});

    const categoryIds = db.prepare('SELECT id FROM categories').all().map(category => category.id);
    const validation = validatePurchase(req.body, categoryIds);

    if (!validation.valid)
      return res.status(400).json({error:validation.error});

    db.prepare(`
      UPDATE purchases
      SET name = ?, quantity = ?, unit_price_cents = ?, category_id = ?
      WHERE id = ? AND owner_id = ?
    `).run(
      validation.data.name,
      validation.data.quantity,
      validation.data.unitPriceCents,
      validation.data.categoryId,
      purchaseId,
      req.session.userId
    );

    const purchase = db.prepare(`
      SELECT p.id,p.name,p.quantity,p.unit_price_cents AS unitPriceCents,p.category_id AS categoryId,c.name AS categoryName,p.quantity*p.unit_price_cents AS costCents
      FROM purchases p
      JOIN categories c ON c.id = p.category_id
      WHERE p.id = ?
    `).get(purchaseId);

    return res.json(purchase);
  } catch (error) {
    throw error;
  }
});

app.delete('/api/purchases/:id',requireAuth,(req,res)=> {
  // S11: validate path ID; DELETE WHERE id=? AND owner_id=?.
  // Check result.changes: 0 -> 404; otherwise {ok:true}.
  try {
    const purchaseId = Number(req.params.id);
    if (!Number.isInteger(purchaseId) || purchaseId <= 0)
      return res.status(400).json({error:'Invalid purchase ID'});

    const result = db.prepare(`
      DELETE FROM purchases
      WHERE id = ? AND owner_id = ?
    `).run(purchaseId, req.session.userId);

    if (result.changes === 0)
      return res.status(404).json({error:'Purchase not found'});

    return res.json({ok:true});
  } catch (error) {
    throw error;
  }
});

app.use('/api',(req,res)=>res.status(404).json({error:'API route not found'}));
app.use(express.static(path.join(__dirname,'public')));
app.use((err,req,res,next)=> {
  if (err.type==='entity.parse.failed') return res.status(400).json({error:'Invalid JSON'});
  if (err.type==='entity.too.large') return res.status(413).json({error:'Request too large'});
  console.error('Request failed');
  res.status(500).json({error:'Internal server error'});
});
app.listen(Number(process.env.PORT)||3000,()=>console.log('Open http://localhost:3000'));
