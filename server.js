const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Paths to asset directories — files live in client/public/uploads/
const UPLOADS_DIR = path.join(__dirname, '..', 'client', 'public', 'uploads');
const MODELS_DIR = path.join(UPLOADS_DIR, 'models');
const BRANDING_DIR = path.join(UPLOADS_DIR, 'branding');
const ANIMATIONS_DIR = path.join(UPLOADS_DIR, '3d');
const TWOD_DIR = path.join(UPLOADS_DIR, '2d');
const LOGO_PATH = path.join(UPLOADS_DIR, 'logo.png');
const DATA_DIR = path.join(__dirname, 'data');

// Static assets serving — serve entire uploads folder
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/uploads/models', express.static(MODELS_DIR));
app.use('/uploads/branding', express.static(BRANDING_DIR));
app.use('/uploads/3d', express.static(ANIMATIONS_DIR));
app.use('/uploads/2d', express.static(TWOD_DIR));

// Ensure data folder exists for JSON storage fallback
async function ensureDataFolder() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error('Failed to create data directory:', err);
  }
}
ensureDataFolder();

// Setup hybrid/failover database structure
let dbConnected = false;
const MONGODB_URI = process.env.MONGODB_URI;

if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(() => {
      console.log('Successfully connected to MongoDB Database.');
      dbConnected = true;
    })
    .catch((err) => {
      console.error('MongoDB connection failed. Falling back to Local JSON database.', err);
      dbConnected = false;
    });
} else {
  console.log('No MONGODB_URI provided. Running on Local JSON database fallback.');
}

// Database Schemas (for MongoDB)
const OrderSchema = new mongoose.Schema({
  clientName: { type: String, required: true },
  discord: { type: String, required: true },
  email: { type: String, required: true },
  references: String,
  description: String,
  vtuberPackage: String,
  brandingPackage: String,
  selectedAddons: [String],
  totalPrice: Number,
  status: { type: String, default: 'Pending' },
  createdAt: { type: Date, default: Date.now }
});

const ContactSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  subject: String,
  message: { type: String, required: true },
  rating: { type: Number, default: 5 }, // For feedback rating
  type: { type: String, default: 'Contact' }, // 'Contact' or 'Feedback'
  reviewed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const Order = mongoose.models.Order || mongoose.model('Order', OrderSchema);
const Contact = mongoose.models.Contact || mongoose.model('Contact', ContactSchema);

// JSON file helper functions
const getLocalDataPath = (file) => path.join(DATA_DIR, file);

