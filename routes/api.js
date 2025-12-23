'use strict';

const fetch = require('node-fetch');
const mongoose = require('mongoose');
const crypto = require('crypto');

module.exports = function (app) {

  // 1. Define the Schema & Model (Internal)
  // We define it here for simplicity, but in real apps, this goes in a 'models' folder.
  const stockSchema = new mongoose.Schema({
    symbol: { type: String, required: true },
    likes: { type: Number, default: 0 },
    ips: { type: [String], default: [] } // Array to store hashed IPs
  });
  
  // Prevent OverwriteModelError if the model is already compiled
  const Stock = mongoose.models.Stock || mongoose.model('Stock', stockSchema);

  // 2. Helper: Connect to DB
mongoose.connect(process.env.DB);

  // 3. Helper: Fetch Stock Price
  async function getStockPrice(stock) {
    const response = await fetch(`https://stock-price-checker-proxy.freecodecamp.rocks/v1/stock/${stock}/quote`);
    const data = await response.json();
    return data;
  }

  // 4. Helper: Find or Create Stock in DB & Handle Likes
  async function findUpdateStock(stock, like, ip) {
    let returnedStock = await Stock.findOne({ symbol: stock });
    
    if (!returnedStock) {
      returnedStock = new Stock({ symbol: stock });
      await returnedStock.save();
    }

    if (like && !returnedStock.ips.includes(ip)) {
      returnedStock.likes++;
      returnedStock.ips.push(ip);
      await returnedStock.save();
    }
    
    return returnedStock.likes;
  }
  
  // 5. Helper: Anonymize IP
  function anonymizeIP(ip) {
    return crypto.createHash('sha256').update(ip).digest('hex');
  }

  // 6. The API Route
  app.route('/api/stock-prices')
    .get(async function (req, res) {
      const { stock, like } = req.query;
      // Handle multiple stocks (array) vs single stock (string)
      const stockSymbol = Array.isArray(stock) ? stock : [stock];
      
      const ip = anonymizeIP(req.ip); 
      const likeStock = like === 'true';

      const stockData = [];

      // Process each stock symbol requested
      for (let i = 0; i < stockSymbol.length; i++) {
        const symbol = stockSymbol[i].toUpperCase();
        const priceData = await getStockPrice(symbol);
        const likes = await findUpdateStock(symbol, likeStock, ip);
        
        stockData.push({
          stock: symbol,
          price: priceData.latestPrice,
          likes: likes
        });
      }

      // Format response based on whether 1 or 2 stocks were requested
      if (stockData.length === 1) {
        res.json({ stockData: stockData[0] });
      } else {
        // Calculate relative likes
        stockData[0].rel_likes = stockData[0].likes - stockData[1].likes;
        stockData[1].rel_likes = stockData[1].likes - stockData[0].likes;
        
        // Remove 'likes' field from response as per spec for 2 stocks
        delete stockData[0].likes;
        delete stockData[1].likes;
        
        res.json({ stockData: stockData });
      }
    });
};