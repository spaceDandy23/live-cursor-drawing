import { useEffect, useRef } from 'react';
import useWebSocket from 'react-use-websocket';
import throttle from 'lodash.throttle';
import { Cursor } from './components/Cursor';



export function Home({username}) {



    const canvasRef = useRef(null);

    const handleMouseMove = (e) => {

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        const rect = canvas.getBoundingClientRect();
        



        
    }

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

        sendJsonMessage({
            x: 0,
            y: 0,
        });






        window.addEventListener("mousemove", e => {
            sendThrottleJSONMessage.current({x: e.clientX, y: e.clientY})
        });

        


    }, []);

    return (
    <>
        {lastJsonMessage && (
        <>
            {JSON.stringify(lastJsonMessage)}
            <h1>Home</h1>
            <p>Welcome {username}</p>
            {renderCursors(lastJsonMessage)}
        </>
        )}

        <canvas
        ref={canvasRef}
        height={480}
        width={480}
        
        style={{ border: '1px solid black', cursor: 'crosshair' }}
        onMouseMove={handleMouseMove}
        />
    </>
    );
}