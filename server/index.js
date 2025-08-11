import http from 'http';
import { WebSocketServer } from 'ws';
import url from 'url';
import { v4 as uuidv4 } from 'uuid';

const server = http.createServer();
const wsServer = new WebSocketServer({server});
const port = 8000;

const connections = {};
const users = {};

const broadcast = () => {
    Object.keys(connections).forEach(uuid => {
        const connection = connections[uuid];
        const message = JSON.stringify(users);
        connection.send(message);
        
        
    });
}

const handleMessage = (bytes, uuid) => {
    const message = JSON.parse(bytes.toString());


    users[uuid]["state"]["mousemove"] = message["mousemove"];
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
   console.log(`Hello my nigga ${username} ur uuid is ${id}`);

    connections[id] = connection;
    users[id] = {
        username: username,
        state: {
            mousemove: {
                x: 0,
                y: 0,
            },
            line_to: {
                x: 0,
                y: 0
            },
            move_to: {
                x: 0,
                y: 0
            }
        }

    }
    broadcast();
    connection.on("message", message => handleMessage(message, id));
    connection.on("close", () => handleClose(id));

});

server.listen(port, () => {
    console.log(port);  
});
