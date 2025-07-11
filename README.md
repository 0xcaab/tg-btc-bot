# BTC 价格监控 Telegram Bot

一个简单的 Telegram 机器人，用于监控 BTC 价格并提供价格提醒功能。

## 功能

- 🔍 实时查询 BTC 价格
- 💰 记录和查看个人 BTC 持有量
- 🔔 设置价格到达提醒
- 📊 自动价格监控

## 安装

1. 克隆项目：
```bash
git clone <repository-url>
cd tg_BTC_bot
```

2. 安装依赖：
```bash
npm install
```

3. 创建 Telegram Bot：
   - 向 @BotFather 发送 `/newbot` 命令
   - 按照提示创建 bot
   - 获取 bot token

4. 配置环境变量：
   - 编辑 `.env` 文件
   - 将 `your_telegram_bot_token_here` 替换为你的实际 bot token

## 使用

启动 bot：
```bash
npm start
```

开发模式（自动重启）：
```bash
npm run dev
```

## 命令列表

- `/start` - 开始使用 bot
- `/price` - 查看当前 BTC 价格
- `/setbtc <数量>` - 设置你的 BTC 持有量
- `/mybtc` - 查看你的 BTC 持有量和价值
- `/alert <价格>` - 设置价格提醒
- `/alerts` - 查看所有价格提醒
- `/help` - 显示帮助信息

## 技术栈

- Node.js
- Telegram Bot API
- Coinbase Exchange API
- node-cron (定时任务)
- axios (HTTP 请求)

## 注意事项

- 价格数据来自 Coinbase Exchange API
- 价格监控每分钟检查一次
- 用户数据保存在本地 JSON 文件中
- 价格提醒触发后会自动删除