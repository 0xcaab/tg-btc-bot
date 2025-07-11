require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

// 配置
const BOT_TOKEN = process.env.BOT_TOKEN;
const COINBASE_API_BASE = 'https://api.exchange.coinbase.com';
const COINGECKO_API_BASE = 'https://api.coingecko.com/api/v3';
const DATA_FILE = path.join(__dirname, 'user_data.json');

// 创建 bot 实例
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// 支持的加密货币
const SUPPORTED_COINS = {
  'BTC': { name: 'Bitcoin', symbol: 'BTC', coinbaseId: 'BTC-USD', geckoId: 'bitcoin' },
  'ETH': { name: 'Ethereum', symbol: 'ETH', coinbaseId: 'ETH-USD', geckoId: 'ethereum' },
  'LTC': { name: 'Litecoin', symbol: 'LTC', coinbaseId: 'LTC-USD', geckoId: 'litecoin' },
  'ADA': { name: 'Cardano', symbol: 'ADA', coinbaseId: 'ADA-USD', geckoId: 'cardano' },
  'DOT': { name: 'Polkadot', symbol: 'DOT', coinbaseId: 'DOT-USD', geckoId: 'polkadot' },
  'LINK': { name: 'Chainlink', symbol: 'LINK', coinbaseId: 'LINK-USD', geckoId: 'chainlink' },
  'XRP': { name: 'Ripple', symbol: 'XRP', coinbaseId: 'XRP-USD', geckoId: 'ripple' }
};

// 用户数据存储
let userData = {};

// 加载用户数据
function loadUserData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      userData = JSON.parse(data);
    }
  } catch (error) {
    console.log('初始化用户数据文件');
    userData = {};
  }
}

// 保存用户数据
function saveUserData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(userData, null, 2));
  } catch (error) {
    console.error('保存用户数据失败:', error);
  }
}

// 获取单个币种价格 (Coinbase)
async function getCoinPrice(symbol) {
  try {
    const coin = SUPPORTED_COINS[symbol.toUpperCase()];
    if (!coin) return null;
    
    const response = await axios.get(`${COINBASE_API_BASE}/products/${coin.coinbaseId}/ticker`);
    return {
      price: parseFloat(response.data.price),
      volume: parseFloat(response.data.volume),
      symbol: symbol.toUpperCase()
    };
  } catch (error) {
    console.error(`获取 ${symbol} 价格失败:`, error);
    return null;
  }
}

// 获取币种详细信息 (CoinGecko)
async function getCoinDetails(symbol) {
  try {
    const coin = SUPPORTED_COINS[symbol.toUpperCase()];
    if (!coin) return null;
    
    const response = await axios.get(`${COINGECKO_API_BASE}/simple/price`, {
      params: {
        ids: coin.geckoId,
        vs_currencies: 'usd',
        include_24hr_change: true,
        include_market_cap: true,
        include_24hr_vol: true
      }
    });
    
    const data = response.data[coin.geckoId];
    return {
      symbol: symbol.toUpperCase(),
      name: coin.name,
      price: data.usd,
      change24h: data.usd_24h_change,
      marketCap: data.usd_market_cap,
      volume24h: data.usd_24h_vol
    };
  } catch (error) {
    // 如果 CoinGecko 失败，回退到 Coinbase
    return await getCoinPrice(symbol);
  }
}

// 格式化价格
function formatPrice(price) {
  if (price >= 1000) {
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } else {
    return `$${price.toFixed(6)}`;
  }
}

// 格式化百分比
function formatPercentage(percentage) {
  if (!percentage) return 'N/A';
  const sign = percentage >= 0 ? '+' : '';
  const emoji = percentage >= 0 ? '📈' : '📉';
  return `${emoji} ${sign}${percentage.toFixed(2)}%`;
}

// 格式化市值
function formatMarketCap(marketCap) {
  if (!marketCap) return 'N/A';
  if (marketCap >= 1e12) {
    return `$${(marketCap / 1e12).toFixed(2)}T`;
  } else if (marketCap >= 1e9) {
    return `$${(marketCap / 1e9).toFixed(2)}B`;
  } else if (marketCap >= 1e6) {
    return `$${(marketCap / 1e6).toFixed(2)}M`;
  }
  return formatPrice(marketCap);
}

