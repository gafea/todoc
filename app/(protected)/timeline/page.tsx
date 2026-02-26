"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  endCallBySharedUser,
  pollCallForTodo,
  sendCallSignal,
  startCallForTodo,
  type CallSessionPayload,
} from "@/lib/call-client";
import { fetchTodos, TodoItem } from "@/lib/todo-client";

const monthColorClasses = [
  "border-blue-300 dark:border-blue-700 bg-blue-50/70 dark:bg-blue-950/30",
  "border-emerald-300 dark:border-emerald-700 bg-emerald-50/70 dark:bg-emerald-950/30",
  "border-violet-300 dark:border-violet-700 bg-violet-50/70 dark:bg-violet-950/30",
  "border-amber-300 dark:border-amber-700 bg-amber-50/70 dark:bg-amber-950/30",
  "border-rose-300 dark:border-rose-700 bg-rose-50/70 dark:bg-rose-950/30",
  "border-cyan-300 dark:border-cyan-700 bg-cyan-50/70 dark:bg-cyan-950/30",
  "border-lime-300 dark:border-lime-700 bg-lime-50/70 dark:bg-lime-950/30",
  "border-fuchsia-300 dark:border-fuchsia-700 bg-fuchsia-50/70 dark:bg-fuchsia-950/30",
  "border-orange-300 dark:border-orange-700 bg-orange-50/70 dark:bg-orange-950/30",
  "border-sky-300 dark:border-sky-700 bg-sky-50/70 dark:bg-sky-950/30",
  "border-teal-300 dark:border-teal-700 bg-teal-50/70 dark:bg-teal-950/30",
  "border-indigo-300 dark:border-indigo-700 bg-indigo-50/70 dark:bg-indigo-950/30",
];

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

const monthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const monthLabel = (month: string) => {
  const [year, monthPart] = month.split("-");
  return new Date(Number(year), Number(monthPart) - 1, 1).toLocaleString(
    undefined,
    {
      month: "long",
      year: "numeric",
    },
  );
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
        if (!connection.localDescription?.type || !connection.localDescription?.sdp) {
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
        if (!connection.localDescription?.type || !connection.localDescription?.sdp) {
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

  const grouped = useMemo(() => {
    const groups = new Map<string, TimelineTodo[]>();
    for (const todo of todos) {
      const key = monthKey(new Date(todo.dueAt as string));
      const current = groups.get(key) ?? [];
      current.push(todo);
      groups.set(key, current);
    }
    return Array.from(groups.entries());
  }, [todos]);

  const autoCallTodo = useMemo(() => {
    return todos.find(
      (todo) =>
        Boolean(todo.sharedWithUserId) &&
        Boolean(todo.dueAt) &&
        !todo.completed &&
        new Date(todo.dueAt as string).getTime() <= Date.now(),
    );
  }, [todos]);

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
        rescheduleDueAt: rescheduleInput,
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
      new Date(todo.dueAt).getTime() <= Date.now(),
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

          {isLoading ? null : grouped.length === 0 ? (
            <p className="text-zinc-500 dark:text-zinc-400">
              No todos with date and time set.
            </p>
          ) : (
            <div className="overflow-x-auto pb-2">
              <div className="inline-flex items-stretch gap-0 min-w-full">
                {grouped.map(([month, monthTodos], index) => (
                  <div key={month} className="inline-flex items-stretch">
                    <section
                      className={`w-80 shrink-0 border rounded-lg p-4 ${monthColorClasses[index % monthColorClasses.length]}`}
                    >
                      <h3 className="font-semibold mb-3">
                        {monthLabel(month)}
                      </h3>
                      <div className="space-y-3">
                        {monthTodos.map((todo) => {
                          const dueReached = canStartCallForTodo(todo);
                          const isActiveCallTodo = activeTodoId === todo.id;

                          return (
                            <article
                              key={todo.id}
                              className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-900/70 p-3"
                            >
                              <p className="font-medium break-words">
                                {todo.text}
                              </p>
                              {todo.description && (
                                <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-1 break-words">
                                  {todo.description}
                                </p>
                              )}
                              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                                {new Date(
                                  todo.dueAt as string,
                                ).toLocaleString()}
                              </p>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                                {todo.source === "mine"
                                  ? "From: My Todos"
                                  : `From: Shared by ${todo.ownerId}`}
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
                    </section>
                    {index < grouped.length - 1 && (
                      <div className="mx-4 h-auto w-px bg-zinc-300 dark:bg-zinc-700 self-stretch" />
                    )}
                  </div>
                ))}
              </div>
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