async function readLocalJSON(filename) {
  try {
    const filePath = getLocalDataPath(filename);
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

async function writeLocalJSON(filename, data) {
  const filePath = getLocalDataPath(filename);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// REST API endpoints

// Helper: only allow actual image/video media files
const MEDIA_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm', '.mov', '.avi']);
const isMediaFile = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  return MEDIA_EXTENSIONS.has(ext);
};

// 1. Dynamic Portfolio Asset Scanner
app.get('/api/portfolio', async (req, res) => {
  try {
    const portfolio = {
      models: [],
      branding: [],
      animations: [],
      twod: []
    };

    // Scan Models Directory
    try {
      const modelFiles = await fs.readdir(MODELS_DIR, { withFileTypes: true });
      portfolio.models = modelFiles
        .filter(dirent => dirent.isFile() && isMediaFile(dirent.name))
        .map(dirent => ({
          name: dirent.name,
          url: `/uploads/models/${encodeURIComponent(dirent.name)}`,
          type: dirent.name.toLowerCase().endsWith('.mp4') || dirent.name.toLowerCase().endsWith('.webm') || dirent.name.toLowerCase().endsWith('.mov') ? 'video' : 'image'
        }));
    } catch (e) {
      console.warn('Could not read models folder:', e.message);
    }

    // Scan Branding Directory
    try {
      const brandingFiles = await fs.readdir(BRANDING_DIR, { withFileTypes: true });
      portfolio.branding = brandingFiles
        .filter(dirent => dirent.isFile() && isMediaFile(dirent.name))
        .map(dirent => ({
          name: dirent.name,
          url: `/uploads/branding/${encodeURIComponent(dirent.name)}`,
          type: dirent.name.toLowerCase().endsWith('.mp4') || dirent.name.toLowerCase().endsWith('.webm') || dirent.name.toLowerCase().endsWith('.mov') ? 'video' : 'image'
        }));
    } catch (e) {
      console.warn('Could not read branding folder:', e.message);
    }

    // Scan 3D Animations Directory
    try {
      const animationFiles = await fs.readdir(ANIMATIONS_DIR, { withFileTypes: true });
      portfolio.animations = animationFiles
        .filter(dirent => dirent.isFile() && isMediaFile(dirent.name))
        .map(dirent => ({
          name: dirent.name,
          url: `/uploads/3d/${encodeURIComponent(dirent.name)}`,
          type: dirent.name.toLowerCase().endsWith('.mp4') || dirent.name.toLowerCase().endsWith('.webm') || dirent.name.toLowerCase().endsWith('.mov') ? 'video' : 'image'
        }));
    } catch (e) {
      console.warn('Could not read animations folder:', e.message);
    }

    // Scan 2D Animations Directory (exclude portfolio_2d.json and any non-media)
    try {
      const twodFiles = await fs.readdir(TWOD_DIR, { withFileTypes: true });
      portfolio.twod = twodFiles
        .filter(dirent => dirent.isFile() && isMediaFile(dirent.name))
        .map(dirent => ({
          name: dirent.name,
          url: `/uploads/2d/${encodeURIComponent(dirent.name)}`,
          type: dirent.name.toLowerCase().endsWith('.mp4') || dirent.name.toLowerCase().endsWith('.webm') || dirent.name.toLowerCase().endsWith('.mov') ? 'video' : 'image'
        }));
    } catch (e) {
      console.warn('Could not read 2D animations folder:', e.message);
    }

    res.json({ success: true, data: portfolio });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to scan portfolio files', error: err.message });
  }
});

// 2. Custom Quote // --- Auth API ---
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASS || 'BytHawk2026!';

  if (username === adminUser && password === adminPass) {
    // For a simple setup, we just return success without full JWT.
    // The frontend can store a session flag.
    res.json({ success: true, message: 'Login successful' });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// --- Orders API ---
app.post('/api/orders', async (req, res) => {
  try {
    const { clientName, discord, email, references, description, vtuberPackage, brandingPackage, selectedAddons, totalPrice } = req.body;

    if (!clientName || !discord || !email) {
      return res.status(400).json({ success: false, message: 'Missing required client contact details' });
    }

    const orderData = {
      clientName,
      discord,
      email,
      references,
      description,
      vtuberPackage,
      brandingPackage,
      selectedAddons,
      totalPrice,
      status: 'Pending',
      createdAt: new Date()
    };

    if (process.env.MONGODB_URI) {
      const newOrder = new Order(orderData);
      await newOrder.save();
      res.status(201).json({ success: true, message: 'Order request submitted successfully (MongoDB)', data: newOrder });
    } else {
      const orders = await readLocalJSON('orders.json');
      const newOrder = { id: `order_${Date.now()}`, ...orderData };
      orders.push(newOrder);
      await writeLocalJSON('orders.json', orders);
      res.status(201).json({ success: true, message: 'Order request submitted successfully (Local Storage)', data: newOrder });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to save order request', error: err.message });
  }
});

app.get('/api/orders', async (req, res) => {
  try {
    if (process.env.MONGODB_URI) {
      const orders = await Order.find().sort({ createdAt: -1 });
      res.json({ success: true, data: orders });
    } else {
      const orders = await readLocalJSON('orders.json');
      // Sort local by date descending
      orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      res.json({ success: true, data: orders });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch order requests', error: err.message });
  }
});

app.put('/api/orders/:id', async (req, res) => {
  try {
    const { status } = req.body;
    const { id } = req.params;

    if (process.env.MONGODB_URI) {
      const updated = await Order.findByIdAndUpdate(id, { status }, { new: true });
      if (!updated) return res.status(404).json({ success: false, message: 'Order not found' });
      res.json({ success: true, message: 'Order status updated', data: updated });
    } else {
      const orders = await readLocalJSON('orders.json');
      const index = orders.findIndex(o => o.id === id);
      if (index === -1) return res.status(404).json({ success: false, message: 'Order not found' });
      orders[index].status = status;
      await writeLocalJSON('orders.json', orders);
      res.json({ success: true, message: 'Order status updated', data: orders[index] });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update order', error: err.message });
  }
});

app.delete('/api/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (process.env.MONGODB_URI) {
      await Order.findByIdAndDelete(id);
      res.json({ success: true, message: 'Order deleted successfully' });
    } else {
      let orders = await readLocalJSON('orders.json');
      orders = orders.filter(o => o.id !== id);
      await writeLocalJSON('orders.json', orders);
      res.json({ success: true, message: 'Order deleted successfully' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete order', error: err.message });
  }
});

// 3. Contacts & Feedback API
app.post('/api/contacts', async (req, res) => {
  try {
    const { name, email, subject, message, rating, type } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ success: false, message: 'Name, email, and message are required fields' });
    }

    const contactData = {
      name,
      email,
      subject: subject || 'No Subject',
      message,
      rating: rating || 5,
      type: type || 'Contact', // 'Contact' or 'Feedback'
      reviewed: false,
      createdAt: new Date()
    };

    if (process.env.MONGODB_URI) {
      const newContact = new Contact(contactData);
      await newContact.save();
      res.status(201).json({ success: true, message: 'Message submitted successfully (MongoDB)', data: newContact });
    } else {
      const contacts = await readLocalJSON('contacts.json');
      const newContact = { id: `contact_${Date.now()}`, ...contactData };
      contacts.push(newContact);
      await writeLocalJSON('contacts.json', contacts);
      res.status(201).json({ success: true, message: 'Message submitted successfully (Local Storage)', data: newContact });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to save contact message', error: err.message });
  }
});

app.get('/api/contacts', async (req, res) => {
  try {
    if (process.env.MONGODB_URI) {
      const contacts = await Contact.find().sort({ createdAt: -1 });
      res.json({ success: true, data: contacts });
    } else {
      const contacts = await readLocalJSON('contacts.json');
      contacts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      res.json({ success: true, data: contacts });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch messages', error: err.message });
  }
});

app.put('/api/contacts/:id', async (req, res) => {
  try {
    const { reviewed } = req.body;
    const { id } = req.params;

    if (process.env.MONGODB_URI) {
      const updated = await Contact.findByIdAndUpdate(id, { reviewed }, { new: true });
      if (!updated) return res.status(404).json({ success: false, message: 'Message not found' });
      res.json({ success: true, message: 'Message review state updated', data: updated });
    } else {
      const contacts = await readLocalJSON('contacts.json');
      const index = contacts.findIndex(c => c.id === id);
      if (index === -1) return res.status(404).json({ success: false, message: 'Message not found' });
      contacts[index].reviewed = reviewed;
      await writeLocalJSON('contacts.json', contacts);
      res.json({ success: true, message: 'Message review state updated', data: contacts[index] });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update message', error: err.message });
  }
});

app.delete('/api/contacts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (process.env.MONGODB_URI) {
      await Contact.findByIdAndDelete(id);
      res.json({ success: true, message: 'Message deleted successfully' });
    } else {
      let contacts = await readLocalJSON('contacts.json');
      contacts = contacts.filter(c => c.id !== id);
      await writeLocalJSON('contacts.json', contacts);
      res.json({ success: true, message: 'Message deleted successfully' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete message', error: err.message });
  }
});

// Start listening (only locally, Vercel uses module.exports)
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`BytHawk Backend running on port ${PORT}`);
    console.log(`Serving models from: ${MODELS_DIR}`);
    console.log(`Serving branding from: ${BRANDING_DIR}`);
    console.log(`Serving animations from: ${ANIMATIONS_DIR}`);
    console.log(`Serving logo from: ${LOGO_PATH}`);
    console.log(`===============================================`);
  });
}

module.exports = app;