// 初始化用户数据
function initUserData(chatId, username) {
  if (!userData[chatId]) {
    userData[chatId] = {
      username: username,
      portfolio: {},
      alerts: [],
      settings: {
        dailyReport: false,
        reportTime: '09:00'
      }
    };
    saveUserData();
  }
}

// 命令处理函数
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username || msg.from.first_name;
  
  initUserData(chatId, username);
  
  const supportedCoins = Object.keys(SUPPORTED_COINS).join(', ');
  const welcomeMessage = `🎉 欢迎使用加密货币价格监控机器人！

🪙 支持的币种：${supportedCoins}

📊 主要功能：
/price [币种] - 查看价格（如：/price BTC）
/portfolio - 查看投资组合
/set [币种] [数量] - 设置持有量
/alert [币种] [价格] - 设置价格提醒
/market - 查看市场概览
/daily - 切换每日报告
/help - 显示所有命令`;
  
  bot.sendMessage(chatId, welcomeMessage);
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const supportedCoins = Object.keys(SUPPORTED_COINS).join(', ');
  const helpMessage = `📋 完整命令列表：

💰 价格查询：
/price [币种] - 查看实时价格和变化
   例如：/price BTC 或 /price

📊 投资组合：
/portfolio - 查看完整投资组合
/set [币种] [数量] - 设置持有量
   例如：/set BTC 0.5
/remove [币种] - 移除持有记录

🔔 价格提醒：
/alert [币种] [价格] - 设置价格提醒
   例如：/alert BTC 50000
/alerts - 查看所有提醒
/removealert [编号] - 删除指定提醒

📈 市场信息：
/market - 查看市场概览
/top - 查看热门币种排行

⚙️ 设置：
/daily - 开启/关闭每日报告
/settings - 查看当前设置

支持币种：${supportedCoins}`;
  
  bot.sendMessage(chatId, helpMessage);
});

// 价格查询（支持多币种）
bot.onText(/\/price(?:\s+(\w+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const symbol = match[1] ? match[1].toUpperCase() : 'BTC';
  
  if (!SUPPORTED_COINS[symbol]) {
    const supportedCoins = Object.keys(SUPPORTED_COINS).join(', ');
    bot.sendMessage(chatId, `❌ 不支持的币种：${symbol}\n支持的币种：${supportedCoins}`);
    return;
  }
  
  try {
    bot.sendMessage(chatId, '⏳ 获取价格数据中...');
    const coinData = await getCoinDetails(symbol);
    
    if (coinData) {
      const message = `📊 ${coinData.name} (${coinData.symbol}) 价格信息：

💰 当前价格：${formatPrice(coinData.price)}
📈 24小时变化：${formatPercentage(coinData.change24h)}
📊 市值：${formatMarketCap(coinData.marketCap)}
💱 24h交易量：${formatMarketCap(coinData.volume24h)}

🕐 更新时间：${new Date().toLocaleTimeString('zh-CN')}`;
      
      bot.sendMessage(chatId, message);
    } else {
      bot.sendMessage(chatId, '❌ 获取价格失败，请稍后再试');
    }
  } catch (error) {
    bot.sendMessage(chatId, '❌ 获取价格失败，请稍后再试');
  }
});

// 设置持有量
bot.onText(/\/set\s+(\w+)\s+([\d.]+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const symbol = match[1].toUpperCase();
  const amount = parseFloat(match[2]);
  
  if (!SUPPORTED_COINS[symbol]) {
    const supportedCoins = Object.keys(SUPPORTED_COINS).join(', ');
    bot.sendMessage(chatId, `❌ 不支持的币种：${symbol}\n支持的币种：${supportedCoins}`);
    return;
  }
  
  if (isNaN(amount) || amount < 0) {
    bot.sendMessage(chatId, '❌ 请输入有效的数量\n例如：/set BTC 0.5');
    return;
  }
  
  initUserData(chatId, msg.from.username || msg.from.first_name);
  
  userData[chatId].portfolio[symbol] = amount;
  saveUserData();
  
  const coinName = SUPPORTED_COINS[symbol].name;
  bot.sendMessage(chatId, `✅ 已设置 ${coinName} (${symbol}) 持有量：${amount} ${symbol}`);
});

// 查看投资组合
bot.onText(/\/portfolio/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!userData[chatId] || Object.keys(userData[chatId].portfolio).length === 0) {
    bot.sendMessage(chatId, '❌ 你还没有设置任何持有量\n使用 /set [币种] [数量] 来设置\n例如：/set BTC 0.5');
    return;
  }
  
  try {
    bot.sendMessage(chatId, '⏳ 计算投资组合价值中...');
    
    let totalValue = 0;
    let portfolioText = '💰 你的投资组合：\n\n';
    
    for (const [symbol, amount] of Object.entries(userData[chatId].portfolio)) {
      const coinData = await getCoinDetails(symbol);
      if (coinData && amount > 0) {
        const value = amount * coinData.price;
        totalValue += value;
        
        portfolioText += `${SUPPORTED_COINS[symbol].name} (${symbol}):\n`;
        portfolioText += `  💎 持有量：${amount} ${symbol}\n`;
        portfolioText += `  💰 当前价格：${formatPrice(coinData.price)}\n`;
        portfolioText += `  📈 24h变化：${formatPercentage(coinData.change24h)}\n`;
        portfolioText += `  💵 价值：${formatPrice(value)}\n\n`;
      }
    }
    
    portfolioText += `🏆 总价值：${formatPrice(totalValue)}`;
    
    bot.sendMessage(chatId, portfolioText);
  } catch (error) {
    bot.sendMessage(chatId, '❌ 获取投资组合数据失败，请稍后再试');
  }
});

