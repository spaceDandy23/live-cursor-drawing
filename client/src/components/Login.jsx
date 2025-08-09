import { useState } from "react";


export const Login = ({onSubmit}) => {

    const [username, setUsername] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        onSubmit(username);

        try{
            console.log("bali");
        }catch(e){
            console.error(e);
        }

    }

    return (
        <>
            <h1>Welcome</h1>
            <p>what should people call you</p>
            <form onSubmit={handleSubmit}>
                <label htmlFor="html">
                    Title
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