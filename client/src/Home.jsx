import { useEffect, useRef } from 'react';
import useWebSocket from 'react-use-websocket';
import throttle from 'lodash.throttle';
import { Cursor } from './components/Cursor';



export function Home({username}) {


    const renderCursors = users => {
        return Object.keys(users).filter(uuid => 
            users[uuid].username !== username
        ).map(uuid => {
            const user = users[uuid];

            return <Cursor key={uuid} point={[user.state.mousemove.x, user.state.mousemove.y]}/>
        })
    }

    const WS_URL = 'ws://localhost:8000'
    const {sendJsonMessage, lastJsonMessage} = useWebSocket(WS_URL, {
        queryParams: {username}
    });
    

    const sendThrottleJSONMessage = useRef(throttle(sendJsonMessage, 50));

    useEffect(() => {
        window.addEventListener("mousemove", e => {
            sendThrottleJSONMessage.current({x: e.clientX, y: e.clientY})
        })


    }, []);

    if (lastJsonMessage){

        return <>
            {JSON.stringify(lastJsonMessage)}
            <h1>Home</h1>
            <p>Welcome {username}</p>
            {
                
                renderCursors(lastJsonMessage)
            }
        </>
    }
}