import { useEffect, useRef, memo } from "react"

export const AdminCanvas = memo(({userLeft}) => {

    const canvasRef = useRef();

    useEffect(() => {
        const sendData = async () => {

            // try{
            //     const res = await fetch("http://localhost:8000/api/strokes", {
            //         method: "POST",
            //         headers: {
            //             'Content-Type': 'application/json'
            //         }, 
            //         body: JSON.stringify({ data: "data" })
            //     });
            //     if(res.ok){
            //         console.log("success");
            //     }
            // }catch(e){
            //     console.log(e)
            // }
        }
        const  fetchData = async () => {
            try {
                const res = await fetch("http://localhost:8000/api/strokes");
                const data = await res.json();
                console.log(data);

            } catch (e) {
                console.error(e);
            }

        }
        sendData();
        fetchData();
    }, [userLeft]) 

    return (
        <canvas
        ref={canvasRef}
        height={480}
        width={500}
        style={{ position: 'absolute', border: '1px solid red', cursor: 'crosshair', zIndex: -1 }}
        
        />
    );
});