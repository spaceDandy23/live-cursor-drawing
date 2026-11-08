# Common Canvas

A real-time collaborative drawing app where multiple people can draw on the same canvas and see each other's cursors. Built as an independent full-stack project.

**Live demo:** https://live-cursor-drawing.vercel.app/

## Features

- Shared canvas with synchronized drawing and live cursor presence over WebSockets.
- Persistent strokes stored in MongoDB and restored when the canvas loads.
- Reconnection handling, stroke acknowledgments, and recovery of missing drawing data.
- REST endpoints for saving and retrieving canvas strokes.

## Tech stack

- **Frontend:** React, Vite, JavaScript, `react-use-websocket`.
- **Backend:** Node.js, Express, `ws` WebSocket server.
- **Database:** MongoDB with Mongoose.

## Run locally

Requires Node.js and a running MongoDB instance (or MongoDB connection string).

1. Start the backend:

```bash
cd server
npm install
```

Create `server/.env` with:

```dotenv
MONGO_URI=mongodb://127.0.0.1:27017/common_canvas
PORT=3000
```

Then run `npm start` from `server/`.

2. Start the frontend in a second terminal:

```bash
cd client
npm install
```

Create `client/.env` with:

```dotenv
VITE_WS_URL=ws://localhost:3000
VITE_HTTP_URL=http://localhost:3000
```

Then run `npm run dev` from `client/` and open the local Vite URL.

## Checks

From `server/`, run `npm test` for automated tests. With the server running, run `npm run smoke:realtime` to exercise real-time communication. From `client/`, run `npm run build` to check the production frontend build.

## Contributions

Source code and [commit history](https://github.com/spaceDandy23/live-cursor-drawing/commits/main) document the project's development.
