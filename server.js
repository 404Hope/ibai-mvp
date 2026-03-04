const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// --- CONNECT TO MONGODB ---
// REPLACE THE LINK BELOW WITH YOUR PASSWORD-UPDATED LINK
const mongoURI = "mongodb+srv://sa:Davejr14@cluster0.23e2fi8.mongodb.net/ibai?retryWrites=true&w=majority";

mongoose.connect(mongoURI).then(() => console.log("Connected to MongoDB Atlas")).catch(err => console.log("DB Error:", err));

// --- DATA MODELS ---
const SaleSchema = new mongoose.Schema({
    type: String, // 'SALE' or 'EXPENSE'
    product: String,
    units: Number,
    profit: Number,
    date: { type: Date, default: Date.now }
});

const InventorySchema = new mongoose.Schema({
    name: { type: String, unique: true },
    qty: Number,
    cost: Number
});

const Sale = mongoose.model('Sale', SaleSchema);
const Inventory = mongoose.model('Inventory', InventorySchema);

// --- LOGIC ROUTES ---

app.post('/message', async (req, res) => {
    const { message, product } = req.body;
    const msg = message.toLowerCase();
    const prod = (product || "General").trim().toLowerCase();
    const nums = (msg.match(/\d+(\.\d+)?/g) || []).map(Number);

    try {
        // 1. STOCK: "stock 50 10"
        if (msg.includes('stock') && nums.length >= 2) {
            await Inventory.findOneAndUpdate(
                { name: prod },
                { qty: nums[0], cost: nums[1] },
                { upsert: true }
            );
            return res.json({ reply: `📦 Stock updated: ${nums[0]} ${prod} at $${nums[1]} cost.` });
        }

        // 2. SALE: "sale 1 15"
        if (msg.includes('sale') && nums.length >= 2) {
            const item = await Inventory.findOne({ name: prod });
            if (!item || item.qty < nums[0]) return res.json({ reply: `⚠️ Out of stock for ${prod}!` });

            const realProfit = (nums[0] * nums[1]) - (nums[0] * item.cost);
            item.qty -= nums[0];
            await item.save();

            await Sale.create({ type: 'SALE', product: prod, units: nums[0], profit: realProfit });
            return res.json({ reply: `✅ Sold ${nums[0]} ${prod}. Profit: $${realProfit}` });
        }

        // 3. EXPENSE: "exp 20"
        if (msg.includes('exp') && nums.length >= 1) {
            await Sale.create({ type: 'EXPENSE', product: prod, profit: -nums[0] });
            return res.json({ reply: `💸 Logged $${nums[0]} expense for ${prod}.` });
        }

        res.json({ reply: "Try: 'stock 50 10' or 'sale 1 15'" });
    } catch (err) {
        res.json({ reply: "❌ Database error." });
    }
});

app.get('/summary', async (req, res) => {
    const today = new Date();
    today.setHours(0,0,0,0);

    const sales = await Sale.find({ date: { $gte: today } });
    const inventory = await Inventory.find();
    
    const netProfit = sales.reduce((sum, s) => sum + s.profit, 0);
    const invObj = {};
    inventory.forEach(i => invObj[i.name] = i.qty);

    res.json({
        netProfit: netProfit,
        inventory: invObj,
        recentSales: sales.slice(-5).reverse()
    });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));