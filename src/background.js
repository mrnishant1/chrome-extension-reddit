import axios from "axios";
import * as rax from "retry-axios";
import AhoCorasick from "ahocorasick";
/* =======================
   HTTP CLIENT (AXIOS)
======================= */
const axiosInstance = axios.create({
    headers: {
        "User-Agent": "f5bot-clone/0.1 by u/Tough-Barracuda-8664",
    },
});
axiosInstance.defaults.raxConfig = {
    instance: axiosInstance,
    retry: 3,
    noResponseRetries: 2,
    backoffType: "exponential",
    retryDelay: 500,
    statusCodesToRetry: [[500, 599]],
};
rax.attach(axiosInstance);
/* =======================
   IN-MEMORY STATE
   (must be rebuilt on wake)
======================= */
let listingQueue = [];
let matcher = null;
/* =======================
   INDEXED DB
======================= */
const DB_NAME = "MyRedditDB";
const DB_VERSION = 2;
const STORE_NAME = "posts";
let db = null;
function openDB() {
    console.log("openDB called");
    return new Promise((resolve, reject) => {
        if (db)
            return resolve(db);
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const store = database.createObjectStore(STORE_NAME, {
                    keyPath: "postId",
                });
                store.createIndex("seen_at", "seen_at");
                store.createIndex("subReddit", "subReddit");
            }
        };
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        request.onerror = () => reject(request.error);
    });
}
async function saveToDB(post) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.put(post);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}
/* =======================
   KEYWORDS → MATCHER
======================= */
async function rebuildMatcher() {
    const { keywords = [] } = await chrome.storage.local.get("keywords");
    if (!Array.isArray(keywords) || keywords.length === 0) {
        matcher = null;
        return false;
    }
    matcher = new AhoCorasick(keywords.map((k) => k.toLowerCase()));
    return true;
}
/* =======================
   REDDIT FETCHING
======================= */
async function getLatestPostId(retry = 2) {
    console.log("getLatestPostId");
    try {
        const response = await axiosInstance.get("https://www.reddit.com/r/all/new.json?limit=1");
        return response.data.data.children[0].data.id;
    }
    catch (err) {
        if (retry > 0)
            return getLatestPostId(retry - 1);
        return null;
    }
}
async function getAllPosts() {
    
    const { lastSeenId } = await chrome.storage.local.get("lastSeenId");
    const newestPostId = await getLatestPostId();
    if (!newestPostId)
        return;
    let latest = parseInt(newestPostId, 36);
    const stopAt = lastSeenId ? parseInt(lastSeenId, 36) : null;
    outer: for (let i = 0; i < 20; i++) {
        console.log("fetching posts");
        const batch = [];
        for (let j = 0; j < 100; j++) {
            const id = (latest - 1).toString(36);
            if (stopAt && parseInt(id, 36) === stopAt)
                break outer;
            latest--;
            batch.push("t3_" + id);
        }
        const url = "https://api.reddit.com/api/info.json?id=" + batch.join(",");
        const response = await axiosInstance.get(url);
        for (const child of response.data.data.children) {
            if (!child.data.over_18 &&
                child.data.whitelist_status !== "promo_adult_nsfw") {
                listingQueue.push({
                    postId: child.data.name,
                    subReddit: child.data.subreddit,
                    title: child.data.title,
                    postLink: "https://reddit.com" + child.data.permalink,
                });
            }
        }
    }
    await chrome.storage.local.set({ lastSeenId: newestPostId });
}
/* =======================
   MATCHING + STORAGE
======================= */
async function matchAndStore() {
    if (!matcher)
        return;
    for (const item of listingQueue) {
        const matches = matcher.search(item.title.toLowerCase());
        if (matches.length > 0) {
            await saveToDB({
                postId: item.postId,
                subReddit: item.subReddit,
                title: item.title,
                postLink: item.postLink,
                seen_at: Date.now(),
            });
        }
    }
    listingQueue.length = 0;
}
/* =======================
   MAIN LOOP
======================= */
const ALARM_NAME = "reddit-poll";
async function startService() {
    console.log("startService called");
    await chrome.storage.local.set({ isRunning: true });
    chrome.alarms.create(ALARM_NAME, {
        periodInMinutes: 1.2, // ~70 seconds
    });
}
async function stopService() {
    await chrome.storage.local.set({ isRunning: false });
    chrome.alarms.clear(ALARM_NAME);
}
async function run() {
    const { isRunning } = await chrome.storage.local.get("isRunning");
    if (!isRunning)
        return;
    const ready = await rebuildMatcher();
    if (!ready)
        {console.log("rebuildMatcher wasn't ready, run() ABBORTED... "); return};
    await getAllPosts();
    await matchAndStore();
}
/* ===============================
   UI START/STOP/KEYWORD MESSAGES... LISTENERS
================================== */
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ isRunning: false });
});


chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "START") {
        startService();
    }
    if (msg.action === "STOP") {
        stopService();
    }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "KEYWORDS_UPDATED") {
    rebuildMatcher(); // async-safe, fire and forget
  }
});


chrome.alarms.onAlarm.addListener((alarm) => {
    console.log("alarm came, system ran");
    if (alarm.name === ALARM_NAME) {
        run();
    }
});
//# sourceMappingURL=index.js.map