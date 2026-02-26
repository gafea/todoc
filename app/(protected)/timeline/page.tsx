"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CallApiError,
  endCallBySharedUser,
  pollCallForTodo,
  sendCallSignal,
  startCallForTodo,
  type CallSessionPayload,
} from "@/lib/call-client";
import {
  fetchTodos,
  localDateTimeInputToIso,
  TodoItem,
} from "@/lib/todo-client";

type TimelineTodo = TodoItem & {
  source: "mine" | "shared";
};

type SignalPayload =
  | {
      type: "offer" | "answer";
      sdp: RTCSessionDescriptionInit;
    }
  | {
      type: "ice";
      candidate: RTCIceCandidateInit;
    };

const formatCountdown = (differenceMs: number) => {
  if (differenceMs <= 0) {
    return "Starting now";
  }

  const totalSeconds = Math.floor(differenceMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const timePart = [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");

  if (days > 0) {
    return `${days}d ${timePart}`;
  }

  return timePart;
};

export default function TimelinePage() {
  const [todos, setTodos] = useState<TimelineTodo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeTodoId, setActiveTodoId] = useState<string | null>(null);
  const [activeCallSession, setActiveCallSession] =
    useState<CallSessionPayload | null>(null);
  const [callRole, setCallRole] = useState<"A" | "B" | null>(null);
  const [isPreparingCall, setIsPreparingCall] = useState(false);
  const [isEndingCall, setIsEndingCall] = useState(false);
  const [rescheduleInput, setRescheduleInput] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [debugMessages, setDebugMessages] = useState<string[]>([]);
  const [iceConnectionState, setIceConnectionState] =
    useState<RTCIceConnectionState>("new");
  const [signalingState, setSignalingState] =
    useState<RTCSignalingState>("stable");
  const [connectionState, setConnectionState] =
    useState<RTCPeerConnectionState>("new");

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const isStartingRef = useRef(false);
  const isPollingRef = useRef(false);
  const isRefreshingRef = useRef(false);

  const pushDebugMessage = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const entry = `[${timestamp}] ${message}`;
    setDebugMessages((current) => [...current.slice(-24), entry]);
  }, []);

  const releaseMediaResources = useCallback(() => {
    pushDebugMessage("Releasing media resources and closing peer connection");

    if (peerConnectionRef.current) {
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.oniceconnectionstatechange = null;
      peerConnectionRef.current.onsignalingstatechange = null;
      peerConnectionRef.current.onconnectionstatechange = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    pendingIceCandidatesRef.current = [];

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach((track) => track.stop());
      remoteStreamRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    setIceConnectionState("new");
    setSignalingState("stable");
    setConnectionState("new");
  }, [pushDebugMessage]);

  const load = useCallback(async () => {
    if (isRefreshingRef.current) {
      return;
    }

    isRefreshingRef.current = true;

    try {
      setError(null);
      const payload = await fetchTodos();

      if (payload.currentUserId) {
        setCurrentUserId(payload.currentUserId);
      }

      const withDueDates: TimelineTodo[] = [
        ...payload.owned.map((todo) => ({
          ...todo,
          source: "mine" as const,
        })),
        ...payload.sharedWithMe.map((todo) => ({
          ...todo,
          source: "shared" as const,
        })),
      ]
        .filter((todo) => Boolean(todo.dueAt))
        .sort(
          (first, second) =>
            new Date(first.dueAt as string).getTime() -
            new Date(second.dueAt as string).getTime(),
        );

      setTodos(withDueDates);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setIsLoading(false);
      isRefreshingRef.current = false;
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      load();
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [load]);

  const handleSignal = useCallback(
    async (todoId: string, payload: SignalPayload) => {
      const connection = peerConnectionRef.current;
      if (!connection) return;

      const flushPendingIceCandidates = async () => {
        if (!connection.currentRemoteDescription) {
          return;
        }

        while (pendingIceCandidatesRef.current.length > 0) {
          const candidate = pendingIceCandidatesRef.current.shift();
          if (!candidate) continue;
          await connection.addIceCandidate(new RTCIceCandidate(candidate));
          pushDebugMessage("Applied queued ICE candidate");
        }
      };

      if (payload.type === "offer") {
        pushDebugMessage("Received offer signal");
        if (!payload.sdp?.type || !payload.sdp?.sdp) return;
        await connection.setRemoteDescription(
          new RTCSessionDescription(payload.sdp),
        );
        await flushPendingIceCandidates();
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        if (
          !connection.localDescription?.type ||
          !connection.localDescription?.sdp
        ) {
          throw new Error("Failed to prepare WebRTC answer");
        }
        await sendCallSignal(todoId, {
          type: "answer",
          sdp: {
            type: connection.localDescription.type,
            sdp: connection.localDescription.sdp,
          },
        });
        pushDebugMessage("Sent answer signal");
      }

      if (payload.type === "answer") {
        pushDebugMessage("Received answer signal");
        if (!payload.sdp?.type || !payload.sdp?.sdp) return;
        if (!connection.currentRemoteDescription) {
          await connection.setRemoteDescription(
            new RTCSessionDescription(payload.sdp),
          );
        }
        await flushPendingIceCandidates();
      }

      if (payload.type === "ice") {
        pushDebugMessage("Received ICE candidate");
        if (!connection.currentRemoteDescription) {
          pendingIceCandidatesRef.current.push(payload.candidate);
          pushDebugMessage(
            "Queued ICE candidate (remote description not ready)",
          );
          return;
        }

        await connection.addIceCandidate(
          new RTCIceCandidate(payload.candidate),
        );
      }
    },
    [pushDebugMessage],
  );

  const setupPeerConnection = useCallback(
    async (todoId: string, session: CallSessionPayload) => {
      pushDebugMessage("Initializing peer connection");
      releaseMediaResources();

      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== "function"
      ) {
        if (typeof window !== "undefined" && !window.isSecureContext) {
          throw new Error(
            "Video call is unavailable in this browser context. Open the app via HTTPS (or localhost) and allow camera/microphone access.",
          );
        }

        throw new Error(
          "Your browser does not support camera/microphone WebRTC APIs (mediaDevices.getUserMedia).",
        );
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      pushDebugMessage("Local media stream acquired");

      const connection = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      const remoteStream = new MediaStream();
      localStreamRef.current = stream;
      remoteStreamRef.current = remoteStream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }

      stream.getTracks().forEach((track) => connection.addTrack(track, stream));

      connection.ontrack = (event) => {
        pushDebugMessage("Remote track received");
        event.streams[0]?.getTracks().forEach((track) => {
          remoteStream.addTrack(track);
        });
      };

      connection.onicecandidate = async (event) => {
        if (!event.candidate) return;
        await sendCallSignal(todoId, {
          type: "ice",
          candidate: event.candidate.toJSON(),
        });
        pushDebugMessage("Sent ICE candidate");
      };

      connection.oniceconnectionstatechange = () => {
        setIceConnectionState(connection.iceConnectionState);
        pushDebugMessage(`ICE state: ${connection.iceConnectionState}`);
      };

      connection.onsignalingstatechange = () => {
        setSignalingState(connection.signalingState);
        pushDebugMessage(`Signaling state: ${connection.signalingState}`);
      };

      connection.onconnectionstatechange = () => {
        setConnectionState(connection.connectionState);
        pushDebugMessage(`Connection state: ${connection.connectionState}`);
      };

      peerConnectionRef.current = connection;

      if (currentUserId === session.initiatorUserId) {
        pushDebugMessage("Current user is initiator, creating offer");
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        if (
          !connection.localDescription?.type ||
          !connection.localDescription?.sdp
        ) {
          throw new Error("Failed to prepare WebRTC offer");
        }
        await sendCallSignal(todoId, {
          type: "offer",
          sdp: {
            type: connection.localDescription.type,
            sdp: connection.localDescription.sdp,
          },
        });
        pushDebugMessage("Sent offer signal");
      }
    },
    [currentUserId, pushDebugMessage, releaseMediaResources],
  );

  const startOrJoinCall = useCallback(
    async (todo: TimelineTodo) => {
      if (!todo.dueAt || !todo.sharedWithUserId || todo.completed) {
        return;
      }

      if (new Date(todo.dueAt).getTime() > Date.now()) {
        return;
      }

      if (isStartingRef.current) return;

      try {
        isStartingRef.current = true;
        setError(null);
        setIsPreparingCall(true);
        setDebugMessages([]);
        pushDebugMessage(`Starting or joining call for todo ${todo.id}`);

        const started = await startCallForTodo(todo.id);
        pushDebugMessage(`Call session ready (${started.session.status})`);
        await setupPeerConnection(todo.id, started.session);

        setActiveTodoId(todo.id);
        setActiveCallSession(started.session);
        setCallRole(started.role);
        setRescheduleInput("");
      } catch (startError) {
        releaseMediaResources();
        setActiveTodoId(null);
        setActiveCallSession(null);
        setCallRole(null);
        pushDebugMessage(
          `Call setup failed: ${(startError as Error).message || "Unknown error"}`,
        );
        setError((startError as Error).message);
      } finally {
        setIsPreparingCall(false);
        isStartingRef.current = false;
      }
    },
    [pushDebugMessage, releaseMediaResources, setupPeerConnection],
  );

  const sortedTodos = useMemo(() => {
    return [...todos].sort(
      (first, second) =>
        new Date(first.dueAt as string).getTime() -
        new Date(second.dueAt as string).getTime(),
    );
  }, [todos]);

  const autoCallTodo = useMemo(() => {
    return sortedTodos.find(
      (todo) =>
        Boolean(todo.sharedWithUserId) &&
        Boolean(todo.dueAt) &&
        !todo.completed &&
        new Date(todo.dueAt as string).getTime() <= nowMs,
    );
  }, [nowMs, sortedTodos]);

  const closestTodo = useMemo(() => {
    const upcoming = sortedTodos.find(
      (todo) =>
        !todo.completed && new Date(todo.dueAt as string).getTime() >= nowMs,
    );
    if (upcoming) {
      return upcoming;
    }

    return sortedTodos.find((todo) => !todo.completed) ?? null;
  }, [nowMs, sortedTodos]);

  const activeTodo = useMemo(
    () => todos.find((todo) => todo.id === activeTodoId) ?? null,
    [activeTodoId, todos],
  );

  const isCurrentUserB = Boolean(
    activeTodo &&
    currentUserId &&
    activeTodo.sharedWithUserId === currentUserId,
  );

  useEffect(() => {
    if (!currentUserId || activeTodoId || !autoCallTodo) return;
    startOrJoinCall(autoCallTodo);
  }, [autoCallTodo, activeTodoId, currentUserId, startOrJoinCall]);

  useEffect(() => {
    if (!activeTodoId) return;

    let cancelled = false;
    const intervalId = window.setInterval(async () => {
      if (isPollingRef.current) {
        return;
      }

      isPollingRef.current = true;

      try {
        const callData = await pollCallForTodo(activeTodoId);
        if (cancelled) return;

        if (callData.signals.length > 0) {
          pushDebugMessage(
            `Polled ${callData.signals.length} pending signal(s) from server`,
          );
        }

        if (!callData.session || callData.session.status !== "active") {
          pushDebugMessage("Call session is no longer active");
          releaseMediaResources();
          setActiveCallSession(callData.session);
          setActiveTodoId(null);
          setCallRole(null);
          return;
        }

        setActiveCallSession(callData.session);

        for (const signal of callData.signals) {
          const payload = signal.payload as SignalPayload;
          if (!payload || typeof payload !== "object") continue;
          await handleSignal(activeTodoId, payload);
        }
      } catch (pollError) {
        if (!cancelled) {
          if (
            pollError instanceof CallApiError &&
            [400, 403, 404].includes(pollError.status)
          ) {
            pushDebugMessage(
              `Polling stopped (HTTP ${pollError.status}): ${pollError.message}`,
            );
            releaseMediaResources();
            setActiveCallSession(null);
            setActiveTodoId(null);
            setCallRole(null);
            return;
          }

          pushDebugMessage(
            `Polling error: ${(pollError as Error).message || "Unknown error"}`,
          );

          if (!(pollError instanceof DOMException)) {
            setError((pollError as Error).message);
          }
        }
      } finally {
        isPollingRef.current = false;
      }
    }, 1500);

    return () => {
      cancelled = true;
      isPollingRef.current = false;
      window.clearInterval(intervalId);
    };
  }, [activeTodoId, handleSignal, pushDebugMessage, releaseMediaResources]);

  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      if (localVideoRef.current.srcObject !== localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }

      void localVideoRef.current.play().catch((playError) => {
        if (
          playError instanceof DOMException &&
          playError.name === "AbortError"
        ) {
          return;
        }
        pushDebugMessage(
          `Local autoplay blocked: ${(playError as Error).message || "Unknown error"}`,
        );
      });
    }

    if (remoteVideoRef.current && remoteStreamRef.current) {
      if (remoteVideoRef.current.srcObject !== remoteStreamRef.current) {
        remoteVideoRef.current.srcObject = remoteStreamRef.current;
      }

      void remoteVideoRef.current.play().catch((playError) => {
        if (
          playError instanceof DOMException &&
          playError.name === "AbortError"
        ) {
          return;
        }
        pushDebugMessage(
          `Remote autoplay blocked: ${(playError as Error).message || "Unknown error"}`,
        );
      });
    }
  }, [activeTodoId, activeCallSession, pushDebugMessage]);

  useEffect(() => {
    return () => {
      releaseMediaResources();
    };
  }, [releaseMediaResources]);

  const endAsDone = async () => {
    if (!activeTodoId || !isCurrentUserB) return;
    try {
      setIsEndingCall(true);
      setError(null);
      await endCallBySharedUser({ todoId: activeTodoId, markDone: true });
      releaseMediaResources();
      setActiveTodoId(null);
      setActiveCallSession(null);
      setCallRole(null);
      await load();
    } catch (endError) {
      setError((endError as Error).message);
    } finally {
      setIsEndingCall(false);
    }
  };

  const endAndReschedule = async () => {
    if (!activeTodoId || !isCurrentUserB || !rescheduleInput) return;
    try {
      setIsEndingCall(true);
      setError(null);
      await endCallBySharedUser({
        todoId: activeTodoId,
        markDone: false,
        rescheduleDueAt: localDateTimeInputToIso(rescheduleInput) ?? undefined,
      });
      releaseMediaResources();
      setActiveTodoId(null);
      setActiveCallSession(null);
      setCallRole(null);
      await load();
    } catch (endError) {
      setError((endError as Error).message);
    } finally {
      setIsEndingCall(false);
    }
  };

  const canStartCallForTodo = (todo: TimelineTodo) => {
    return Boolean(
      todo.sharedWithUserId &&
      todo.dueAt &&
      !todo.completed &&
      new Date(todo.dueAt).getTime() <= nowMs,
    );
  };

  const minRescheduleDateTime = useMemo(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  }, []);

  const remoteUserId = useMemo(() => {
    if (!activeCallSession || !currentUserId) {
      return null;
    }

    if (currentUserId === activeCallSession.initiatorUserId) {
      return activeCallSession.recipientUserId;
    }

    return activeCallSession.initiatorUserId;
  }, [activeCallSession, currentUserId]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Timeline</h1>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-4 min-h-[28rem]">
          <h2 className="text-lg font-semibold">Todo List View</h2>

          {isLoading ? null : sortedTodos.length === 0 ? (
            <p className="text-zinc-500 dark:text-zinc-400">
              No todos with date and time set.
            </p>
          ) : (
            <div className="space-y-3">
              {sortedTodos.map((todo) => {
                const dueReached = canStartCallForTodo(todo);
                const isActiveCallTodo = activeTodoId === todo.id;
                const isClosestTodo = closestTodo?.id === todo.id;

                return (
                  <article
                    key={todo.id}
                    className={`rounded-md border p-3 ${
                      todo.source === "mine"
                        ? "border-blue-300 dark:border-blue-700 bg-blue-50/60 dark:bg-blue-950/20"
                        : "border-emerald-300 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-950/20"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium break-words">{todo.text}</p>
                      <span
                        className={`text-[11px] px-2 py-1 rounded-full ${
                          todo.source === "mine"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200"
                            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200"
                        }`}
                      >
                        {todo.source === "mine" ? "Mine" : "Shared with me"}
                      </span>
                    </div>

                    {todo.description && (
                      <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-1 break-words">
                        {todo.description}
                      </p>
                    )}

                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                      Due: {new Date(todo.dueAt as string).toLocaleString()}
                    </p>

                    {isClosestTodo ? (
                      <p className="text-xs text-amber-600 dark:text-amber-300 mt-1 font-medium">
                        Starts in{" "}
                        {formatCountdown(
                          new Date(todo.dueAt as string).getTime() - nowMs,
                        )}
                      </p>
                    ) : null}

                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                      {todo.source === "mine"
                        ? "My Todos"
                        : `Shared by ${todo.ownerId}`}
                    </p>

                    {todo.sharedWithUserId ? (
                      <button
                        type="button"
                        disabled={!dueReached || isPreparingCall}
                        onClick={() => startOrJoinCall(todo)}
                        className={`mt-2 w-full px-3 py-2 rounded-md text-sm ${
                          isActiveCallTodo
                            ? "bg-emerald-600 text-white"
                            : "bg-blue-600 hover:bg-blue-700 text-white disabled:bg-blue-400"
                        }`}
                      >
                        {isActiveCallTodo
                          ? "Call Active"
                          : dueReached
                            ? "Start / Join Call"
                            : "Call starts when due time is reached"}
                      </button>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-4 min-h-[28rem]">
          <h2 className="text-lg font-semibold">Video Call</h2>

          {!activeTodo || !activeCallSession ? (
            <p className="text-zinc-500 dark:text-zinc-400">
              Waiting for a due shared todo call.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3">
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-black/90 overflow-hidden">
                  <div className="px-3 py-2 text-xs text-zinc-200 bg-zinc-900/80 border-b border-zinc-700">
                    Remote: {remoteUserId ?? "Unknown"}
                  </div>
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full aspect-video"
                  />
                </div>

                <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-black/90 overflow-hidden">
                  <div className="px-3 py-2 text-xs text-zinc-200 bg-zinc-900/80 border-b border-zinc-700">
                    You: {currentUserId ?? "Unknown"}
                  </div>
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full aspect-video"
                  />
                </div>
              </div>

              <div className="text-xs text-zinc-500 dark:text-zinc-400 space-y-1">
                <p>Todo: {activeTodo.text}</p>
                <p>Role: {callRole === "A" ? "Owner" : "Shared user"}</p>
                <p>
                  Call state:{" "}
                  {isPreparingCall ? "Preparing..." : activeCallSession.status}
                </p>
              </div>

              <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-3">
                <p className="text-sm font-medium mb-2">WebRTC Debug</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 space-y-1 mb-2">
                  Peer: {connectionState}, ICE: {iceConnectionState}, Signaling:{" "}
                  {signalingState}
                </p>
                <div className="max-h-36 overflow-y-auto space-y-1 text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                  {debugMessages.length === 0 ? (
                    <p>No debug events yet.</p>
                  ) : (
                    debugMessages
                      .slice()
                      .reverse()
                      .map((message, index) => (
                        <p key={`${message}-${index}`}>{message}</p>
                      ))
                  )}
                </div>
              </div>

              {isCurrentUserB ? (
                <div className="space-y-2 rounded-lg border border-zinc-200 dark:border-zinc-700 p-3">
                  <p className="text-sm font-medium">
                    You can stop the call and mark as complete or reschedule.
                  </p>
                  <button
                    type="button"
                    onClick={endAsDone}
                    disabled={isEndingCall}
                    className="w-full px-3 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm"
                  >
                    Stop Call & Mark as Done
                  </button>

                  <input
                    type="datetime-local"
                    min={minRescheduleDateTime}
                    value={rescheduleInput}
                    onChange={(event) => setRescheduleInput(event.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm"
                  />
                  <button
                    type="button"
                    onClick={endAndReschedule}
                    disabled={isEndingCall || !rescheduleInput}
                    className="w-full px-3 py-2 rounded-md bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-sm"
                  >
                    Stop Call & Reschedule Due Date
                  </button>
                </div>
              ) : (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Waiting for your friend to stop the call and decide
                  done/reschedule.
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
