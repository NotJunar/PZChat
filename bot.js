const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const dotenv = require('dotenv');
const axios = require('axios');

dotenv.config();

const db = new sqlite3.Database(':memory:', (err) => {
    if (err) {
        console.error('Could not connect to SQLite database:', err);
    } else {
        console.log('Connected to SQLite database');
        db.run(`CREATE TABLE IF NOT EXISTS users (
            userId TEXT PRIMARY KEY,
            balance INTEGER DEFAULT 1000,
            dailyClaimed INTEGER DEFAULT 0,
            workClaimed INTEGER DEFAULT 0
        )`);
    }
});

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

const cooldowns = {
    daily: new Map(),
    work: new Map(),
};

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    db.get('SELECT * FROM users WHERE userId = ?', [message.author.id], (err, user) => {
        if (err) {
            console.error(err);
            return;
        }
        if (!user) {
            db.run('INSERT INTO users (userId) VALUES (?)', [message.author.id]);
        }

        switch (command) {
            case 'help':
                const helpEmbed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('PZChatFun Commands')
                    .setDescription('List of available commands:')
                    .addFields(
                        { name: '!balance', value: 'Check your balance' },
                        { name: '!daily', value: 'Claim your daily reward (Cooldown: 24h)' },
                        { name: '!pay @user amount', value: 'Pay a user' },
                        { name: '!work', value: 'Work to earn money (Cooldown: 1h)' },
                        { name: '!gamble amount', value: 'Gamble some of your money' },
                        { name: '!meme', value: 'Get a random meme' },
                        { name: '!joke', value: 'Get a random joke' },
                        { name: '!quote', value: 'Get a random quote' },
                        { name: '!flipcoin', value: 'Flip a coin and see the result!' },
                        { name: '!poll question', value: 'Create a poll with a question' },
                        { name: '!roll dice', value: 'Roll a six-sided dice' },
                        { name: '!fact', value: 'Get a random fact' },
                        { name: '!imagine', value: 'Generate a random imaginary image' }
                    );
                message.reply({ embeds: [helpEmbed] });
                break;

            case 'balance':
                db.get('SELECT balance FROM users WHERE userId = ?', [message.author.id], (err, user) => {
                    if (err) {
                        console.error(err);
                        return;
                    }
                    const balanceEmbed = new EmbedBuilder()
                        .setColor('#0099ff')
                        .setTitle('Balance')
                        .setDescription(`Your current balance is 💰 **${user.balance}** coins.`);
                    message.reply({ embeds: [balanceEmbed] });
                });
                break;

            case 'daily':
                const now = Math.floor(Date.now() / 1000);
                if (cooldowns.daily.has(message.author.id)) {
                    const remainingTime = cooldowns.daily.get(message.author.id) - now;
                    return message.reply(`⏳ You can claim your daily reward in ${Math.ceil(remainingTime / 60)} minutes.`);
                }

                db.get('SELECT dailyClaimed FROM users WHERE userId = ?', [message.author.id], (err, user) => {
                    if (user && user.dailyClaimed + 86400 < now) {
                        const reward = 500;
                        db.run('UPDATE users SET balance = balance + ?, dailyClaimed = ? WHERE userId = ?', [reward, now, message.author.id]);
                        cooldowns.daily.set(message.author.id, now + 86400);
                        message.reply(`🎉 You claimed your daily reward of 💰 **${reward}** coins!`);
                    } else {
                        const timeLeft = (user.dailyClaimed + 86400) - now;
                        message.reply(`⏳ You can claim your daily reward in ${Math.ceil(timeLeft / 60)} minutes.`);
                    }
                });
                break;

            case 'work':
                const earned = Math.floor(Math.random() * 100) + 1;
                now = new Date().toISOString();

                db.run('UPDATE users SET balance = balance + ?, workClaimed = ? WHERE userId = ?', [earned, now, message.author.id], function(err) {
                    if (err) {
                        console.error(err.message);
                        return message.reply('There was an error processing your work claim.');
                    }

                    message.reply(`You earned ${earned} coins!`);
                });
                break;

            case 'pay':
                const recipient = message.mentions.users.first();
                const amountToPay = parseInt(args[1]);

                if (!recipient) {
                    message.reply('❌ Please mention a user to pay.');
                    return;
                }
                if (isNaN(amountToPay) || amountToPay <= 0) {
                    message.reply('❌ Please enter a valid amount to pay.');
                    return;
                }
                db.get('SELECT balance FROM users WHERE userId = ?', [message.author.id], (err, user) => {
                    if (user.balance < amountToPay) {
                        message.reply('❌ You do not have enough balance to pay this amount.');
                    } else {
                        db.run('UPDATE users SET balance = balance - ? WHERE userId = ?', [amountToPay, message.author.id]);
                        db.run('INSERT INTO users (userId, balance) VALUES (?, ?) ON CONFLICT(userId) DO UPDATE SET balance = balance + ?', [recipient.id, amountToPay, amountToPay]);
                        message.reply(`✅ You paid 💰 **${amountToPay}** coins to <@${recipient.id}>!`);
                    }
                });
                break;

            case 'gamble':
                const gambleAmount = parseInt(args[1]);

                if (isNaN(gambleAmount) || gambleAmount <= 0) {
                    message.reply('❌ Please enter a valid amount to gamble.');
                    return;
                }
                db.get('SELECT balance FROM users WHERE userId = ?', [message.author.id], (err, user) => {
                    if (user.balance < gambleAmount) {
                        message.reply('❌ You do not have enough balance to gamble this amount.');
                    } else {
                        const win = Math.random() < 0.5;
                        if (win) {
                            const winnings = gambleAmount * 2;
                            db.run('UPDATE users SET balance = balance + ? WHERE userId = ?', [winnings, message.author.id]);
                            message.reply(`🎰 You won! You now have 💰 **${user.balance + winnings}** coins.`);
                        } else {
                            db.run('UPDATE users SET balance = balance - ? WHERE userId = ?', [gambleAmount, message.author.id]);
                            message.reply(`🎰 You lost! You now have 💰 **${user.balance - gambleAmount}** coins.`);
                        }
                    }
                });
                break;

            case 'meme':
                axios.get('https://meme-api.com/gimme')
                    .then(response => {
                        const memeEmbed = new EmbedBuilder()
                            .setColor('#0099ff')
                            .setTitle(response.data.title)
                            .setImage(response.data.url);
                        message.reply({ embeds: [memeEmbed] });
                    })
                    .catch(err => {
                        console.error(err);
                        message.reply('❌ Could not fetch meme at this moment.');
                    });
                break;

            case 'joke':
                axios.get('https://official-joke-api.appspot.com/random_joke')
                    .then(response => {
                        message.reply(`${response.data.setup} \n\n ${response.data.punchline} 😂`);
                    })
                    .catch(err => {
                        console.error(err);
                        message.reply('❌ Could not fetch joke at this moment.');
                    });
                break;

            case 'quote':
                axios.get('https://api.quotable.io/random')
                    .then(response => {
                        const quoteEmbed = new EmbedBuilder()
                            .setColor('#0099ff')
                            .setDescription(`"${response.data.content}" \n- **${response.data.author}**`);
                        message.reply({ embeds: [quoteEmbed] });
                    })
                    .catch(err => {
                        console.error(err);
                        message.reply('❌ Could not fetch quote at this moment.');
                    });
                break;

            case 'flipcoin':
                const coinFlipResult = Math.random() < 0.5 ? 'Heads' : 'Tails';
                message.reply(`🪙 Coin flip result: **${coinFlipResult}**`);
                break;

            case 'poll':
                const pollQuestion = args.join(' ');
                if (!pollQuestion) {
                    message.reply('❌ Please provide a question for the poll.');
                    return;
                }
                message.reply(`🗳️ Poll: ${pollQuestion}`);
                break;

            case 'roll':
                const diceRoll = Math.floor(Math.random() * 6) + 1;
                message.reply(`🎲 You rolled a **${diceRoll}**!`);
                break;

            case 'fact':
                axios.get('https://api.api-ninjas.com/v1/facts?limit=1', { headers: { 'X-Api-Key': process.env.NINJAS_API_KEY } })
                    .then(response => {
                        message.reply(`📜 Fact: ${response.data[0].fact}`);
                    })
                    .catch(err => {
                        console.error(err);
                        message.reply('❌ Could not fetch fact at this moment.');
                    });
                break;

            case 'imagine':
                const imagineUrl = 'https://via.placeholder.com/150'; // Placeholder URL
                const imagineEmbed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setImage(imagineUrl);
                message.reply({ embeds: [imagineEmbed] });
                break;

            default:
                message.reply('❌ Command not recognized. Type !help for a list of commands.');
        }
    });
});

client.login(process.env.BOT_TOKEN);
