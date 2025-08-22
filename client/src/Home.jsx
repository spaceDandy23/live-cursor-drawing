import { useEffect, useRef } from 'react';
import useWebSocket from 'react-use-websocket';
import throttle from 'lodash.throttle';
import { Cursor } from './components/Cursor';




export function Home({username}) {


    // const colors = ["red", "yellow"];
    // const colorChange = useRef(0);

    const canvasesRef = useRef({});
    const canvasRef = useRef(null);
    const strokeStatusRef = useRef({});
    const drawRef = useRef(false);
    const pointerBufferRef = useRef([]);
    const moveToRef = useRef({});
    const lastLineToRef = useRef({});

    const renderCursors = users => {
    
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();

        return Object.keys(users).filter(uuid => 
            users[uuid].username !== username
        ).map(uuid => {


            const user = users[uuid];
            const { x, y } = user.state.mousemove;
            let coorX = x;
            let coorY = y;

            if(!user.state.fromWindow){
                coorX += rect.left;
                coorY += rect.top;
            }


            return <Cursor key={uuid} point={[coorX , coorY]} />;
        })
    }


    const renderDrawing = users => {



        Object.keys(users)
        .filter(uuid => users[uuid].username !== username)
        .forEach(uuid => {
            const canvas = canvasesRef.current[uuid];
            const ctx = canvas.getContext("2d");  
            let {drawing} = users[uuid].state;
            if(drawing){
                let moveTo = users[uuid].state.move_to;
                let lineTo = users[uuid].state.line_to;

                if (moveTo) {
                    moveToRef.current[uuid] = moveTo;
                }


                if(!strokeStatusRef.current[uuid]){ 
                    ctx.beginPath();
                    ctx.moveTo(moveToRef.current[uuid].x, moveToRef.current[uuid].y);
                    strokeStatusRef.current[uuid] = true;
                }
                    // colorChange.current === 1 ? colorChange.current = 0 : colorChange.current += 1;
                    // ctx.strokeStyle = colors[colorChange.current];
                if (lineTo && lineTo.length > 0) {
                    const alreadySeen = lastLineToRef.current[uuid] === lineTo;
                    if (!alreadySeen) {
                        lineTo.forEach(({x,y}) => ctx.lineTo(x, y));
                        ctx.stroke();
                        moveToRef.current[uuid] = lineTo[lineTo.length-1];
                        lastLineToRef.current[uuid] = lineTo;
                    }
                }
                        
                
                
                }
                else{
                    if(strokeStatusRef.current[uuid]){
                        strokeStatusRef.current[uuid] = false;
                    }
                }

        });

        

    }





    const WS_URL = import.meta.env.VITE_WS_URL;
    // const WS_URL = "ws://localhost:8000"
    const {sendJsonMessage, lastJsonMessage} = useWebSocket(WS_URL, {
        queryParams: {username}
    });

    const sendCurrAndBuffer = (coordinates) => {
        
        //send actual line_to

        if(pointerBufferRef.current.length > 0){
            sendJsonMessage({state: {
                mousemove: coordinates, 
                line_to: pointerBufferRef.current,
                drawing: true
            }});
            pointerBufferRef.current = [];
        }


    }


    const sendThrottleJSONMessage = useRef(throttle(sendJsonMessage, 50));
    const sendCurrAndBufferThrottleMessage = useRef(throttle(sendCurrAndBuffer, 100));




    useEffect(() => {

        

        const canvas = canvasRef.current;
        
        const ctx = canvas.getContext("2d");    

            
        const handleMouseMove = (e) => {
            if(drawRef.current){
                ctx.lineTo(e.offsetX, e.offsetY);
                ctx.stroke();

                pointerBufferRef.current.push({x: e.offsetX, y: e.offsetY});

                sendCurrAndBufferThrottleMessage.current({x: e.offsetX, y: e.offsetY});
            }      
        }
        const handleMouseDown = (e) => {
            drawRef.current = true;
            ctx.beginPath();
            ctx.moveTo(e.offsetX, e.offsetY);


            sendJsonMessage({
                state:{
                    mousemove: {
                        x: e.offsetX,
                        y: e.offsetY
                    },
                    move_to: {x: e.offsetX, y: e.offsetY},
                    line_to: [],
                    drawing: true
                }
            })

        }

        const handleMouseUp = (e) => {
            drawRef.current = false;
            sendCurrAndBufferThrottleMessage.current.flush();
            sendJsonMessage({
                state:{
                    mousemove: {
                        x: e.offsetX,
                        y: e.offsetY
                    },
                    line_to: [],
                    drawing: false,
                },
            });


        }

        // const handleMouseLeave = (e) => {
        //     drawRef.current = false;
        //     sendCurrAndBufferThrottleMessage.current.flush();
        //     sendJsonMessage({
        //         state:{
        //             mousemove: {
        //                 x: e.offsetX,
        //                 y: e.offsetY
        //             },
        //             line_to: [],
        //             drawing: false
        //         }
        //     })
        // }

        const handleWindowMouseMove = (e) => {
            if(!drawRef.current){
                sendThrottleJSONMessage.current({state: {mousemove: {x: e.clientX, y: e.clientY}, fromWindow: true}})
            }

        }

        

        canvas.addEventListener("mouseup", handleMouseUp);
        canvas.addEventListener("mousedown", handleMouseDown);
        canvas.addEventListener("mousemove", handleMouseMove);
        // canvas.addEventListener("mouseleave", handleMouseLeave);



        window.addEventListener("mousemove", handleWindowMouseMove);

        
        return () => {
            // canvas.removeEventListener("mouseleave", handleMouseLeave);
            canvas.removeEventListener("mouseup", handleMouseUp);
            canvas.removeEventListener("mousedown", handleMouseDown);
            canvas.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mousemove", handleWindowMouseMove);



        }


    }, []);


    useEffect(() => {
        if (lastJsonMessage) {
            renderDrawing(lastJsonMessage);
        }
    }, [lastJsonMessage])



    return (
    <>
        <h1>Home</h1>
        <p>Welcome {username}</p>
        {lastJsonMessage && (
        <>
            {/* {JSON.stringify(lastJsonMessage)} */}
            {renderCursors(lastJsonMessage)}
        </>
        )}

        <canvas
        ref={canvasRef}
        height={480}
        width={480}
        style={{ position: 'absolute', border: '1px solid black', cursor: 'crosshair', zIndex: 1 }}
        />
        {lastJsonMessage && Object.keys(lastJsonMessage)
        .filter(uuid => lastJsonMessage[uuid].username !== username) 
        .map(uuid => (
            <canvas
            key={uuid}
            ref={el => {
                if (el) canvasesRef.current[uuid] = el;
                else delete canvasesRef.current[uuid]; 
            }}
            height={480}
            width={480}
            style={{
                position: 'absolute',
                border: '1px solid black',
                cursor: 'crosshair',
                zIndex: -1
            }}
            />
        ))}

    </>
    );
}