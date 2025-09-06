import { useState } from "react";


export const Login = ({onSubmit}) => {


    const [username, setUsername] = useState('');
    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if(import.meta.env.VITE_ADMIN_KEY === username){
            onSubmit(import.meta.env.VITE_ADMIN_KEY);
            return;
        }
        onSubmit(username);
    }

    return (
        <>
            <h1>Welcome</h1>
            <p>what should people call you</p>
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