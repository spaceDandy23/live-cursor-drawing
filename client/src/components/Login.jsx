import { useState } from "react";


export const Login = ({onSubmit}) => {

    const HTTP_URL = import.meta.env.VITE_HTTP_URL;

    const [username, setUsername] = useState('');
    const [taken, setTaken] = useState(false);
    const [error, setError] = useState('');
    const [joining, setJoining] = useState(false);
    const handleSubmit = async (e) => {
        e.preventDefault();
        setTaken(false);
        setError('');

        if (!HTTP_URL) {
            setError('VITE_HTTP_URL is not configured.');
            return;
        }

        setJoining(true);
        try{
            const res = await fetch(`${HTTP_URL}/api/login`, {
                method: "POST",
                headers: {
                    'Content-Type': "application/json"
                },
                body: JSON.stringify({username: username.trim()})
            });

            if(res.ok){
                onSubmit(username.trim())
            }else{
                const data = await res.json().catch(() => ({}));
                if (data.message === 'username already taken') setTaken(true);
                else setError(data.message || 'Unable to sign in.');
            }

        }catch(e){
            console.error(e);
            setError('The backend is temporarily unavailable. Please try again.');
        } finally {
            setJoining(false);
        }

    }

    return (
        <main className="join-shell">
          <section className="join-card" aria-labelledby="join-title">
            <img className="brand-mark" src="/smiley.svg" alt="" />
            <h1 id="join-title">Draw together.</h1>
            <p>Common Canvas is a shared space for sketching with people in real time. Choose a name to join.</p>
            <form className="join-form" onSubmit={handleSubmit}>
                <label className="field-label" htmlFor="username">Your name</label>
                <input
                id="username"
                className="text-input"
                placeholder="How should others see you?"
                onChange={(e) => {setUsername(e.target.value)}}
                value={username}
                type="text"
                autoComplete="nickname"
                required
                />
                {taken && <p className="form-error" role="alert">That name is already in use. Try another.</p>}
                {error && <p className="form-error" role="alert">{error}</p>}
                <button className="primary-button" type="submit" disabled={!username.trim() || joining}>
                    {joining ? 'Joining…' : 'Join canvas'}
                </button>
            </form>
          </section>
        </main>
    )

}
