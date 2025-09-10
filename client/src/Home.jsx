import { useEffect, useRef, useState } from 'react';
import useWebSocket from 'react-use-websocket';
import throttle from 'lodash.throttle';
import { Cursor } from './components/Cursor';
import { AdminCanvas } from './components/AdminCanvas';
import { getRandomColor } from './lib/utils.js';



export function Home({username}) {

    // const colors = ["red", "yellow"];
    // const colorChange = useRef(0);
    const PEN_WIDTH = 1;
    const ERASER_WIDTH = 10;
    const STROKES_LEFT = useRef(1500);
    const STROKE_LIMIT = 0;
    const WIDTH = 1920;
    const HEIGHT = 1080;

    const canvasesRef = useRef({});
    const canvasRef = useRef(null);
    const strokeStatusRef = useRef({});
    const drawRef = useRef(false);
    const pointerBufferRef = useRef([]);
    const moveToRef = useRef({});
    const batchSigRef = useRef({});
    const modeRef = useRef(false);
    const moveToUndoRedo = useRef({});
    const strokeColor = useRef(getRandomColor());
    const [saved, setSaved] = useState(false);
    const [userSaved, setUserSaved] = useState({});

    const strokes = useRef([]);
    const stroke = useRef({});
    const prevStrokes = useRef([]);

    const lastMousePos = useRef({});

    const userStrokes = useRef({});
    const userStroke = useRef({});
    const userPrevStrokes = useRef({});
    const isOutsideCanvas = useRef(false);
    const [storageFullErr, setStorageFullErr] = useState(false);





    const WS_URL = import.meta.env.VITE_WS_URL;
    const HTTP_URL = import.meta.env.VITE_HTTP_URL;
    const {sendJsonMessage, lastJsonMessage} = useWebSocket(WS_URL, {
        queryParams: {username}
    });
    const pushFlushUserStroke = (uuid, erasing) => {
        if(userStroke.current[uuid].length > 0){
            userStrokes.current[uuid].push({points: userStroke.current[uuid], erase: erasing, move_to: moveToUndoRedo.current[uuid]});
            userStroke.current[uuid] = [];
        }
    }

    const save = async () => {
        try{
            const res = await fetch(`${HTTP_URL}/api/strokes?`, {
                method: "POST",
                headers: {
                    'Content-Type': 'application/json'
                }, 
                body: JSON.stringify({ username, strokes: strokes.current, color: strokeColor.current })
            });
            if(!res.ok){
                const errData = await res.json();
                console.log(errData.message);
                setStorageFullErr(true);
                return 
            }

            strokes.current = [];
            prevStrokes.current = [];
            reDrawCanvas();
            sendJsonMessage({
                state:{
                    saved: true,
                    fromWindow: true
                }
            });

            alert("saved to database");

            setSaved(prev => !prev);
  
        }catch(e){
            console.log(e)
        }
    }
    const renderCursors = users => {

    
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();

        return Object.keys(users).filter(uuid => users[uuid].username !== username
        ).map(uuid => {


            const user = users[uuid];
            const { x, y } = user.state.mousemove || lastMousePos.current[uuid];

            let coorX = x;
            let coorY = y;

            if(!user.state.fromWindow){
                coorX += rect.left;
                coorY += rect.top;
            }
            lastMousePos.current[uuid] = {x:coorX , y:coorY};

            return <Cursor key={uuid} point={[coorX , coorY]} />;
        })
    }

    const reDrawCanvas = (undo, uuid = false) => {

        let canvas;
        let diffStrokes;


        if(uuid){
            canvas = canvasesRef.current[uuid];
            diffStrokes = userStrokes.current[uuid];
            if(undo){
                if(userStrokes.current[uuid].length > 0){ 
                    userPrevStrokes.current[uuid].push(userStrokes.current[uuid].pop());

                    
                }
            }else{
                if(userPrevStrokes.current[uuid].length > 0) {
                    userStrokes.current[uuid].push(userPrevStrokes.current[uuid].pop());
 
                }

            }
        }
        else{
            canvas = canvasRef.current;
            diffStrokes = strokes.current;
            if(undo){
                if(strokes.current.length > 0){
                    const strokePopped = strokes.current.pop();

                    if(!strokePopped["erase"]){
                        STROKES_LEFT.current += strokePopped["points"].length
                    }
                    prevStrokes.current.push(strokePopped);
                }

            }else{
                if(prevStrokes.current.length > 0) {
                    const strokePopped = prevStrokes.current.pop();
                    if(!strokePopped["erase"]){
                        STROKES_LEFT.current -= strokePopped["points"].length
                    }
                    strokes.current.push(strokePopped);
                }

            }

 
            sendJsonMessage(
                {state: 
                    {
                        undo: undo,
                        fromWindow: true
                    }
                });

        }

        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if(diffStrokes.length <= 0) return;
        diffStrokes.forEach((stroke) => {
            ctx.beginPath();
            ctx.globalCompositeOperation = stroke.erase ? "destination-out" : "source-over";
            ctx.lineWidth = stroke.erase ? ERASER_WIDTH : PEN_WIDTH;
            ctx.moveTo(stroke.move_to.x, stroke.move_to.y);
            stroke.points.forEach(({x,y}) => {
                ctx.lineTo(x,y);
                ctx.stroke();
            });
        });
        ctx.globalCompositeOperation = "source-over";
    }




    const renderDrawing = (users) => {
        
        Object.keys(users).filter(uuid => users[uuid].username !== username)
        .forEach(uuid => {
            
            const canvas = canvasesRef.current[uuid];
            if (!canvas) return;

            const ctx = canvas.getContext("2d");
            const { drawing, move_to: moveTo, line_to: lineTo = [], erasing, outsideCanvas, undo, color,saved } = users[uuid].state;
            if(saved){
                ctx.clearRect(0,0,canvas.width,canvas.height);
           
                setUserSaved(prev => ({...prev, [uuid]: !prev[uuid]}))
   

            }
            if(color){
                ctx.strokeStyle = color;
            }
            if(!userStroke.current[uuid]){
                userStroke.current[uuid]  = [];
                userStrokes.current[uuid]  = [];
                userPrevStrokes.current[uuid] = [];
            }
            if(undo === true || undo === false){
                reDrawCanvas(undo, uuid);
                return;
            }
            if(erasing){
                ctx.lineWidth = ERASER_WIDTH;
                ctx.globalCompositeOperation = "destination-out";
            }
            else if(erasing === false){
                ctx.lineWidth = PEN_WIDTH;
                ctx.globalCompositeOperation = "source-over";
            }
            if(outsideCanvas){

                
                ctx.lineWidth = PEN_WIDTH;
                ctx.globalCompositeOperation = "source-over";
                ctx.beginPath();
                strokeStatusRef.current[uuid] = false;
                pushFlushUserStroke(uuid, erasing);
                return;
            }
            if (moveTo) {
                moveToRef.current[uuid] = moveTo;
                moveToUndoRedo.current[uuid] = moveTo;
            }
            if (drawing === false) {
                userPrevStrokes.current[uuid] = [];
                strokeStatusRef.current[uuid] = false;
                pushFlushUserStroke(uuid, erasing);
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

                if(STROKES_LEFT.current === STROKE_LIMIT  && !modeRef.current) return;

                ctx.lineTo(e.offsetX, e.offsetY);
                ctx.stroke();
                pointerBufferRef.current.push({x: e.offsetX, y: e.offsetY});
                sendCurrAndBufferThrottleMessage.current({x: e.offsetX, y: e.offsetY});
                if(!stroke.current["line_to"]){
                    stroke.current["line_to"] = [];
                }
                if(!modeRef.current){
                    STROKES_LEFT.current -= 1;
                }

                stroke.current["line_to"].push({x: e.offsetX, y: e.offsetY});

            }     

        }
        const handleMouseDown = (e) => {
            if(STROKES_LEFT.current === STROKE_LIMIT && !modeRef.current) return;
            drawRef.current = true;

            stroke.current["move_to"] = {x : e.offsetX, y : e.offsetY};
            

            if(!modeRef.current){
                ctx.lineWidth = PEN_WIDTH;
                ctx.globalCompositeOperation = "source-over";
            }
            else{
                ctx.lineWidth = ERASER_WIDTH;
                ctx.globalCompositeOperation = "destination-out";
            }

            ctx.beginPath();
            ctx.moveTo(e.offsetX, e.offsetY);
            ctx.strokeStyle = strokeColor.current;

            sendJsonMessage({
                state:{
                    mousemove: {
                        x: e.offsetX,
                        y: e.offsetY
                    },
                    move_to: {x: e.offsetX, y: e.offsetY},
                    line_to: [],
                    drawing: true,
                    erasing: modeRef.current,
                    color: strokeColor.current
                }
            })

        }

        const handleMouseUp = (e) => {

  

            drawRef.current = false;
            sendCurrAndBufferThrottleMessage.current.flush();


    
            if(stroke.current["line_to"].length > 0){

                strokes.current.push({
                    points: [...stroke.current["line_to"]], 
                    erase: modeRef.current, 
                    move_to: stroke.current["move_to"]
                });
                stroke.current["line_to"] = [];


            }
            
            canvas.style.cursor = "crosshair";
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


            modeRef.current = false
            


        }

        const handleWindowMouseMove = (e) => {


            
                const rect = canvas.getBoundingClientRect();
                const outside = (e.clientY <= rect.top || e.clientY >= rect.bottom || e.clientX <= rect.left || e.clientX >= rect.right);
                if(outside && !isOutsideCanvas.current){
                    sendCurrAndBufferThrottleMessage.current.flush();
                    drawRef.current = false;
                    isOutsideCanvas.current = true;
                    if(stroke.current["line_to"]){
                        if(stroke.current["line_to"].length > 0){
                            strokes.current.push({points: [...stroke.current["line_to"]], erase: modeRef.current, move_to: stroke.current["move_to"] });
                            stroke.current["line_to"] = [];
                        }
                    }


                    sendJsonMessage({
                        state: {
                            mousemove: { x: e.clientX, y: e.clientY },
                            fromWindow: true,
                            outsideCanvas: isOutsideCanvas.current,
                            erasing: modeRef.current
                        }
                    });
                }else if(!outside && isOutsideCanvas.current){
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
                if(!drawRef.current){
                    canvas.style.cursor = "cell";
                    modeRef.current = true;
                }
            }
        } 
        const handleCtrlUp = (e) => {
            if(e.key === "Control"){        
                if(!drawRef.current){
                    canvas.style.cursor = "crosshair";
                    modeRef.current = false;
                }

            }  
        } 





        canvas.addEventListener("mouseup", handleMouseUp);
        canvas.addEventListener("mousedown", handleMouseDown);
        canvas.addEventListener("mousemove", handleMouseMove);




        window.addEventListener("mousemove", handleWindowMouseMove);
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
        <p>{STROKES_LEFT.current > 0 ? `Strokes left ${STROKES_LEFT.current}`: "Stroke limit reached"}</p>

        {storageFullErr && <p>database is unfortunately full, ur strokes wont be saved </p>}
        <button disabled={strokes.current.length === 0} onClick={() => reDrawCanvas(true)}>⬅️</button>
        <button disabled={prevStrokes.current.length === 0} onClick={() => reDrawCanvas(false)}>➡️</button>
        <button disabled={strokes.current.length === 0} onClick={() => save()}>save</button>
        {lastJsonMessage && (
        <>
        
            <div style={{ height: 80, width: WIDTH, overflowX: 'auto', gap: 10 }}>
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
        height={HEIGHT}
        width={WIDTH}
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
            height={HEIGHT}
            width={WIDTH}
            style={{
                position: 'absolute',
                border: '1px solid black',
                cursor: 'crosshair',
                zIndex: -1
            }}
            />
        ))}
         {lastJsonMessage && <AdminCanvas height={HEIGHT} width={WIDTH} userSaved={userSaved} saved={saved}/>}

       
    </>
    );
}