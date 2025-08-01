# 🎬 Movie & TV Streaming API

This is a full-featured Express.js API server that enables searching, retrieving, and streaming movies and TV episodes using **TMDB (The Movie Database)** and **FlixHQ** as data providers. The server also includes a caching layer using **Redis** (with in-memory fallback) for improved performance.

---

## 🚀 Features

- 🔍 **Search** movies and TV shows using FlixHQ
- 🎞 **Stream** movies and TV episodes with working source links
- 🎥 **TMDB integration** for accurate metadata and images
- ⚡ **Smart caching** with Redis (or fallback to in-memory)
- 🧠 **Title matching** logic to find the best match between TMDB and FlixHQ results

---

## 🧰 Tech Stack

- **Node.js / Express**
- **TypeScript**
- **Redis** (with fallback to in-memory cache)
- **TMDB API** for metadata
- **FlixHQ** (Unofficial scraper-based provider)
- **Axios** for HTTP requests
- **CORS**, JSON body parsing middleware

---

## 📦 Setup

### 1. Clone the repository

```bash
git clone https://github.com/your-username/movie-tv-streaming-api.git
cd movie-tv-streaming-api
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create a `.env` file

```env
PORT=3000

# Redis (optional)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=yourpassword

# TMDB
TMDB_API_KEY=your_tmdb_api_key
```

---

## 🛠 Available Endpoints

### 🔎 Search
```http
GET /search?query=avengers&page=1
```

### 🎬 Get Movie Sources by TMDB ID
```http
GET /movie/:tmdbId/:server?
```

### 📺 Get TV Episode Sources
```http
GET /tv/:tmdbId/:season/:episode/:server?
```

### 📃 Get FlixHQ Media Info
```http
GET /info/:mediaId
```

### 🧪 Get Episode Streaming Sources
```http
GET /sources/:episodeId?mediaId=xyz&server=upcloud
```

---

## 🧠 Caching Logic

- Uses Redis if available, falls back to in-memory cache.
- Cache expiry per route:
  - Search: **1 hour**
  - Media Info: **6 hours**
  - Streaming Sources: **30 minutes**

---

## 💡 Title Matching Logic

Smart string comparison algorithm to detect:
- Exact title matches
- Season match (for TV)
- Year match (for movies)
- Fallback to first relevant result when strict matching fails

---

## 🐳 Docker (Optional)

If you want to run Redis and the API using Docker:

```bash
docker run -d --name redis -p 6379:6379 redis
npm run start
```

---

## 🛡 Notes

- This is for **educational or private use only**.
- FlixHQ scraping logic may break if their site structure changes.
- TMDB API has usage limits, so use an API key responsibly.

---

## 📸 Example Response

```json
{
  "tmdbId": "299534",
  "title": "Avengers: Endgame",
  "sources": [
    {
      "server": "vidcloud",
      "url": "https://streamlink...",
      "isM3U8": true,
      "quality": "1080p",
      "subtitles": []
    }
  ]
}
```

---

## ✨ Credits

- [TMDB](https://www.themoviedb.org/)
- [FlixHQ](https://flixhq.to/) (for unofficial streaming source scraping)
- Built with ❤️ by [Your Name or GitHub Handle]

---

## 📄 License

MIT License
