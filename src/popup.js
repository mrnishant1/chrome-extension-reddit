/* START / STOP */

document.getElementById("startBtn").onclick = () => {
  chrome.runtime.sendMessage({ action: "START" });
  renderStatus(true);
};

document.getElementById("stopBtn").onclick = () => {
  chrome.runtime.sendMessage({ action: "STOP" });
  renderStatus(false);
};

async function renderStatus(forced) {
  if (typeof forced === "boolean") {
    updateStatus(forced);
    return;
  }
  const { isRunning = false } = await chrome.storage.local.get("isRunning");
  updateStatus(isRunning);
}

function updateStatus(running) {
  document.getElementById("status").textContent =
    "Status: " + (running ? "Running" : "Stopped");
  document.getElementById("startBtn").style.backgroundColor = running ? "#4CAF50" : "";
  document.getElementById("stopBtn").style.backgroundColor = !running ? "rgb(255, 60, 25)" : "";

}

async function loadKeywords() {
  const { keywords = [] } = await chrome.storage.local.get("keywords");
  const list = document.getElementById("keywordList");
  list.innerHTML = "";

  keywords.forEach((kw) => {
    const li = document.createElement("li");
    li.textContent = kw;

    const del = document.createElement("button");
    del.textContent = "✕";
    del.onclick = async () => {
      const updated = keywords.filter(k => k !== kw);
      await chrome.storage.local.set({ keywords: updated });
      chrome.runtime.sendMessage({ action: "KEYWORDS_UPDATED" });
      loadKeywords();
    };

    li.appendChild(del);
    list.appendChild(li);
  });
}

document.getElementById("addKeywordBtn").onclick = async () => {
  const input = document.getElementById("keywordInput");
  const value = input.value.trim().toLowerCase();
  if (!value) return;

  const { keywords = [] } = await chrome.storage.local.get("keywords");
  //NOTE// added spacing both side of words -------
  if (keywords.includes(" "+value+ " " )) return;

  keywords.push(value);
  await chrome.storage.local.set({ keywords });

  chrome.runtime.sendMessage({ action: "KEYWORDS_UPDATED" });

  input.value = "";
  loadKeywords();
};

document.getElementById("clearDbBtn").onclick = async () => {
  if (!confirm("Delete all stored posts?")) return;
  await clearAllPosts();
  loadPosts(); // refresh UI
};

async function clearAllPosts() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("posts", "readwrite");
    tx.objectStore("posts").clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}


/* INDEXED DB */

const DB_NAME = "MyRedditDB";
const DB_VERSION = 2; // MUST match background
const STORE_NAME = "posts";

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: "postId"
        });
        store.createIndex("seen_at", "seen_at");
        store.createIndex("subReddit", "subReddit");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}


async function loadPosts() {
  const container = document.getElementById("posts");
  container.innerHTML = "";

  const db = await openDB();
  const tx = await db.transaction(STORE_NAME, "readonly");
  const store = await tx.objectStore(STORE_NAME);
  const index = await store.index("seen_at");

  const req = index.openCursor(null, "prev");
  req.onsuccess = () => {
    const cursor = req.result;
    if (!cursor) return;

    const post = cursor.value;

    const div = document.createElement("div");
    div.innerHTML = `
      <a href="${post.postLink}" target="_blank">${post.title}</a>
      <button style="position: absolute; right: 10px;" >Delete</button>
    `;

    div.querySelector("button").onclick = async () => {
      await deletePost(post.postId);
      loadPosts();
    };

    container.appendChild(div);
    cursor.continue();
  };
}

async function deletePost(id) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).delete(id);
}


/* INIT */
renderStatus();
setInterval(() => {
  loadPosts();
}, 30*1000);

loadKeywords();

