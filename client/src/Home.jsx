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
    const batchSigRef = useRef({});
    const modeRef = useRef(false);

    const strokes = useRef([]);
    const stroke = useRef([]);
    const prevStrokes = useRef([]);

    const lastMousePos = useRef({});

    const userStrokes = useRef({});
    const userStroke = useRef({});
 
    const isOutsideCanvas = useRef(false);

    // const WS_URL = import.meta.env.VITE_WS_URL;
    const WS_URL = "ws://localhost:8000"
    const {sendJsonMessage, lastJsonMessage} = useWebSocket(WS_URL, {
        queryParams: {username}
    });




    const renderCursors = users => {

    
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();

        return Object.keys(users).filter(uuid => 
            users[uuid].username !== username
        ).map(uuid => {


            const user = users[uuid];
            const { x, y } = user.state.mousemove || lastMousePos.current[uuid];
            lastMousePos.current[uuid] = {x , y};
            let coorX = x;
            let coorY = y;

            if(!user.state.fromWindow){
                coorX += rect.left;
                coorY += rect.top;
            }


            return <Cursor key={uuid} point={[coorX , coorY]} />;
        })
    }

    const reDrawCanvas = (uuid = false) => {


        const canvas =  uuid ? canvasesRef.current[uuid] : canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        strokes.current.forEach((stroke) => {
            ctx.beginPath();
            ctx.globalCompositeOperation = stroke.erase ? "destination-out" : "source-over";
            ctx.lineWidth = stroke.erase ? 10 : 1;
            ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
            stroke.points.forEach(({x,y}) => {
                ctx.lineTo(x,y);
                ctx.stroke();
            });
        });
        ctx.globalCompositeOperation = "source-over";
    }



    const handleDrawing = (flag) => {
        if(flag){
            if(strokes.current.length <= 0){
                return;
            }
            prevStrokes.current.push(strokes.current.pop());
        }else{
            if(prevStrokes.current.length <= 0) return;
            strokes.current.push(prevStrokes.current.pop());
        }

        reDrawCanvas();
        sendJsonMessage({state: {
            undo: flag
        }});
    }


    const renderDrawing = (users) => {
        
        Object.keys(users)
        .filter(uuid => users[uuid].username !== username)
        .forEach(uuid => {
            
            const canvas = canvasesRef.current[uuid];
            if (!canvas) return;

            const ctx = canvas.getContext("2d");
            const { drawing, move_to: moveTo, line_to: lineTo = [], erasing, outsideCanvas, undo, fromWindow } = users[uuid].state;
            if(fromWindow && !outsideCanvas) return;
            if(!userStroke.current[uuid] || !userStrokes.current[uuid]){
                userStroke.current[uuid]  = [];
                userStrokes.current[uuid]  = [];
            }
            if(undo){
                reDrawCanvas(uuid);
            }
            if(erasing){
                ctx.lineWidth = 10;
                ctx.globalCompositeOperation = "destination-out";
            }
            else if(erasing === false){
                ctx.lineWidth = 1;
                ctx.globalCompositeOperation = "source-over";
            }
            if(outsideCanvas){
                ctx.lineWidth = 1;
                ctx.globalCompositeOperation = "source-over";
                ctx.beginPath();
                return;
            }
            if (moveTo) {
                moveToRef.current[uuid] = moveTo;
            }
            if (drawing === false) {
                if(userStroke.current[uuid].length > 0){
                    userStrokes.current[uuid].push({pointer: userStroke.current[uuid], erase: erasing});
                    console.log(userStrokes.current[uuid]);
                    userStroke.current[uuid] = [];
                }
                strokeStatusRef.current[uuid] = false;
                return;
            }

            if (lineTo.length === 0) {
                return; 
            }

            userStroke.current[uuid].push(...lineTo);

            const last = lineTo.at(-1);
            const sig = `${lineTo.length}:${last.x},${last.y}`;
            if (batchSigRef.current[uuid] === sig) return;
            batchSigRef.current[uuid] = sig;


            if (!strokeStatusRef.current[uuid]) {
            

            const start = moveToRef.current[uuid] ?? lineTo[0];
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            strokeStatusRef.current[uuid] = true;
            }


            lineTo.forEach(({ x, y }) => {
                ctx.lineTo(x, y)
                ctx.stroke();
            });


            moveToRef.current[uuid] = last;

            
        });
    };



    const sendCurrAndBuffer = (coordinates) => {
        
        //send actual line_to

        if(pointerBufferRef.current.length > 0){
            sendJsonMessage({state: {
                mousemove: coordinates, 
                line_to: pointerBufferRef.current,
                drawing: true,
            }});
            pointerBufferRef.current = [];
        }


    }


    const sendThrottleJSONMessage = useRef(throttle(sendJsonMessage, 100));
    const sendCurrAndBufferThrottleMessage = useRef(throttle(sendCurrAndBuffer, 30));




    useEffect(() => {




        const canvas = canvasRef.current;
        
        const ctx = canvas.getContext("2d");    




            
        const handleMouseMove = (e) => {
            if(drawRef.current){
                ctx.lineTo(e.offsetX, e.offsetY);
                ctx.stroke();

 
                pointerBufferRef.current.push({x: e.offsetX, y: e.offsetY});
                sendCurrAndBufferThrottleMessage.current({x: e.offsetX, y: e.offsetY});
                stroke.current.push({x: e.offsetX, y: e.offsetY});

                
            }     

        }
        const handleMouseDown = (e) => {

            drawRef.current = true;

            if(!modeRef.current){
                ctx.lineWidth = 1;
                ctx.globalCompositeOperation = "source-over";
            }
            else{
                ctx.lineWidth = 10;
                ctx.globalCompositeOperation = "destination-out";
            }

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
                    drawing: true,
                    erasing: modeRef.current
                }
            })

        }

        const handleMouseUp = (e) => {
            drawRef.current = false;
            sendCurrAndBufferThrottleMessage.current.flush();


            strokes.current.push({points: [...stroke.current], erase: modeRef.current});
            if(!modeRef.current){
                canvas.style.cursor = "crosshair";
            }
            stroke.current = [];

            prevStrokes.current = [];

            sendJsonMessage({
                state:{
                    mousemove: {
                        x: e.offsetX,
                        y: e.offsetY
                    },
                    line_to: [],
                    drawing: false,
                    erasing: modeRef.current
                },
            });


        }

        const handleWindowMouseMove = (e) => {


            
                const rect = canvas.getBoundingClientRect();
                const outside = (e.clientY <= rect.top || e.clientY >= rect.bottom || e.clientX <= rect.left || e.clientX >= rect.right);
                if(outside && !isOutsideCanvas.current){
                    sendCurrAndBufferThrottleMessage.current.flush();
                    drawRef.current = false;
                    isOutsideCanvas.current = true;
                    sendJsonMessage({
                        state: {
                            mousemove: { x: e.clientX, y: e.clientY },
                            fromWindow: true,
                            outsideCanvas: isOutsideCanvas.current
                        }
                    });
                }else if(!outside){
                    isOutsideCanvas.current = false;
                }
                if(!drawRef.current){
                    sendThrottleJSONMessage.current({
                        state: {
                            mousemove: { x: e.clientX, y: e.clientY },
                            fromWindow: true,
                        }
                    });
                }
            
        }

        
        const handleCtrlDown = (e) => {
            if(e.ctrlKey){
                modeRef.current = true;
                if(!drawRef.current){
                    canvas.style.cursor = "cell";
                }
            }
        } 
        const handleCtrlUp = (e) => {
            if(e.key === "Control"){
                modeRef.current = false;
                if(!drawRef.current){
                    canvas.style.cursor = "crosshair";
                }
            }  
        } 

        canvas.addEventListener("mouseup", handleMouseUp);
        canvas.addEventListener("mousedown", handleMouseDown);
        canvas.addEventListener("mousemove", handleMouseMove);




        window.addEventListener("pointermove", handleWindowMouseMove);
        window.addEventListener("keydown", handleCtrlDown);
        window.addEventListener("keyup", handleCtrlUp);

        return () => {
            canvas.removeEventListener("mouseup", handleMouseUp);
            canvas.removeEventListener("mousedown", handleMouseDown);
            canvas.removeEventListener("mousemove", handleMouseMove);
            
            window.removeEventListener("mousemove", handleWindowMouseMove);
            window.removeEventListener("keydown", handleCtrlDown);
            window.removeEventListener("keyup", handleCtrlUp);


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
        <p>Hold control to make use of the eraser</p>
        <button onClick={() => handleDrawing(true)}>⬅️</button>
        <button onClick={() => handleDrawing(false)}>➡️</button>
        {lastJsonMessage && (
        <>
            <div style={{ height: 80, width: 480, overflowX: 'auto', gap: 10 }}>
            {Object.keys(lastJsonMessage).map(uuid => (
                <li key={uuid}>
                {lastJsonMessage[uuid].username} joined
                </li>
            ))}
            </div>
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