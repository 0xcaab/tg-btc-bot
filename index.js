require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

// 配置
const BOT_TOKEN = process.env.BOT_TOKEN;
const COINBASE_API_BASE = 'https://api.exchange.coinbase.com';
const DATA_FILE = path.join(__dirname, 'user_data.json');

// 创建 bot 实例
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

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

// 获取 BTC 价格
async function getBTCPrice() {
  try {
    const response = await axios.get(`${COINBASE_API_BASE}/products/BTC-USD/ticker`);
    return parseFloat(response.data.price);
  } catch (error) {
    console.error('获取 BTC 价格失败:', error);
    return null;
  }
}

// 格式化价格
function formatPrice(price) {
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// 命令处理函数
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username || msg.from.first_name;
  
  // 初始化用户数据
  if (!userData[chatId]) {
    userData[chatId] = {
      username: username,
      btcAmount: 0,
      alerts: []
    };
    saveUserData();
  }
  
  const welcomeMessage = `🎉 欢迎使用 BTC 价格监控机器人！

可用命令：
/price - 查看当前 BTC 价格
/setbtc <数量> - 设置你的 BTC 持有量
/mybtc - 查看你的 BTC 持有量和价值
/alert <价格> - 设置价格提醒
/alerts - 查看所有价格提醒
/help - 显示帮助信息`;
  
  bot.sendMessage(chatId, welcomeMessage);
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = `📋 命令列表：

/price - 查看当前 BTC 价格
/setbtc <数量> - 设置你的 BTC 持有量
   例如：/setbtc 0.5

/mybtc - 查看你的 BTC 持有量和价值
/alert <价格> - 设置价格提醒
   例如：/alert 50000

/alerts - 查看所有价格提醒
/help - 显示此帮助信息`;
  
  bot.sendMessage(chatId, helpMessage);
});

// 价格查询
bot.onText(/\/price/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const price = await getBTCPrice();
    if (price) {
      const message = `📊 当前 BTC 价格：${formatPrice(price)}`;
      bot.sendMessage(chatId, message);
    } else {
      bot.sendMessage(chatId, '❌ 获取价格失败，请稍后再试');
    }
  } catch (error) {
    bot.sendMessage(chatId, '❌ 获取价格失败，请稍后再试');
  }
});

// 设置 BTC 持有量
bot.onText(/\/setbtc (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const amount = parseFloat(match[1]);
  
  if (isNaN(amount) || amount < 0) {
    bot.sendMessage(chatId, '❌ 请输入有效的 BTC 数量\n例如：/setbtc 0.5');
    return;
  }
  
  if (!userData[chatId]) {
    userData[chatId] = {
      username: msg.from.username || msg.from.first_name,
      btcAmount: 0,
      alerts: []
    };
  }
  
  userData[chatId].btcAmount = amount;
  saveUserData();
  
  bot.sendMessage(chatId, `✅ 已设置你的 BTC 持有量为：${amount} BTC`);
});

// 查看 BTC 持有量
bot.onText(/\/mybtc/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!userData[chatId] || userData[chatId].btcAmount === 0) {
    bot.sendMessage(chatId, '❌ 你还没有设置 BTC 持有量\n使用 /setbtc <数量> 来设置');
    return;
  }
  
  try {
    const price = await getBTCPrice();
    if (price) {
      const btcAmount = userData[chatId].btcAmount;
      const totalValue = btcAmount * price;
      
      const message = `💰 你的 BTC 持有情况：
数量：${btcAmount} BTC
当前价格：${formatPrice(price)}
总价值：${formatPrice(totalValue)}`;
      
      bot.sendMessage(chatId, message);
    } else {
      bot.sendMessage(chatId, '❌ 获取价格失败，请稍后再试');
    }
  } catch (error) {
    bot.sendMessage(chatId, '❌ 获取价格失败，请稍后再试');
  }
});

// 设置价格提醒
bot.onText(/\/alert (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const alertPrice = parseFloat(match[1]);
  
  if (isNaN(alertPrice) || alertPrice <= 0) {
    bot.sendMessage(chatId, '❌ 请输入有效的价格\n例如：/alert 50000');
    return;
  }
  
  if (!userData[chatId]) {
    userData[chatId] = {
      username: msg.from.username || msg.from.first_name,
      btcAmount: 0,
      alerts: []
    };
  }
  
  // 检查是否已存在相同的提醒
  const existingAlert = userData[chatId].alerts.find(alert => alert.price === alertPrice);
  if (existingAlert) {
    bot.sendMessage(chatId, `❌ 你已经设置了 ${formatPrice(alertPrice)} 的价格提醒`);
    return;
  }
  
  userData[chatId].alerts.push({
    price: alertPrice,
    createdAt: new Date().toISOString()
  });
  
  saveUserData();
  
  bot.sendMessage(chatId, `🔔 已设置价格提醒：当 BTC 价格达到 ${formatPrice(alertPrice)} 时将通知你`);
});

// 查看所有提醒
bot.onText(/\/alerts/, (msg) => {
  const chatId = msg.chat.id;
  
  if (!userData[chatId] || userData[chatId].alerts.length === 0) {
    bot.sendMessage(chatId, '❌ 你还没有设置任何价格提醒\n使用 /alert <价格> 来设置');
    return;
  }
  
  const alerts = userData[chatId].alerts
    .map((alert, index) => `${index + 1}. ${formatPrice(alert.price)}`)
    .join('\n');
  
  const message = `🔔 你的价格提醒列表：\n${alerts}`;
  bot.sendMessage(chatId, message);
});

// 价格监控任务
let lastPrice = null;

cron.schedule('*/1 * * * *', async () => {
  try {
    const currentPrice = await getBTCPrice();
    if (!currentPrice) return;
    
    lastPrice = currentPrice;
    
    // 检查所有用户的价格提醒
    for (const [chatId, user] of Object.entries(userData)) {
      if (user.alerts && user.alerts.length > 0) {
        const triggeredAlerts = user.alerts.filter(alert => {
          return (lastPrice <= alert.price && currentPrice >= alert.price) ||
                 (lastPrice >= alert.price && currentPrice <= alert.price);
        });
        
        for (const alert of triggeredAlerts) {
          const message = `🚨 价格提醒！\nBTC 价格已达到 ${formatPrice(alert.price)}\n当前价格：${formatPrice(currentPrice)}`;
          bot.sendMessage(chatId, message);
          
          // 移除已触发的提醒
          user.alerts = user.alerts.filter(a => a.price !== alert.price);
        }
      }
    }
    
    saveUserData();
  } catch (error) {
    console.error('价格监控任务失败:', error);
  }
});

// 错误处理
bot.on('error', (error) => {
  console.error('Bot 错误:', error);
});

// 启动时加载用户数据
loadUserData();

console.log('🚀 BTC 价格监控机器人已启动');