const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// --- CONFIGURATION ---
const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = "mongodb+srv://trade_db:trader@cluster0.0emhjxl.mongodb.net/virtualtrader?retryWrites=true&w=majority&appName=Cluster0";
const JWT_SECRET = "your_strong_jwt_secret"; // Change this to a random string

// --- MIDDLEWARE ---
app.use(cors()); // Allow frontend to connect
app.use(express.json()); // Parse JSON bodies

// --- MONGODB MODELS ---

// User Model (MODIFIED)
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true }, // <-- ADDED
  password: { type: String, required: true },
  balance: { type: Number, default: 100000 },
  portfolio: [{
    symbol: String,
    quantity: Number,
    avgPrice: Number,
  }],
  isAdmin: { type: Boolean, default: false },
});
const User = mongoose.model('User', userSchema);

// Stock Model
const stockSchema = new mongoose.Schema({
  symbol: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  sector: { type: String, required: true },
  price: { type: Number, required: true },
});
const Stock = mongoose.model('Stock', stockSchema);

// Transaction Model
const transactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: { type: String, enum: ['BUY', 'SELL'], required: true },
  symbol: { type: String, required: true },
  quantity: { type: Number, required: true },
  price: { type: Number, required: true },
  risk: { type: String, required: true },
  date: { type: Date, default: Date.now },
});
const Transaction = mongoose.model('Transaction', transactionSchema);


