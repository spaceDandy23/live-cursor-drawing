import { useEffect, useRef, memo } from "react"

export const AdminCanvas = memo(({saved, userSaved, height, width}) => {



    const canvasRef = useRef();
    useEffect(() => {





        const fetchData = async () => {

        const renderGlobalCanvas = (strokes) => {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d");
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            strokes.forEach((stroke) => {
                ctx.beginPath();
                ctx.strokeStyle = stroke.color;
                ctx.globalCompositeOperation = stroke.erase ? "destination-out": "source-over" 
                ctx.lineWidth = stroke.erase ? 10 : 1
                ctx.moveTo(stroke.move_to.x, stroke.move_to.y)
                stroke.points.forEach(({x,y}) => {

                    ctx.lineTo(x,y);
                    ctx.stroke();

                });
            });

            ctx.globalCompositeOperation = "source-over";
        }

            try {
                const res = await fetch(`http://localhost:8000/api/strokes`);
                const strokes = await res.json();
                renderGlobalCanvas(strokes);
            
            } catch (e) {
                console.error(e);
            }

        }
        fetchData();
    },[saved, Object.values(userSaved).join(",")]);

    return (
        <canvas
        ref={canvasRef}
        height={height}
        width={width}
        style={{ position: 'absolute', border: '1px solid red', zIndex: -1 }}
        
        />
    );
});