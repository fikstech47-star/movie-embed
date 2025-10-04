// send_50_requests.js
// Usage: node send_50_requests.js
// Sends 50 requests over 10 seconds (200ms apart) to:
//   http://localhost:3000/movie/{tmdb}

import axios from 'axios';

const ENDPOINT_TEMPLATE = 'http://localhost:3000/movie/%7Btmdb%7D';

const tmdbIds = [
  550, 278, 238, 680, 157336, 27205, 603, 24428, 299534, 299536,
  122, 424, 240, 272, 155, 244786, 1891, 769, 589, 497,
  496243, 240832, 118340, 424694, 206647, 122917, 140607, 100402, 2454, 315162,
  5500, 11, 4962, 135397, 181808, 118338, 13, 343611, 420818, 60300,
  278, 238, 550, 27205, 244786, 299534, 299536, 157336, 680, 603
];

const TARGET_COUNT = 50;
let ids = tmdbIds.slice(0, TARGET_COUNT);
if (ids.length < TARGET_COUNT) {
  const seedStart = 10000;
  while (ids.length < TARGET_COUNT) {
    ids.push(seedStart + ids.length);
  }
}

const totalRequests = ids.length;
const totalDurationSeconds = 10;
const intervalMs = Math.round((totalDurationSeconds * 1000) / totalRequests); // 200 ms for 50 reqs

console.log(`Will send ${totalRequests} requests over ${totalDurationSeconds}s (every ${intervalMs}ms)\n`);

const results = [];
let sent = 0;
let completed = 0;

function buildUrlForTmdb(id) {
  return ENDPOINT_TEMPLATE.replace('%7Btmdb%7D', encodeURIComponent(String(id)));
}

function sendRequest(id, idx) {
  const url = buildUrlForTmdb(id);
  const start = Date.now();
  return axios.get(url, { timeout: 15000 })
    .then(res => {
      const latency = Date.now() - start;
      const record = { index: idx, id, status: res.status, latency };
      console.log(`#${idx + 1} tmdb=${id} -> ${res.status} (${latency}ms)`);
      return record;
    })
    .catch(err => {
      const latency = Date.now() - start;
      const status = err.response ? err.response.status : 'ERR';
      const message = err.message;
      console.log(`#${idx + 1} tmdb=${id} -> ${status} (${latency}ms) error: ${message}`);
      return { index: idx, id, status, latency, error: message };
    })
    .finally(() => { completed += 1; });
}

// schedule the requests spaced by intervalMs
for (let i = 0; i < totalRequests; i++) {
  const id = ids[i];
  const delay = i * intervalMs;
  setTimeout(() => {
    sent += 1;
    sendRequest(id, i).then(rec => results.push(rec));
  }, delay);
}

// show a final summary after (totalDurationSeconds + 5) seconds
setTimeout(() => {
  console.log('\n--- Summary ---');
  console.log(`Sent: ${sent}, Completed: ${completed}`);
  const success = results.filter(r => r.status === 200).length;
  const errored = results.length - success;
  const latencies = results.filter(r => typeof r.latency === 'number').map(r => r.latency);
  const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
  console.log(`Successful (200): ${success}`);
  console.log(`Errored: ${errored}`);
  console.log(`Avg latency (ms): ${avgLatency}`);
  console.log('Raw results (first 10):', results.slice(0, 10));
  console.log('\nDone.');
}, (totalDurationSeconds + 5) * 1000);