// --- AUTH MIDDLEWARE ---
// This function checks for a valid token on protected routes
const auth = (req, res, next) => {
  const token = req.header('x-auth-token');
  if (!token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded.user;
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
};

// --- API ROUTES ---

// 1. AUTH ROUTES

// [POST] /api/auth/register (NEWLY ADDED)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    // Check if user already exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ msg: 'User already exists' });
    }

    // Create new user
    user = new User({
      name,
      email,
      password,
      phone
    });

    // Encrypt password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    // Save user to DB
    await user.save();

    // Create and return JWT
    const payload = {
      user: {
        id: user.id,
        isAdmin: user.isAdmin
      }
    };
    
    jwt.sign(payload, JWT_SECRET, { expiresIn: 3600 }, (err, token) => {
      if (err) throw err;
      res.json({ token });
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// [POST] /api/auth/login/user - (NEW)
app.post('/api/auth/login/user', async (req, res) => {
  try {
    const { email, password } = req.body;
    let user = await User.findOne({ email });
    
    // Check if user exists
    if (!user) {
      return res.status(400).json({ msg: 'Invalid Credentials' });
    }
    
    // Check if they are an admin
    if (user.isAdmin) {
      return res.status(403).json({ msg: 'Admins must use the admin login.' });
    }
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid Credentials' });
    }
    
    const payload = { user: { id: user.id, isAdmin: user.isAdmin } };
    jwt.sign(payload, JWT_SECRET, { expiresIn: 3600 }, (err, token) => {
      if (err) throw err;
      res.json({ token });
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// [POST] /api/auth/login/admin - (NEW)
app.post('/api/auth/login/admin', async (req, res) => {
  try {
    const { email, password } = req.body;
    let user = await User.findOne({ email });
    
    // Check if user exists
    if (!user) {
      return res.status(400).json({ msg: 'Invalid Credentials' });
    }
    
    // Check if they are NOT an admin
    if (!user.isAdmin) {
      return res.status(403).json({ msg: 'Not an authorized administrator.' });
    }
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid Credentials' });
    }
    
    const payload = { user: { id: user.id, isAdmin: user.isAdmin } };
    jwt.sign(payload, JWT_SECRET, { expiresIn: 3600 }, (err, token) => {
      if (err) throw err;
      res.json({ token });
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});


// [GET] /api/auth/me - Get logged-in user's data
app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// 2. STOCK ROUTES
// [GET] /api/stocks - Get all stocks
app.get('/api/stocks', async (req, res) => {
  try {
    const stocks = await Stock.find();
    res.json(stocks);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// 3. USER DATA ROUTES (Protected)
// [GET] /api/portfolio
app.get('/api/portfolio', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('portfolio');
    const stocks = await Stock.find();
    
    const portfolioWithData = user.portfolio.map(holding => {
      const stockData = stocks.find(s => s.symbol === holding.symbol);
      const currentPrice = stockData ? stockData.price : holding.avgPrice;
      return { ...holding.toObject(), currentPrice, name: stockData ? stockData.name : holding.symbol };
    });
    
    res.json(portfolioWithData);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// [GET] /api/transactions
app.get('/api/transactions', auth, async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.user.id }).sort({ date: -1 });
    res.json(transactions);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// [POST] /api/addfunds
app.post('/api/addfunds', auth, async (req, res) => {
  try {
    const { amount } = req.body;
    const user = await User.findById(req.user.id);
    user.balance += Number(amount);
    await user.save();
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// [POST] /api/trade
app.post('/api/trade', auth, async (req, res) => {
  try {
    const { type, symbol, quantity, price, risk } = req.body;
    const user = await User.findById(req.user.id);
    const cost = price * quantity;

    if (type === 'BUY') {
      if (user.balance < cost) {
        return res.status(400).json({ msg: 'Insufficient funds' });
      }
      user.balance -= cost;
      
      const holdingIndex = user.portfolio.findIndex(h => h.symbol === symbol);
      if (holdingIndex > -1) {
        const holding = user.portfolio[holdingIndex];
        const totalCost = (holding.avgPrice * holding.quantity) + cost;
        const totalQuantity = holding.quantity + quantity;
        holding.avgPrice = totalCost / totalQuantity;
        holding.quantity = totalQuantity;
      } else {
        user.portfolio.push({ symbol, quantity, avgPrice: price });
      }
    } else { // SELL
      const holdingIndex = user.portfolio.findIndex(h => h.symbol === symbol);
      if (holdingIndex === -1 || user.portfolio[holdingIndex].quantity < quantity) {
        return res.status(400).json({ msg: 'Insufficient shares to sell' });
      }
      
      user.balance += cost;
      const holding = user.portfolio[holdingIndex];
      holding.quantity -= quantity;
      
      if (holding.quantity === 0) {
        user.portfolio.splice(holdingIndex, 1); // Remove holding
      }
    }
    
    await user.save();
    
    const newTransaction = new Transaction({
      user: user.id, type, symbol, quantity, price, risk
    });
    await newTransaction.save();
    
    res.json(user); // Send back updated user data
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// 4. ADMIN ROUTES
const adminAuth = (req, res, next) => {
    // Auth middleware already ran, so req.user is populated
    if (!req.user || !req.user.isAdmin) {
      return res.status(403).json({ msg: 'Admin access denied' });
    }
    next();
};

// [GET] /api/admin/stats
app.get('/api/admin/stats', auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find({ isAdmin: false });
    const stocks = await Stock.find();
    
    const totalUserCount = users.length;
    const totalInvested = users.reduce((sum, user) => {
      const portfolioValue = user.portfolio.reduce((acc, holding) => {
        const stock = stocks.find(s => s.symbol === holding.symbol);
        const price = stock ? stock.price : holding.avgPrice;
        return acc + (holding.quantity * price);
      }, 0);
      return sum + portfolioValue;
    }, 0);
    
    res.json({
      totalUserCount,
      totalInvested,
      totalStocks: stocks.length
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// [GET] /api/admin/users (MODIFIED)
app.get('/api/admin/users', auth, adminAuth, async (req, res) => {
  try {
    // Explicitly select phone, though '-password' should include it.
    const users = await User.find({ isAdmin: false }).select('-password');
    res.json(users);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});


// --- DATABASE SEEDING & PRICE SIMULATION ---
const initialStockData = {
  "TCS": { name: "Tata Consultancy Services", sector: "IT", price: 3850.25 },
  "INFY": { name: "Infosys", sector: "IT", price: 1620.10 },
  "RELIANCE": { name: "Reliance Industries", sector: "Energy", price: 2910.40 },
  "HDFCBANK": { name: "HDFC Bank", sector: "Finance", price: 1530.75 },
  "ICICIBANK": { name: "ICICI Bank", sector: "Finance", price: 1105.00 },
  "TATAMOTORS": { name: "Tata Motors", sector: "Auto", price: 975.80 },
  "SUNPHARMA": { name: "Sun Pharmaceutical", sector: "Pharma", price: 1480.60 },
  "LT": { name: "Larsen & Toubro", sector: "Infra", price: 3600.30 },
};

async function seedDatabase() {
  const stockCount = await Stock.countDocuments();
  if (stockCount === 0) {
    console.log('Seeding stocks...');
    const stocksToSave = Object.entries(initialStockData).map(([symbol, data]) => ({ symbol, ...data }));
    await Stock.insertMany(stocksToSave);
  }
  
  const adminCount = await User.countDocuments({ isAdmin: true });
  if (adminCount === 0) {
    console.log('Creating admin user...');
    const adminUser = new User({
      name: 'Admin User',
      email: 'admin@trade.com',
      password: 'admin', // You should change this
      phone: 'N/A', // <-- ADDED
      isAdmin: true,
      balance: 0
    });
    const salt = await bcrypt.genSalt(10);
    adminUser.password = await bcrypt.hash(adminUser.password, salt);
    await adminUser.save();
    console.log('Admin user created: admin@trade.com / admin');
  }
}

// --- START SERVER ---
mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('MongoDB Connected...');
    await seedDatabase(); // Seed database after connection
    
    // Start the server
    app.listen(PORT, () => {
      console.log(`Server started on port ${PORT}`);
      console.log('Server is ready to accept connections');
    });
    
    // Simulate stock price changes AFTER server starts
    setInterval(async () => {
      try {
        const stocks = await Stock.find();
        for (let stock of stocks) {
          const changePercent = (Math.random() - 0.48) * 0.05; // +/- 2.5%
          stock.price = parseFloat((stock.price * (1 + changePercent)).toFixed(2));
          await stock.save();
        }
      } catch (err) {
        console.log('Error updating stock prices:', err.message);
      }
    }, 5000); // Update every 5 seconds
  })
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