// 设置价格提醒
bot.onText(/\/alert\s+(\w+)\s+([\d.]+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const symbol = match[1].toUpperCase();
  const alertPrice = parseFloat(match[2]);
  
  if (!SUPPORTED_COINS[symbol]) {
    const supportedCoins = Object.keys(SUPPORTED_COINS).join(', ');
    bot.sendMessage(chatId, `❌ 不支持的币种：${symbol}\n支持的币种：${supportedCoins}`);
    return;
  }
  
  if (isNaN(alertPrice) || alertPrice <= 0) {
    bot.sendMessage(chatId, '❌ 请输入有效的价格\n例如：/alert BTC 50000');
    return;
  }
  
  initUserData(chatId, msg.from.username || msg.from.first_name);
  
  // 检查是否已存在相同的提醒
  const existingAlert = userData[chatId].alerts.find(
    alert => alert.symbol === symbol && alert.price === alertPrice
  );
  if (existingAlert) {
    bot.sendMessage(chatId, `❌ 你已经设置了 ${symbol} ${formatPrice(alertPrice)} 的价格提醒`);
    return;
  }
  
  userData[chatId].alerts.push({
    symbol: symbol,
    price: alertPrice,
    createdAt: new Date().toISOString()
  });
  
  saveUserData();
  
  const coinName = SUPPORTED_COINS[symbol].name;
  bot.sendMessage(chatId, `🔔 已设置 ${coinName} (${symbol}) 价格提醒：${formatPrice(alertPrice)}`);
});

// 查看所有提醒
bot.onText(/\/alerts/, (msg) => {
  const chatId = msg.chat.id;
  
  if (!userData[chatId] || userData[chatId].alerts.length === 0) {
    bot.sendMessage(chatId, '❌ 你还没有设置任何价格提醒\n使用 /alert [币种] [价格] 来设置');
    return;
  }
  
  const alerts = userData[chatId].alerts
    .map((alert, index) => {
      const coinName = SUPPORTED_COINS[alert.symbol].name;
      return `${index + 1}. ${coinName} (${alert.symbol})：${formatPrice(alert.price)}`;
    })
    .join('\n');
  
  const message = `🔔 你的价格提醒列表：\n\n${alerts}\n\n使用 /removealert [编号] 删除提醒`;
  bot.sendMessage(chatId, message);
});

