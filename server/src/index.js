import http from "http";
import url from "url";
import { WebSocket, WebSocketServer } from "ws";
import { v4 as uuidv4 } from "uuid";
import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB } from "./config/db.js";
import Stroke from "./models/Stroke.js";
import { getStrokePage, PaginationInputError, parseStrokePageQuery } from "./strokes/page.js";
import { parseClientEvent } from "./realtime/protocol.js";
import { StrokeLedger } from "./realtime/stroke-ledger.js";

const app = express();
const server = http.createServer(app);
const wsServer = new WebSocketServer({ server });
const port = process.env.PORT || 3000;

const connections = {};
const users = {};
const sessions = new Map();
const SESSION_GRACE_MS = 2 * 60 * 1000;

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
});

app.post("/api/strokes", async (req, res) => {
    const { strokes, color } = req.body ?? {};

    if (!Array.isArray(strokes) || typeof color !== "string") {
        return res.status(400).json({ message: "strokes and color are required" });
    }

    try {
        await Promise.all(strokes.map((stroke) => {
            const strokeToBeSaved = new Stroke({
                color,
                move_to: stroke.move_to,
                points: stroke.points,
                erase: stroke.erase,
                clientStrokeId: typeof stroke.strokeId === "string" &&
                    stroke.strokeId.length > 0 && stroke.strokeId.length <= 128
                    ? stroke.strokeId : undefined,
            });
            return strokeToBeSaved.save();
        }));
        res.status(201).json({ message: "Successfully added resource" });
    } catch (error) {
        console.error("Error in creating strokes", error);
        if (error.code === 28) {
            return res.status(507).json({ message: "Database storage is full" });
        }
        res.status(500).json({ message: "Internal server error" });
    }
});

app.get("/api/strokes", async (req, res) => {
    try {
        const page = await getStrokePage(Stroke, parseStrokePageQuery(req.query));
        res.status(200).json(page);
    } catch (error) {
        if (error instanceof PaginationInputError) {
            return res.status(400).json({ message: error.message });
        }
        console.error("Error in getting strokes", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.post("/api/login", (req, res) => {
    const { username } = req.body ?? {};

    if (typeof username !== "string" || !username.trim()) {
        return res.status(400).json({ message: "username is required" });
    }

    const cleanUsername = username.trim();
    const usernameTaken = Object.values(users).some(
        user => user.username === cleanUsername,
    );
    if (usernameTaken) {
        return res.status(400).json({ message: "username already taken" });
    }

    res.status(201).json({ success: "username made" });
});

const sendEvent = (connection, type, payload) => {
    if (connection?.readyState === WebSocket.OPEN) {
        connection.send(JSON.stringify({ type, payload }));
    }
};

const broadcast = (type, payload, senderId) => {
    const message = JSON.stringify({ type, payload });
    Object.entries(connections).forEach(([id, connection]) => {
        if (id === senderId || connection.readyState !== WebSocket.OPEN) return;
        // Cursor positions are ephemeral; discard them for a backed-up peer.
        if (type === "cursor:move" && connection.bufferedAmount > 64 * 1024) return;
        connection.send(message);
    });
};

const handleMessage = (bytes, uuid) => {
    const user = users[uuid];
    if (!user) return;

    try {
        const { type, payload } = parseClientEvent(bytes);
        if (type === "stroke:start") user.ledger.start(payload);
        else if (type === "stroke:points") user.ledger.points(payload);
        else if (type === "stroke:end") user.ledger.end(payload);
        else if (type === "stroke:request-missing" || type === "stroke:request-full") {
            const owner = Object.values(users).find(candidate =>
                candidate.id !== uuid && candidate.ledger.strokes.has(payload.strokeId));
            if (!owner || !owner.ledger.replayTo(payload.strokeId,
                (eventType, eventPayload) => sendEvent(connections[uuid], eventType,
                    { userId: owner.id, ...eventPayload }),
                type === "stroke:request-missing" ? payload.missingSequence : null)) {
                if (owner) sendEvent(connections[owner.id], type, payload);
            }
        } else broadcast(type, { userId: uuid, ...payload }, uuid);
    } catch (error) {
        console.warn(`Ignoring invalid WebSocket event from ${uuid}: ${error.message}`);
    }
};

const handleClose = (uuid, connection) => {
    if (connections[uuid] !== connection) return;
    const user = users[uuid];
    if (user) console.log(`user: ${user.username} left`);
    delete connections[uuid];
    delete users[uuid];
    broadcast("presence:leave", { userId: uuid }, uuid);
    if (user) {
        user.expiry = setTimeout(() => {
            user.ledger.dispose();
            sessions.delete(user.sessionId);
        }, SESSION_GRACE_MS);
        user.expiry.unref?.();
    }
};

wsServer.on("connection", (connection, request) => {
    const { username: rawUsername, sessionId: rawSessionId } = url.parse(request.url, true).query;
    const username = typeof rawUsername === "string" ? rawUsername.trim() : "";

    if (!username) {
        connection.close(1008, "username is required");
        return;
    }

    const sessionId = typeof rawSessionId === "string" &&
        /^[a-f\d-]{36}$/i.test(rawSessionId) ? rawSessionId : uuidv4();
    let user = sessions.get(sessionId);
    if (user && user.username !== username) {
        connection.close(1008, "session username mismatch");
        return;
    }
    const id = user?.id ?? uuidv4();
    console.log(`Hello ${username} ur uuid is ${id}`);

    if (user?.expiry) clearTimeout(user.expiry);
    const oldConnection = connections[id];
    if (oldConnection) oldConnection.close(1000, "reconnected");
    connections[id] = connection;
    user ??= {
        id, username, sessionId,
        ledger: new StrokeLedger({
            sendOwner: (type, payload) => sendEvent(connections[id], type, payload),
            broadcast: (type, payload) => broadcast(type, { userId: id, ...payload }, id),
        }),
    };
    sessions.set(sessionId, user);
    users[id] = user;

    sendEvent(connection, "presence:sync", {
        selfId: id,
        users: Object.entries(users).filter(([userId]) => userId !== id)
            .map(([userId, user]) => ({ userId, username: user.username })),
    });
    broadcast("presence:join", { userId: id, username }, id);
    connection.on("message", message => handleMessage(message, id));
    connection.on("close", () => handleClose(id, connection));
    connection.on("error", error => {
        console.error(`WebSocket error for ${id}:`, error.message);
    });
});

const start = async () => {
    try {
        await connectDB();
        server.listen(port, () => {
            console.log(`Server listening on port ${port}`);
        });
    } catch (error) {
        console.error(`Server startup failed: ${error.message}`);
        process.exit(1);
    }
};

start();
