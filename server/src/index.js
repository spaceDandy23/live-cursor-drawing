import http from 'http';
import { WebSocketServer } from 'ws';
import url from 'url';
import { v4 as uuidv4 } from 'uuid';
import 'dotenv/config';
import { connectDB } from './config/db.js';
import express from "express";
import cors from "cors";
import Stroke from './models/Stroke.js';
import DigestFetch from "digest-fetch";

const app = express();
const server = http.createServer(app);
const wsServer = new WebSocketServer({server});
const port = process.env.PORT || 3000;

const PUBLIC_KEY = process.env.ATLAS_PUBLIC_KEY;
const PRIVATE_KEY = process.env.ATLAS_PRIVATE_KEY;
const PROJECT_ID = process.env.ATLAS_PROJECT_ID;
const CLUSTER_NAME = process.env.ATLAS_CLUSTER_NAME;  
const HOSTNAME = process.env.ATLAS_HOST_NAME;    
const ATLAS_PORT = process.env.ATLAS_PORT;  
const DISK_NAME = process.env.ATLAS_DISK_NAME;  

const connections = {};
const users = {};

const client = new DigestFetch(PUBLIC_KEY,PRIVATE_KEY)

connectDB();
app.use(cors());
app.use(express.json());

app.post("/api/strokes",  async (req, res) => {
    const {strokes, color} = req.body;
    try{
        await Promise.all(strokes.map((stroke) => {
            const strokeToBeSaved = new Stroke({
                color: color,
                move_to: stroke.move_to,
                points: stroke.points,
                erase: stroke.erase
            });
            return strokeToBeSaved.save();
        }));
        res.status(201).json({message: "Successfully added resource"});
    }catch(e){
        console.error("Error in creating strokes", e);
        if(e.code === 28){
            return res.status(507).json({ message: "Database storage is full" });
        }
        res.status(500).json({ message: "Internal server error" });
    }   
});

app.get("/api/strokes", async (req, res) => {
    try{
        const strokes = await Stroke.find();

        res.status(201).json(strokes);
    }catch(e){
        console.error("Error in getting strokes", e);
        res.status(500).json({ message: "Internal server error" });
    }
});



const broadcast = () => {
    const allConnections =  Object.keys(connections);
    allConnections.forEach(uuid => {
        const connection = connections[uuid];
        const message = JSON.stringify(users);
        connection.send(message);
        
        
    });

}

const handleMessage = (bytes, uuid) => {
    const message = JSON.parse(bytes.toString());

    users[uuid]["state"] = message["state"];
    console.log(message);
    broadcast();


}
const handleClose = (uuid) => {

    console.log(`user: ${users[uuid]["username"]} left`);
    // users[uuid]["state"]["active"] = false;

    delete connections[uuid];
    delete users[uuid];
    broadcast();
}




wsServer.on("connection", (connection, request) => {
   const { username } = url.parse(request.url, true).query;
   const id = uuidv4();
   console.log(`Hello ${username} ur uuid is ${id}`);

    connections[id] = connection;
    users[id] = {
        username: username,
        state: {
            mousemove: {
                x: 0,
                y: 0,
            },
        }

    }
    broadcast();
    connection.on("message", message => handleMessage(message, id));
    connection.on("close", () => handleClose(id));

});

server.listen(port, () => {
    console.log(port);  
});
