import { useEffect, useRef } from 'react';
import useWebSocket from 'react-use-websocket';
import throttle from 'lodash.throttle';
import { Cursor } from './components/Cursor';




export function Home({username}) {



    const canvasRef = useRef(null);
    const drawRef = useRef(false);
    const pointerBufferRef = useRef([]);


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

    const sendCurrAndBuffer = (coordinates) => {
        


        if(pointerBufferRef.current.length > 0){
            sendJsonMessage({state: {
                mousemove: coordinates, 
                move_to: pointerBufferRef.current
            }});
            pointerBufferRef.current = [];
        }


    }


    const sendThrottleJSONMessage = useRef(throttle(sendJsonMessage, 50));
    const sendCurrAndBufferThrottleMessage = useRef(throttle(sendCurrAndBuffer, 50));




    useEffect(() => {


        sendJsonMessage({
            x: 0,
            y: 0,
        });

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");    
        const rect = canvas.getBoundingClientRect(); //use this soon bruv
            
        const handleMouseMove = (e) => {
            if(drawRef.current){
                ctx.lineTo(e.offsetX, e.offsetY);
                ctx.stroke();

                pointerBufferRef.current.push({x: e.offsetX, y: e.offsetY});

                sendCurrAndBufferThrottleMessage.current({x: e.clientX, y: e.clientY});
            }      
        }



        const handleMouseDown = (e) => {
            drawRef.current = true;
            ctx.beginPath();
            ctx.moveTo(e.offsetX, e.offsetY);

        }

        const handleMouseUp = () => {
            drawRef.current = false;
        }

        const handleMouseLeave = () => {
            drawRef.current = false;
        }

        const handleWindowMouseMove = (e) => {
            sendThrottleJSONMessage.current({state: {mousemove: {x: e.clientX, y: e.clientY}}})
        }

        

        canvas.addEventListener("mouseup", handleMouseUp);
        canvas.addEventListener("mousedown", handleMouseDown);
        canvas.addEventListener("mousemove", handleMouseMove);
        canvas.addEventListener("mouseleave", handleMouseLeave);



        window.addEventListener("mousemove", handleWindowMouseMove);

        
        return () => {
            canvas.removeEventListener("mouseleave", handleMouseLeave);
            canvas.removeEventListener("mouseup", handleMouseUp);
            canvas.removeEventListener("mousedown", handleMouseDown);
            canvas.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mousemove", handleWindowMouseMove);



        }


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
        />
    </>
    );
}