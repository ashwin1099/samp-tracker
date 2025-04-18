const { MongoClient } = require('mongodb');
const samp = require('samp-query');
const express = require('express');  // Express for health check

const MONGO_URI = 'mongodb+srv://vg-bot:ashwinjr10@vg-bot.eypjth3.mongodb.net/?retryWrites=true&w=majority&appName=vG-Bot';
const DB_NAME = 'valiant';
const COLLECTION_NAME = 'players';

let client;
let playtimeCollection;
let resetDoneToday = false; // 🧠 Prevent multiple resets at midnight

// Create an Express app for the health check endpoint
const app = express();
const PORT = process.env.PORT || 8000;

app.get('/health', (req, res) => {
    res.status(200).send('App is running');
});

app.listen(PORT, () => {
    console.log(`Health check server running on port ${PORT}`);
});

// Connect to MongoDB
async function connectToMongoDB() {
    try {
        client = new MongoClient(MONGO_URI);
        await client.connect();
        const db = client.db(DB_NAME);
        playtimeCollection = db.collection(COLLECTION_NAME);
        console.log('✅ Connected to MongoDB');
    } catch (err) {
        console.error('❌ MongoDB connection error:', err);
        process.exit(1);
    }
}

// Query the SA-MP server
function querySAMP(options) {
    return new Promise((resolve, reject) => {
        samp(options, (error, response) => {
            if (error) return reject(error);
            resolve(response);
        });
    });
}

connectToMongoDB().then(() => {
    // Set interval to check every minute
    setInterval(async () => {
        const options = {
            host: '163.172.105.21',
            port: 7777
        };

        try {
            const response = await querySAMP(options);
            if (response && response.players && response.players.length > 0) {
                console.log(`📊 Players online: ${response.players.length}`);
                for (const player of response.players) {
                    const name = player.name;

                    const result = await playtimeCollection.updateOne(
                        { name },
                        { $inc: { playtime: 60 } },
                        { upsert: true }
                    );

                    if (result.upsertedCount > 0) {
                        console.log(`🆕 Added new player to DB: ${name}`);
                    } else {
                        console.log(`⏱️ Updated playtime for: ${name}`);
                    }
                }
            } else {
                console.log('⚠️ No players found in server response');
            }
        } catch (error) {
            console.error('❌ Error querying SA-MP server:', error);
        }
    }, 60000); // Every minute

    // Set interval to check and reset data every day at 00:00 UK time
    setInterval(async () => {
        const now = new Date();
        const londonTime = new Date(
            now.toLocaleString("en-US", { timeZone: "Europe/London" })
        );

        const hours = londonTime.getHours();
        const minutes = londonTime.getMinutes();
        const seconds = londonTime.getSeconds();

        // Run reset once at 00:00:00 UK time
        if (hours === 0 && minutes === 0 && seconds === 0 && !resetDoneToday) {
            try {
                await playtimeCollection.deleteMany({});
                console.log('🧹 Playtime data reset at 00:00 UK time.');
                resetDoneToday = true;
            } catch (err) {
                console.error('❌ Error resetting playtime data:', err);
            }
        }

        // Reset the flag at 00:01 so it's ready for the next day
        if (hours === 0 && minutes === 1 && resetDoneToday) {
            resetDoneToday = false;
        }
    }, 1000); // Check every second
});