// 市场概览
bot.onText(/\/market/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    bot.sendMessage(chatId, '⏳ 获取市场数据中...');
    
    const topCoins = ['BTC', 'ETH', 'LTC'];
    let marketText = '📈 加密货币市场概览：\n\n';
    
    for (const symbol of topCoins) {
      const coinData = await getCoinDetails(symbol);
      if (coinData) {
        marketText += `${coinData.name} (${symbol}):\n`;
        marketText += `  💰 ${formatPrice(coinData.price)}\n`;
        marketText += `  📈 ${formatPercentage(coinData.change24h)}\n`;
        marketText += `  📊 市值：${formatMarketCap(coinData.marketCap)}\n\n`;
      }
    }
    
    marketText += `🕐 更新时间：${new Date().toLocaleTimeString('zh-CN')}`;
    
    bot.sendMessage(chatId, marketText);
  } catch (error) {
    bot.sendMessage(chatId, '❌ 获取市场数据失败，请稍后再试');
  }
});

// 每日报告设置
bot.onText(/\/daily/, (msg) => {
  const chatId = msg.chat.id;
  
  initUserData(chatId, msg.from.username || msg.from.first_name);
  
  userData[chatId].settings.dailyReport = !userData[chatId].settings.dailyReport;
  saveUserData();
  
  const status = userData[chatId].settings.dailyReport ? '开启' : '关闭';
  const message = userData[chatId].settings.dailyReport 
    ? `✅ 每日报告已开启！每天早上9点将发送市场摘要` 
    : `❌ 每日报告已关闭`;
    
  bot.sendMessage(chatId, message);
});

// 价格监控任务
let lastPrices = {};

cron.schedule('*/2 * * * *', async () => {
  try {
    // 获取所有支持币种的价格
    for (const symbol of Object.keys(SUPPORTED_COINS)) {
      const currentPrice = await getCoinPrice(symbol);
      if (!currentPrice) continue;
      
      // 检查所有用户的价格提醒
      for (const [chatId, user] of Object.entries(userData)) {
        if (user.alerts && user.alerts.length > 0) {
          const triggeredAlerts = user.alerts.filter(alert => {
            if (alert.symbol !== symbol) return false;
            
            const lastPrice = lastPrices[symbol];
            if (!lastPrice) return false;
            
            return (lastPrice.price <= alert.price && currentPrice.price >= alert.price) ||
                   (lastPrice.price >= alert.price && currentPrice.price <= alert.price);
          });
          
          for (const alert of triggeredAlerts) {
            const coinName = SUPPORTED_COINS[alert.symbol].name;
            const message = `🚨 ${coinName} (${alert.symbol}) 价格提醒！
目标价格：${formatPrice(alert.price)}
当前价格：${formatPrice(currentPrice.price)}`;
            
            bot.sendMessage(chatId, message);
            
            // 移除已触发的提醒
            user.alerts = user.alerts.filter(a => !(a.symbol === alert.symbol && a.price === alert.price));
          }
        }
      }
      
      lastPrices[symbol] = currentPrice;
    }
    
    saveUserData();
  } catch (error) {
    console.error('价格监控任务失败:', error);
  }
});

// 每日报告任务
cron.schedule('0 9 * * *', async () => {
  try {
    const dailyUsers = Object.entries(userData).filter(([chatId, user]) => user.settings.dailyReport);
    
    if (dailyUsers.length === 0) return;
    
    // 生成市场报告
    const topCoins = ['BTC', 'ETH', 'LTC'];
    let reportText = '📊 每日市场报告：\n\n';
    
    for (const symbol of topCoins) {
      const coinData = await getCoinDetails(symbol);
      if (coinData) {
        reportText += `${coinData.name} (${symbol}):\n`;
        reportText += `  💰 ${formatPrice(coinData.price)}\n`;
        reportText += `  📈 ${formatPercentage(coinData.change24h)}\n\n`;
      }
    }
    
    reportText += `📅 ${new Date().toLocaleDateString('zh-CN')}`;
    
    // 发送给所有开启每日报告的用户
    for (const [chatId, user] of dailyUsers) {
      bot.sendMessage(chatId, reportText);
    }
  } catch (error) {
    console.error('每日报告任务失败:', error);
  }
});

// 错误处理
bot.on('error', (error) => {
  console.error('Bot 错误:', error);
});

// 启动时加载用户数据
loadUserData();

console.log('🚀 加密货币价格监控机器人已启动');