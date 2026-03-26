const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// 🔥 DEBUG LOG (important sa Render logs)
console.log("🔥 NEW VERSION LOADED");

// =====================
// CACHE SYSTEM
// =====================
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function getCache(key) {
    const entry = cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        return null;
    }

    return entry.data;
}

function setCache(key, data) {
    cache.set(key, {
        data,
        expiresAt: Date.now() + CACHE_TTL
    });
}

// =====================
// ROOT CHECK (FIX FOR "Not Found")
// =====================
app.get("/", (req, res) => {
    res.send("✅ Server is running (Render OK)");
});

// =====================
// GAMEPASSES ENDPOINT
// =====================
app.get("/gamepasses/:userId", async (req, res) => {
    const userId = req.params.userId;

    if (!/^\d+$/.test(userId)) {
        return res.status(400).json({ success: false, error: "Invalid userId" });
    }

    const cached = getCache(userId);
    if (cached) {
        return res.json({
            success: true,
            cached: true,
            gamepasses: cached
        });
    }

    try {
        let allPasses = [];
        let cursor = null;

        do {
            let url = `https://catalog.roblox.com/v1/search/items?category=GamePass&creatorId=${userId}&limit=30`;
            if (cursor) url += `&cursor=${cursor}`;

            const response = await axios.get(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0",
                    "Accept": "application/json",
                    "Referer": "https://www.roblox.com"
                }
            });

            const items = response.data?.data || [];

            items
                .filter(item => item.itemType === "Asset")
                .forEach(item => allPasses.push(item.id));

            cursor = response.data?.nextPageCursor || null;

        } while (cursor);

        setCache(userId, allPasses);

        res.json({
            success: true,
            cached: false,
            gamepasses: allPasses
        });

    } catch (err) {
        console.error("Gamepass Error:", err.message);

        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

// =====================
// PROXY ENDPOINT
// =====================
app.get("/proxy", async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).json({
            success: false,
            error: "Missing 'url' parameter"
        });
    }

    let parsedUrl;

    try {
        parsedUrl = new URL(targetUrl);
    } catch {
        return res.status(400).json({
            success: false,
            error: "Invalid URL"
        });
    }

    const ALLOWED_HOSTS = [
        "roblox.com",
        "catalog.roblox.com",
        "economy.roblox.com",
        "games.roblox.com"
    ];

    const hostname = parsedUrl.hostname;

    if (!ALLOWED_HOSTS.some(allowed => hostname.endsWith(allowed))) {
        return res.status(403).json({
            success: false,
            error: `Host not allowed: ${hostname}`
        });
    }

    try {
        const response = await axios.get(targetUrl, {
            timeout: 8000,
            headers: {
                "ngrok-skip-browser-warning": "true",
                "User-Agent": "Mozilla/5.0"
            }
        });

        res.json(response.data);

    } catch (err) {
        console.error("Proxy Error:", err.message);

        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

// =====================
// START SERVER
// =====================
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});