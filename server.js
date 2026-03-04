const express = require('express');
const cors = require('cors');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const multer = require('multer');
const Tesseract = require('tesseract.js');
const path = require('path');

const app = express();
const adapter = new FileSync('db.json');
const db = low(adapter);
const upload = multer({ dest: 'uploads/' });

// Expanded DB: added 'inventory' as an object
db.defaults({ sales: [], expenses: [], inventory: {} }).write();

app.use(cors());
app.use(express.json());

// --- 1. THE SMART MESSAGE ROUTE ---
app.post('/message', (req, res) => {
    const { message, product } = req.body;
    const msg = message.toLowerCase();
    const prod = (product || "General").trim();
    const nums = (msg.match(/\d+(\.\d+)?/g) || []).map(Number);

    // Command: "stock 100" (Updates inventory for that specific item)
    if (msg.includes('stock') && nums.length >= 1) {
        db.set(`inventory.${prod}`, nums[0]).write();
        return res.json({ reply: `📦 ${prod} stock set to ${nums[0]}` });
    }

    // Command: "sale 2 50" (Units and Price)
    if (msg.includes('sale') && nums.length >= 2) {
        const units = nums[0];
        const profit = units * nums[1];
        
        // Deduct from specific product inventory
        const currentStock = db.get(`inventory.${prod}`).value() || 0;
        db.set(`inventory.${prod}`, currentStock - units).write();
        
        db.get('sales').push({ 
            product: prod, 
            units, 
            profit, 
            date: new Date(),
            note: `Sold ${units} x ${prod}` 
        }).write();
        
        return res.json({ reply: `✅ Sold ${units} ${prod} for $${profit}` });
    }

    res.json({ reply: "❌ Use: 'sale 2 50' or 'stock 100'" });
});

// --- 2. THE AI PHOTO ROUTE ---
app.post('/upload', upload.single('image'), (req, res) => {
    const prod = (req.body.product || "General").trim();
    if (!req.file) return res.status(400).json({ reply: "❌ No photo found" });

    Tesseract.recognize(path.resolve(req.file.path), 'eng')
        .then(({ data: { text } }) => {
            const nums = (text.match(/\d+(\.\d+)?/g) || []).map(Number);
            if (nums.length >= 2) {
                const units = nums[0];
                const profit = units * nums[1];
                const currentStock = db.get(`inventory.${prod}`).value() || 0;
                
                db.set(`inventory.${prod}`, currentStock - units).write();
                db.get('sales').push({ product: prod, units, profit, date: new Date() }).write();
                res.json({ reply: `📸 AI detected ${units} units of ${prod} ($${profit})` });
            } else {
                res.json({ reply: "❓ Couldn't read price/units clearly." });
            }
        }).catch(() => res.status(500).json({ reply: "❌ AI Error" }));
});

// --- 3. THE TRADER SUMMARY ---
app.get('/summary', (req, res) => {
    const sales = db.get('sales').value() || [];
    
    // Filter for TODAY only (Trader Habit Loop)
    const today = new Date().toDateString();
    const todaySales = sales.filter(s => new Date(s.date).toDateString() === today);
    const netProfit = todaySales.reduce((sum, s) => sum + s.profit, 0);

    res.json({ 
        inventory: db.get('inventory').value(),
        netProfit: netProfit,
        recentSales: sales.slice(-5).reverse()
    });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(3000, '0.0.0.0', () => console.log('🚀 IB-AI Live!'));