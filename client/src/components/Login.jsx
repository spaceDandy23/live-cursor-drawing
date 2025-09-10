import { useState } from "react";


export const Login = ({onSubmit}) => {

    const HTTP_URL = import.meta.env.VITE_HTTP_URL;

    const [username, setUsername] = useState('');
    const [taken, setTaken] = useState(false);
    const handleSubmit = async (e) => {
        e.preventDefault();
        try{
            const res = await fetch(`${HTTP_URL}/api/login`, {
                method: "POST",
                headers: {
                    'Content-Type': "application/json"
                },
                body: JSON.stringify({username: username})
            });

            if(res.ok){
                onSubmit(username)
                const data = await res.json();
                console.log(data)
            }else{
                setTaken(true)
            }

        }catch(e){
            console.log(e);
        }

    }

    return (
        <>
            <h1>Welcome</h1>
            <p>what should people call you</p>
            {taken && <p>username already taken, wait for em to leave or smthin</p>}
            <form onSubmit={handleSubmit}>
                <label htmlFor="username">
                    Username
                </label>
                <input 
                placeholder="username"
                onChange={(e) => {setUsername(e.target.value)}}
                value={username}
                type="text"
                />
                <button type="submit">Submit</button>
            </form>
        </>
    )

}