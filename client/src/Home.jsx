import { useCallback, useEffect, useRef, useState } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import throttle from 'lodash.throttle';
import { Cursor } from './components/Cursor';
import { AdminCanvas } from './components/AdminCanvas';
import { getRandomColor } from './lib/utils.js';
import { recordRealtimeEvent, incrementReliabilityMetric } from './realtime/metrics.js';
import { StrokeOutbox } from './realtime/outbox.js';
import { drawStrokePoints } from './drawing/renderStroke.js';
import { canvasPointFromClient } from './drawing/coordinates.js';
import { reconcilePersistedStrokes } from './drawing/reconcilePersistedStrokes.js';

const RECOVERY_TIMEOUT_MS = 1500;



export function Home({username}) {

    // const colors = ["red", "yellow"];
    // const colorChange = useRef(0);
    const STROKES_LEFT = useRef(1500);
    const STROKE_LIMIT = 0;
    const WIDTH = 1920;
    const HEIGHT = 1080;

    const canvasesRef = useRef({});
    const canvasRef = useRef(null);
    const scrollRef = useRef(null);
    const lastPointerClientRef = useRef(null);
    const cursorElementsRef = useRef({});
    const cursorPositionsRef = useRef({});
    const activeRemoteStrokesRef = useRef({});
    const completedRemoteStrokesRef = useRef(new Set());
    const remoteRecoveryRef = useRef(new Map());
    const outboxRef = useRef(new StrokeOutbox());
    const sessionIdRef = useRef(crypto.randomUUID());
    const replayTimerRef = useRef(null);
    const recoveryTimersRef = useRef(new Set());
    const queueDurableRef = useRef(null);
    const sentThisConnectionRef = useRef(new Set());
    const hasOpenedRef = useRef(false);
    const wasDisconnectedRef = useRef(false);
    const drawRef = useRef(false);
    const pointerBufferRef = useRef([]);
    const modeRef = useRef(false);
    const selectedToolRef = useRef('pen');
    const controlHeldRef = useRef(false);
    const strokeColor = useRef(getRandomColor());
    const [inkColor, setInkColor] = useState(strokeColor.current);
    const [selectedTool, setSelectedTool] = useState('pen');
    const [controlHeld, setControlHeld] = useState(false);
    const [savedCanvasVersion, setSavedCanvasVersion] = useState(0);
    const [catchupVersion, setCatchupVersion] = useState(0);
    const [, refreshHistoryControls] = useState(0);
    const [remoteUsers, setRemoteUsers] = useState({});

    const strokes = useRef([]);
    const stroke = useRef({});
    const prevStrokes = useRef([]);

    const userStrokes = useRef({});
    const userPrevStrokes = useRef({});
    const isOutsideCanvas = useRef(false);
    const [storageFullErr, setStorageFullErr] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveNotice, setSaveNotice] = useState('');





    const WS_URL = import.meta.env.VITE_WS_URL?.trim();
    const HTTP_URL = import.meta.env.VITE_HTTP_URL?.trim();
    const {sendJsonMessage, getWebSocket, readyState} = useWebSocket(WS_URL || null, {
        queryParams: {username, sessionId: sessionIdRef.current},
        shouldReconnect: () => true,
        reconnectAttempts: Infinity,
        reconnectInterval: 2000,
        onMessage: handleSocketMessage,
        onOpen: () => {
            if (hasOpenedRef.current && wasDisconnectedRef.current) {
                setCatchupVersion(version => version + 1);
            }
            hasOpenedRef.current = true;
            wasDisconnectedRef.current = false;
            sentThisConnectionRef.current.clear();
            drainOutbox(true);
            // The receiver may have missed the tail of an already-started stroke.
            for (const [userId, active] of Object.entries(activeRemoteStrokesRef.current)) {
                sendEvent('stroke:request-full', { strokeId: active.strokeId });
                incrementReliabilityMetric('fullStrokeRecoveryAttempts');
                scheduleRemoteRecovery(active.strokeId, userId, 1);
            }
        },
        onClose: () => {
            wasDisconnectedRef.current = true;
            clearTimeout(replayTimerRef.current);
            for (const timer of recoveryTimersRef.current) clearTimeout(timer);
            recoveryTimersRef.current.clear();
            setRemoteUsers({});
            Object.values(cursorElementsRef.current).forEach(element => {
                element.style.visibility = 'hidden';
            });
        },
        filter: () => false,
    });

    const sendEvent = useCallback((type, payload = {}) => {
        if (getWebSocket()?.readyState !== WebSocket.OPEN) return;
        recordRealtimeEvent('outgoing', type);
        sendJsonMessage({ type, payload }, false);
    }, [getWebSocket, sendJsonMessage]);

    function transmit(item, resent = false) {
        const socket = getWebSocket();
        if (socket?.readyState !== WebSocket.OPEN || socket.bufferedAmount > 256 * 1024) return false;
        recordRealtimeEvent('outgoing', item.type);
        if (resent) incrementReliabilityMetric('durableResent');
        sendJsonMessage({ type: item.type, payload: item.payload }, false);
        return true;
    }

    function drainOutbox(reconnecting = false) {
        clearTimeout(replayTimerRef.current);
        for (const item of outboxRef.current.pendingOrdered()) {
            if (sentThisConnectionRef.current.has(item.eventId)) continue;
            if (!transmit(item, reconnecting)) {
                if (getWebSocket()?.readyState === WebSocket.OPEN) {
                    replayTimerRef.current = setTimeout(() => drainOutbox(reconnecting), 50);
                }
                return;
            }
            sentThisConnectionRef.current.add(item.eventId);
        }
    }

    function queueDurable(type, payload) {
        const item = outboxRef.current.queue(type, payload);
        if (!item) return;
        incrementReliabilityMetric('durableQueued');
        drainOutbox();
    }
    queueDurableRef.current = queueDurable;

    function transmitRecovery(items, index = 0) {
        for (let offset = index; offset < items.length; offset += 1) {
            if (transmit(items[offset], true)) continue;
            if (getWebSocket()?.readyState !== WebSocket.OPEN) return;
            const timer = setTimeout(() => {
                recoveryTimersRef.current.delete(timer);
                transmitRecovery(items, offset);
            }, 50);
            recoveryTimersRef.current.add(timer);
            return;
        }
    }

    const save = async () => {
        setSaveError('');
        setSaveNotice('');
        setStorageFullErr(false);

        if (!HTTP_URL) {
            setSaveError('VITE_HTTP_URL is not configured.');
            return;
        }

        setSaving(true);
        try{
            const res = await fetch(`${HTTP_URL}/api/strokes`, {
                method: "POST",
                headers: {
                    'Content-Type': 'application/json'
                }, 
                body: JSON.stringify({ username, strokes: strokes.current, color: strokeColor.current })
            });
            if(!res.ok){
                const errData = await res.json().catch(() => ({}));
                setStorageFullErr(res.status === 507);
                setSaveError(errData.message || 'Unable to save strokes.');
                return 
            }

            strokes.current = [];
            prevStrokes.current = [];
            reDrawCanvas();
            refreshHistoryControls(previous => previous + 1);
            sendEvent('canvas:saved');

            setSaveNotice('Drawing saved.');

            setSavedCanvasVersion(version => version + 1);
  
        }catch(e){
            console.error(e);
            setSaveError('The backend is temporarily unavailable. Your drawing is still on this page.');
        } finally {
            setSaving(false);
        }
    }
    const selectTool = (tool) => {
        selectedToolRef.current = tool;
        setSelectedTool(tool);
        if (!drawRef.current) {
            modeRef.current = tool === 'eraser' || controlHeldRef.current;
            if (canvasRef.current) canvasRef.current.style.cursor = modeRef.current ? 'cell' : 'crosshair';
        }
    };
    const reDrawCanvas = (undo, uuid = false) => {

        let canvas;
        let diffStrokes;


        if(uuid){
            canvas = canvasesRef.current[uuid];
            diffStrokes = userStrokes.current[uuid] ?? [];
            if (undo === true && diffStrokes.length > 0) {
                userPrevStrokes.current[uuid].push(diffStrokes.pop());
            } else if (undo === false && userPrevStrokes.current[uuid]?.length > 0) {
                diffStrokes.push(userPrevStrokes.current[uuid].pop());
            }
        }
        else{
            canvas = canvasRef.current;
            diffStrokes = strokes.current;
            if(undo === true){
                if(strokes.current.length > 0){
                    const strokePopped = strokes.current.pop();

                    if(!strokePopped["erase"]){
                        STROKES_LEFT.current += strokePopped["points"].length
                    }
                    prevStrokes.current.push(strokePopped);
                }

            }else if(undo === false){
                if(prevStrokes.current.length > 0) {
                    const strokePopped = prevStrokes.current.pop();
                    if(!strokePopped["erase"]){
                        STROKES_LEFT.current -= strokePopped["points"].length
                    }
                    strokes.current.push(strokePopped);
                }

            }

 
            if (typeof undo === 'boolean') {
                sendEvent(undo ? 'stroke:undo' : 'stroke:redo');
                refreshHistoryControls(previous => previous + 1);
            }

        }

        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const activeStroke = uuid ? activeRemoteStrokesRef.current[uuid]?.stroke : null;
        [...diffStrokes, ...(activeStroke ? [activeStroke] : [])].forEach((stroke) =>
            drawStrokePoints(ctx, stroke.move_to, stroke.points, {
                ...stroke, color: stroke.color ?? strokeColor.current,
            }));
    }

    const handlePersistedStrokes = persisted => {
        const result = reconcilePersistedStrokes(persisted, strokes.current,
            userStrokes.current, activeRemoteStrokesRef.current,
            prevStrokes.current, userPrevStrokes.current);
        prevStrokes.current = result.remainingLocalRedo;
        for (const strokeId of result.persistedIds) completedRemoteStrokesRef.current.add(strokeId);
        for (const strokeId of result.removedActive) clearRemoteRecovery(strokeId);
        if (result.localChanged) {
            strokes.current = result.remainingLocal;
            reDrawCanvas();
        }
        if (result.localChanged || result.localRedoChanged) {
            refreshHistoryControls(previous => previous + 1);
        }
        result.changedRemoteUsers.forEach(userId => reDrawCanvas(undefined, userId));
    };




    function handleSocketMessage(message) {
        let event;
        try {
            event = JSON.parse(message.data);
        } catch {
            return;
        }
        const { type, payload } = event ?? {};
        if (!payload || typeof payload !== 'object') return;
        const userId = payload.userId;

        if (type === 'presence:sync') {
            if (!Array.isArray(payload.users)) return;
            const nextUsers = Object.fromEntries(payload.users
                .filter(user => typeof user.userId === 'string' && typeof user.username === 'string')
                .map(user => [user.userId, user.username]));
            setRemoteUsers(nextUsers);
            return;
        }
        if (type === 'stroke:ack') {
            const removed = outboxRef.current.ack(payload);
            incrementReliabilityMetric('durableAcknowledged', removed);
            if (payload.duplicate) incrementReliabilityMetric('duplicateDurableIgnored');
            drainOutbox();
            return;
        }
        if (type === 'stroke:request-missing') {
            incrementReliabilityMetric('missingRecoveryRequests');
            const item = outboxRef.current.missing(payload.strokeId, payload.missingSequence);
            if (item) transmitRecovery([item]);
            return;
        }
        if (type === 'stroke:request-full') {
            incrementReliabilityMetric('recoveryTimeouts');
            incrementReliabilityMetric('fullStrokeRecoveryAttempts');
            transmitRecovery(outboxRef.current.fullStroke(payload.strokeId));
            return;
        }
        if (type === 'stroke:abandoned') {
            outboxRef.current.abandon(payload.strokeId);
            incrementReliabilityMetric('recoveryTimeouts');
            clearRemoteRecovery(payload.strokeId);
            if (typeof userId === 'string') {
                delete activeRemoteStrokesRef.current[userId];
                reDrawCanvas(undefined, userId);
            } else setSaveError('A stroke could not be synchronized. Your local drawing remains available.');
            return;
        }
        if (typeof userId !== 'string') return;

        if (type === 'presence:join') {
            if (typeof payload.username === 'string') {
                setRemoteUsers(previous => ({ ...previous, [userId]: payload.username }));
            }
        } else if (type === 'presence:leave') {
            const element = cursorElementsRef.current[userId];
            if (element) element.style.visibility = 'hidden';
            delete cursorPositionsRef.current[userId];
            setRemoteUsers(previous => {
                const next = { ...previous };
                delete next[userId];
                return next;
            });
        } else if (type === 'cursor:move') {
            recordRealtimeEvent('received', type);
            if (!Number.isFinite(payload.x) || !Number.isFinite(payload.y)) return;
            cursorPositionsRef.current[userId] = { x: payload.x, y: payload.y };
            const element = cursorElementsRef.current[userId];
            if (element) {
                element.style.transform = `translate3d(${payload.x}px, ${payload.y}px, 0)`;
                element.style.visibility = 'visible';
            }
        } else if (type === 'stroke:start') {
            if (completedRemoteStrokesRef.current.has(payload.strokeId) ||
                activeRemoteStrokesRef.current[userId]?.strokeId === payload.strokeId) {
                incrementReliabilityMetric('duplicateDurableIgnored');
                return;
            }
            userStrokes.current[userId] ??= [];
            userPrevStrokes.current[userId] ??= [];
            activeRemoteStrokesRef.current[userId] = {
                strokeId: payload.strokeId,
                nextSequence: 0,
                pending: new Map(),
                pendingEnd: null,
                lastPoint: payload.moveTo,
                stroke: {
                    strokeId: payload.strokeId,
                    move_to: payload.moveTo,
                    points: [],
                    erase: payload.erase,
                    color: payload.color,
                },
            };
            clearRemoteRecovery(payload.strokeId);
        } else if (type === 'stroke:points') {
            recordRealtimeEvent('received', type);
            const active = activeRemoteStrokesRef.current[userId];
            if (completedRemoteStrokesRef.current.has(payload.strokeId)) return;
            if (!active || active.strokeId !== payload.strokeId) {
                sendEvent('stroke:request-full', { strokeId: payload.strokeId });
                incrementReliabilityMetric('fullStrokeRecoveryAttempts');
                scheduleRemoteRecovery(payload.strokeId, userId, 1);
                return;
            }
            if (payload.sequence < active.nextSequence || active.pending.has(payload.sequence)) {
                incrementReliabilityMetric('duplicateDurableIgnored');
                return;
            }
            active.pending.set(payload.sequence, payload);
            if (payload.sequence > active.nextSequence) {
                sendEvent('stroke:request-missing', {
                    strokeId: payload.strokeId, missingSequence: active.nextSequence,
                });
                incrementReliabilityMetric('missingRecoveryRequests');
                scheduleRemoteRecovery(payload.strokeId, userId, 0);
            }
            drainRemoteStroke(userId, active);
        } else if (type === 'stroke:end') {
            const active = activeRemoteStrokesRef.current[userId];
            if (completedRemoteStrokesRef.current.has(payload.strokeId)) return;
            if (!active || active.strokeId !== payload.strokeId) {
                sendEvent('stroke:request-full', { strokeId: payload.strokeId });
                scheduleRemoteRecovery(payload.strokeId, userId, 1);
                return;
            }
            active.pendingEnd = payload;
            drainRemoteStroke(userId, active);
        } else if (type === 'stroke:undo' || type === 'stroke:redo') {
            reDrawCanvas(type === 'stroke:undo', userId);
        } else if (type === 'canvas:saved') {
            userStrokes.current[userId] = [];
            userPrevStrokes.current[userId] = [];
            delete activeRemoteStrokesRef.current[userId];
            const canvas = canvasesRef.current[userId];
            if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
            setSavedCanvasVersion(previous => previous + 1);
        }
    }

    function clearRemoteRecovery(strokeId) {
        const state = remoteRecoveryRef.current.get(strokeId);
        if (state) clearTimeout(state.timer);
        remoteRecoveryRef.current.delete(strokeId);
    }

    function scheduleRemoteRecovery(strokeId, userId, stage) {
        if (remoteRecoveryRef.current.has(strokeId)) return;
        const timer = setTimeout(() => {
            remoteRecoveryRef.current.delete(strokeId);
            const active = activeRemoteStrokesRef.current[userId];
            if (stage === 0) {
                incrementReliabilityMetric('recoveryTimeouts');
                incrementReliabilityMetric('fullStrokeRecoveryAttempts');
                sendEvent('stroke:request-full', { strokeId });
                scheduleRemoteRecovery(strokeId, userId, 1);
            } else {
                incrementReliabilityMetric('recoveryTimeouts');
                if (active?.strokeId === strokeId) {
                    delete activeRemoteStrokesRef.current[userId];
                    reDrawCanvas(undefined, userId);
                }
            }
        }, RECOVERY_TIMEOUT_MS);
        remoteRecoveryRef.current.set(strokeId, { timer, stage });
    }

    function drainRemoteStroke(userId, active) {
        while (active.pending.has(active.nextSequence)) {
            const batch = active.pending.get(active.nextSequence);
            active.pending.delete(active.nextSequence);
            active.nextSequence += 1;
            active.stroke.points.push(...batch.points);
            const canvas = canvasesRef.current[userId];
            if (canvas) {
                const ctx = canvas.getContext('2d');
                drawStrokePoints(ctx, active.lastPoint, batch.points, active.stroke);
            }
            active.lastPoint = batch.points.at(-1);
        }
        if (active.pending.size === 0 && !active.pendingEnd) clearRemoteRecovery(active.strokeId);
        if (active.pendingEnd && active.pendingEnd.lastSequence === active.nextSequence - 1) {
            if (active.stroke.points.length > 0) {
                userStrokes.current[userId].push(active.stroke);
                userPrevStrokes.current[userId] = [];
            }
            completedRemoteStrokesRef.current.add(active.strokeId);
            clearRemoteRecovery(active.strokeId);
            delete activeRemoteStrokesRef.current[userId];
        } else if (active.pendingEnd) {
            sendEvent('stroke:request-missing', {
                strokeId: active.strokeId, missingSequence: active.nextSequence,
            });
            incrementReliabilityMetric('missingRecoveryRequests');
            scheduleRemoteRecovery(active.strokeId, userId, 0);
        }
    }

    const sendCurrAndBuffer = () => {
        if (pointerBufferRef.current.length === 0) return;
        const points = pointerBufferRef.current;
        pointerBufferRef.current = [];
        queueDurableRef.current('stroke:points', {
            strokeId: stroke.current.strokeId,
            sequence: stroke.current.sequence++,
            points,
        });
    };

    const sendThrottleJSONMessage = useRef(throttle((coordinates) => sendEvent('cursor:move', coordinates), 100));
    const sendCurrAndBufferThrottleMessage = useRef(throttle(sendCurrAndBuffer, 30));
    const sendDrawingCursorThrottleMessage = useRef(throttle((coordinates) => sendEvent('cursor:move', coordinates), 16));



    useEffect(() => {




        const canvas = canvasRef.current;
        const scrollElement = scrollRef.current;
        const bufferedSender = sendCurrAndBufferThrottleMessage.current;
        const cursorSender = sendThrottleJSONMessage.current;
        const drawingCursorSender = sendDrawingCursorThrottleMessage.current;
        const remoteRecoveries = remoteRecoveryRef.current;
        const recoveryTimers = recoveryTimersRef.current;
        
        const ctx = canvas.getContext("2d");    
        const pointFromEvent = (event) => {
            lastPointerClientRef.current = { x: event.clientX, y: event.clientY };
            return canvasPointFromClient(canvas, event.clientX, event.clientY);
        };
        const handleScroll = () => {
            const pointer = lastPointerClientRef.current;
            if (!pointer || drawRef.current) return;
            const point = canvasPointFromClient(canvas, pointer.x, pointer.y);
            cursorSender(point);
        };




            
        const handleMouseMove = (e) => {
            if(drawRef.current){

                if(STROKES_LEFT.current === STROKE_LIMIT  && !modeRef.current) return;

                const point = pointFromEvent(e);
                drawStrokePoints(ctx, stroke.current.lastPoint, [point], stroke.current);
                stroke.current.lastPoint = point;
                pointerBufferRef.current.push(point);
                drawingCursorSender(point);
                bufferedSender();
                if(!modeRef.current){
                    STROKES_LEFT.current -= 1;
                }

                stroke.current["line_to"].push(point);

            }     

        }
        const handleMouseDown = (e) => {
            if(STROKES_LEFT.current === STROKE_LIMIT && !modeRef.current) return;
            cursorSender.cancel();
            drawRef.current = true;
            const point = pointFromEvent(e);

            stroke.current = {
                strokeId: crypto.randomUUID(),
                sequence: 0,
                move_to: point,
                lastPoint: point,
                line_to: [],
                erase: modeRef.current,
                color: strokeColor.current,
            };
            pointerBufferRef.current = [];

            queueDurableRef.current('stroke:start', {
                strokeId: stroke.current.strokeId,
                moveTo: stroke.current.move_to,
                erase: stroke.current.erase,
                color: stroke.current.color,
            });
            drawingCursorSender(point);

        }

        const finishStroke = () => {
            if (!drawRef.current) return;
            drawRef.current = false;
            drawingCursorSender.cancel();
            bufferedSender.flush();
            if(stroke.current.line_to?.length > 0){
                strokes.current.push({
                    strokeId: stroke.current.strokeId,
                    points: [...stroke.current.line_to],
                    erase: stroke.current.erase,
                    move_to: stroke.current.move_to,
                    color: stroke.current.color,
                });
            }
            queueDurableRef.current('stroke:end', {
                strokeId: stroke.current.strokeId,
                lastSequence: stroke.current.sequence - 1,
            });
            stroke.current.line_to = [];
            refreshHistoryControls(previous => previous + 1);
            modeRef.current = selectedToolRef.current === 'eraser' || controlHeldRef.current;
            canvas.style.cursor = modeRef.current ? 'cell' : 'crosshair';
            prevStrokes.current = [];
            ctx.globalCompositeOperation = 'source-over';
        };

        const handleMouseUp = (e) => {
            finishStroke();
            cursorSender(pointFromEvent(e));
        };

        const handleWindowMouseMove = (e) => {


            
                const rect = canvas.getBoundingClientRect();
                const outside = (e.clientY <= rect.top || e.clientY >= rect.bottom || e.clientX <= rect.left || e.clientX >= rect.right);
                if(outside && !isOutsideCanvas.current){
                    isOutsideCanvas.current = true;
                    finishStroke();
                }else if(!outside && isOutsideCanvas.current){
                    isOutsideCanvas.current = false;
                }
                if(!drawRef.current){
                    cursorSender(pointFromEvent(e));

 
                }
            
        }

        
        const handleCtrlDown = (e) => {
            if(e.key === 'Control' || e.ctrlKey){
                controlHeldRef.current = true;
                setControlHeld(true);
                if(!drawRef.current){
                    canvas.style.cursor = "cell";
                    modeRef.current = true;
                }
            }
        } 
        const handleCtrlUp = (e) => {
            if(e.key === "Control"){        
                controlHeldRef.current = false;
                setControlHeld(false);
                if(!drawRef.current){
                    modeRef.current = selectedToolRef.current === 'eraser';
                    canvas.style.cursor = modeRef.current ? 'cell' : 'crosshair';
                }

            }  
        } 
        const handleWindowBlur = () => {
            controlHeldRef.current = false;
            setControlHeld(false);
            if (!drawRef.current) {
                modeRef.current = selectedToolRef.current === 'eraser';
                canvas.style.cursor = modeRef.current ? 'cell' : 'crosshair';
            }
        };

        canvas.addEventListener("mouseup", handleMouseUp);
        canvas.addEventListener("mousedown", handleMouseDown);
        canvas.addEventListener("mousemove", handleMouseMove);




        window.addEventListener("mousemove", handleWindowMouseMove);
        window.addEventListener("keydown", handleCtrlDown);
        window.addEventListener("keyup", handleCtrlUp);
        window.addEventListener("blur", handleWindowBlur);
        scrollElement.addEventListener("scroll", handleScroll);


        return () => {
            canvas.removeEventListener("mouseup", handleMouseUp);
            canvas.removeEventListener("mousedown", handleMouseDown);
            canvas.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mousemove", handleWindowMouseMove);
            window.removeEventListener("keydown", handleCtrlDown);
            window.removeEventListener("keyup", handleCtrlUp);
            window.removeEventListener("blur", handleWindowBlur);
            scrollElement.removeEventListener("scroll", handleScroll);

            bufferedSender.flush();
            bufferedSender.cancel();
            drawingCursorSender.cancel();
            cursorSender.cancel();
            clearTimeout(replayTimerRef.current);
            for (const recovery of remoteRecoveries.values()) clearTimeout(recovery.timer);
            remoteRecoveries.clear();
            for (const timer of recoveryTimers) clearTimeout(timer);
            recoveryTimers.clear();

        }


    }, [sendEvent]);


    const connected = readyState === ReadyState.OPEN;
    const connectionLabel = connected ? 'Connected' : !WS_URL || readyState === ReadyState.UNINSTANTIATED
        ? 'Offline' : 'Reconnecting';
    const connectionClass = connected ? 'connected' : connectionLabel === 'Offline' ? 'offline' : 'reconnecting';
    const activeTool = controlHeld ? 'eraser' : selectedTool;
    const collaborators = Object.entries(remoteUsers);

    return (
        <div className="app-shell">
            <header className="topbar">
                <div className="topbar-brand">
                    <img className="brand-mark" src="/smiley.svg" alt="" />
                    <strong>Common Canvas</strong>
                    <span className="brand-subtitle">Draw together</span>
                </div>
                <div className="topbar-meta">
                    <div className={`connection-status ${connectionClass}`} role="status" aria-live="polite"
                        aria-label={`Realtime connection: ${connectionLabel}`}>
                        <span className="status-dot" aria-hidden="true" />{connectionLabel}
                    </div>
                    <div className="collaborators" aria-label={`${collaborators.length} other collaborators connected`}>
                        <div className="avatar-stack" aria-hidden="true">
                            {collaborators.slice(0, 3).map(([userId, name]) => (
                                <span className="avatar" key={userId} title={name}>{name.slice(0, 1).toUpperCase()}</span>
                            ))}
                        </div>
                        <span className="collaborators-label">{collaborators.length === 0
                            ? 'Just you' : `${collaborators.length} with you`}</span>
                    </div>
                    <span className="username-chip" title={`You are ${username}`}>{username}</span>
                </div>
            </header>

            <main className="workspace" aria-label="Collaborative drawing workspace">
                {(storageFullErr || saveError || !WS_URL) &&
                    <div className="workspace-alert" role="alert">
                        {saveError || (storageFullErr ? 'Storage is full. Your strokes were not saved.' : 'VITE_WS_URL is not configured.')}
                    </div>}
                {saveNotice && <div className="canvas-notice save-notice" role="status">{saveNotice}</div>}
                <div ref={scrollRef} className="workspace-scroll" aria-label="Scrollable drawing surface">
                    <div className="canvas-stage">
                        <AdminCanvas height={HEIGHT} width={WIDTH}
                            refreshVersion={savedCanvasVersion} catchupVersion={catchupVersion}
                            onPersistedStrokes={handlePersistedStrokes} />
                        {collaborators.map(([userId]) => (
                            <canvas
                                key={userId}
                                ref={element => {
                                    if (element) {
                                        canvasesRef.current[userId] = element;
                                        reDrawCanvas(undefined, userId);
                                    } else delete canvasesRef.current[userId];
                                }}
                                height={HEIGHT}
                                width={WIDTH}
                                className="drawing-canvas remote-canvas"
                                aria-label={`Drawing layer for ${remoteUsers[userId]}`}
                            />
                        ))}
                        <canvas ref={canvasRef} height={HEIGHT} width={WIDTH}
                            className="drawing-canvas local-canvas" aria-label="Your drawing canvas" />
                        {collaborators.map(([userId]) => (
                            <Cursor key={userId} cursorRef={element => {
                                if (element) {
                                    cursorElementsRef.current[userId] = element;
                                    const position = cursorPositionsRef.current[userId];
                                    if (position) {
                                        element.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`;
                                        element.style.visibility = 'visible';
                                    }
                                } else delete cursorElementsRef.current[userId];
                            }} />
                        ))}
                    </div>
                </div>
                <div className="workspace-hint">Draw on the canvas · Hold Ctrl for the eraser · Scroll to explore</div>
                <div className="workspace-toolbar" role="toolbar" aria-label="Drawing tools">
                    <button type="button" className={`tool-button ${activeTool === 'pen' ? 'active' : ''}`}
                        aria-label="Pen tool" aria-pressed={activeTool === 'pen'} title="Pen tool"
                        onClick={() => selectTool('pen')}>
                        <span className="tool-icon" aria-hidden="true">✎</span><span>Pen</span>
                    </button>
                    <button type="button" className={`tool-button ${activeTool === 'eraser' ? 'active' : ''}`}
                        aria-label="Eraser tool" aria-pressed={activeTool === 'eraser'} title="Eraser tool (hold Ctrl)"
                        onClick={() => selectTool('eraser')}>
                        <span className="tool-icon" aria-hidden="true">⌫</span><span>Eraser</span>
                    </button>
                    <span className="tool-divider" aria-hidden="true" />
                    <label className="ink-indicator" title="Choose ink before drawing. Save current strokes to change it again.">
                        <input className="ink-picker" type="color" value={inkColor}
                            disabled={strokes.current.length > 0 || prevStrokes.current.length > 0}
                            onChange={event => {
                                strokeColor.current = event.target.value;
                                setInkColor(event.target.value);
                            }}
                            aria-label="Ink color" />
                        Ink
                    </label>
                    <span className="tool-divider" aria-hidden="true" />
                    <button type="button" className="tool-button" disabled={strokes.current.length === 0}
                        onClick={() => reDrawCanvas(true)} aria-label="Undo" title="Undo">
                        <span className="tool-icon" aria-hidden="true">↶</span><span>Undo</span>
                    </button>
                    <button type="button" className="tool-button" disabled={prevStrokes.current.length === 0}
                        onClick={() => reDrawCanvas(false)} aria-label="Redo" title="Redo">
                        <span className="tool-icon" aria-hidden="true">↷</span><span>Redo</span>
                    </button>
                    <span className="tool-divider" aria-hidden="true" />
                    <span className="tool-counter">{STROKES_LEFT.current > 0
                        ? `${STROKES_LEFT.current} points left` : 'Limit reached'}</span>
                    <button type="button" className="tool-button save-button"
                        disabled={strokes.current.length === 0 || saving} onClick={save}
                        aria-label="Save drawing" title="Save drawing">
                        <span className="tool-icon" aria-hidden="true">↓</span><span>{saving ? 'Saving…' : 'Save'}</span>
                    </button>
                </div>
            </main>
        </div>
    );
}
