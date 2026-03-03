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

db.defaults({ sales: [], expenses: [], stock: 0 }).write();

app.use(cors());
app.use(express.json());

// --- 1. UPLOAD ROUTE (Moved to the top) ---
app.post('/upload', upload.single('image'), (req, res) => {
    console.log("!!! PHOTO RECEIVED BY SERVER !!!"); 
    
    if (!req.file) return res.status(400).json({ reply: "❌ No file uploaded." });

    Tesseract.recognize(path.resolve(req.file.path), 'eng')
        .then(({ data: { text } }) => {
            const numbers = text.match(/\d+(\.\d+)?/g);
            const nums = numbers ? numbers.map(Number) : [];

            if (nums.length >= 2) {
                const units = nums[0];
                const profit = units * nums[1];
                const currentStock = db.get('stock').value();
                db.set('stock', currentStock - units).write();
                db.get('sales').push({ units, price: nums[1], profit, date: new Date() }).write();
                res.json({ reply: `📸 Found: ${units} units. Profit: $${profit}` });
            } else {
                res.json({ reply: "❓ Could not find 2 numbers in the photo." });
            }
        }).catch(err => {
            console.error("OCR ERROR:", err);
            res.status(500).json({ reply: "❌ OCR Failed" });
        });
});

// --- 2. MESSAGE ROUTE ---
app.post('/message', (req, res) => {
    const msg = req.body.message.toLowerCase();
    const nums = (msg.match(/\d+(\.\d+)?/g) || []).map(Number);

    if (msg.includes('stock') && nums.length >= 1) {
        db.set('stock', nums[0]).write();
        return res.json({ reply: `📦 Stock set to ${nums[0]}` });
    }
    if (msg.includes('exp') && nums.length >= 1) {
        db.get('expenses').push({ amount: nums[0], note: msg, date: new Date() }).write();
        return res.json({ reply: `💸 Expense $${nums[0]} saved.` });
    }
    if (nums.length >= 2) {
        const profit = nums[0] * nums[1];
        const currentStock = db.get('stock').value();
        db.set('stock', currentStock - nums[0]).write();
        db.get('sales').push({ units: nums[0], price: nums[1], profit, date: new Date() }).write();
        res.json({ reply: `✅ Sale: $${profit}` });
    } else {
        res.json({ reply: "❌ Try 'stock 100' or '10 5'" });
    }
});

// --- 3. SUMMARY ROUTE ---
app.get('/summary', (req, res) => {
    const sales = db.get('sales').value() || [];
    const expenses = db.get('expenses').value() || [];
    const totalSales = sales.reduce((sum, s) => sum + s.profit, 0);
    const totalExp = expenses.reduce((sum, e) => sum + e.amount, 0);
    res.json({ 
        stock: db.get('stock').value(),
        netProfit: totalSales - totalExp,
        recentSales: sales.slice(-5).reverse()
    });
});

// --- 4. SERVE HOME PAGE ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(3000, '0.0.0.0', () => console.log('🚀 IB-AI Live at http://localhost:3000'));