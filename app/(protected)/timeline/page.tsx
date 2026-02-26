"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const isStartingRef = useRef(false);

  const releaseMediaResources = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

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
  }, []);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [payload, authResponse] = await Promise.all([
        fetchTodos(),
        fetch("/api/auth/status", { cache: "no-store" }),
      ]);

      const authPayload = await authResponse.json().catch(() => null);
      if (
        authPayload?.authenticated &&
        typeof authPayload?.userId === "string"
      ) {
        setCurrentUserId(authPayload.userId);
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

      if (payload.type === "offer") {
        if (!payload.sdp?.type || !payload.sdp?.sdp) return;
        await connection.setRemoteDescription(
          new RTCSessionDescription(payload.sdp),
        );
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
      }

      if (payload.type === "answer") {
        if (!payload.sdp?.type || !payload.sdp?.sdp) return;
        if (!connection.currentRemoteDescription) {
          await connection.setRemoteDescription(
            new RTCSessionDescription(payload.sdp),
          );
        }
      }

      if (payload.type === "ice") {
        await connection.addIceCandidate(
          new RTCIceCandidate(payload.candidate),
        );
      }
    },
    [],
  );

  const setupPeerConnection = useCallback(
    async (todoId: string, session: CallSessionPayload) => {
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
      };

      peerConnectionRef.current = connection;

      if (currentUserId === session.initiatorUserId) {
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
      }
    },
    [currentUserId, releaseMediaResources],
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

        const started = await startCallForTodo(todo.id);
        setActiveTodoId(todo.id);
        setActiveCallSession(started.session);
        setCallRole(started.role);
        setRescheduleInput("");

        await setupPeerConnection(todo.id, started.session);
      } catch (startError) {
        setError((startError as Error).message);
      } finally {
        setIsPreparingCall(false);
        isStartingRef.current = false;
      }
    },
    [setupPeerConnection],
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
    if (!activeTodoId || !peerConnectionRef.current) return;

    let cancelled = false;
    const intervalId = window.setInterval(async () => {
      try {
        const callData = await pollCallForTodo(activeTodoId);
        if (cancelled) return;

        if (!callData.session || callData.session.status !== "active") {
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
          setError((pollError as Error).message);
        }
      }
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeTodoId, handleSignal, releaseMediaResources]);

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
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full aspect-video"
                  />
                </div>

                <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-black/90 overflow-hidden">
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
                <p>
                  Role: {callRole === "A" ? "A (owner)" : "B (shared user)"}
                </p>
                <p>
                  Call state:{" "}
                  {isPreparingCall ? "Preparing..." : activeCallSession.status}
                </p>
              </div>

              {isCurrentUserB ? (
                <div className="space-y-2 rounded-lg border border-zinc-200 dark:border-zinc-700 p-3">
                  <p className="text-sm font-medium">
                    Only B can stop the call and choose completion or
                    reschedule.
                  </p>
                  <button
                    type="button"
                    onClick={endAsDone}
                    disabled={isEndingCall}
                    className="w-full px-3 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm"
                  >
                    Stop Call & Mark Todo Done
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
                  Waiting for B to stop the call and decide done/reschedule.
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
