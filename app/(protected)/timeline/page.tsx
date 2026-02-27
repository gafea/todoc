"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import { TodoCard } from "@/components/todo-card";
import {
  CallApiError,
  endCallBySharedUser,
  pollCallForTodo,
  sendCallSignal,
  startCallForTodo,
  type CallSessionPayload,
} from "@/lib/call-client";
import {
  deleteTodo,
  fetchTodos,
  localDateTimeInputToIso,
  TodoItem,
  updateTodo,
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
    }
  | {
      type: "switched_call";
      toTodoId?: string;
    };

const formatCountdown = (differenceMs: number) => {
  if (differenceMs <= 0) {
    return "now";
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

const getMeetingStartAtMs = (todo: TodoItem) => {
  if (!todo.dueAt) {
    return null;
  }

  const dueAtMs = new Date(todo.dueAt).getTime();
  const offsetMs = Math.max(0, todo.startMeetingBeforeMin ?? 0) * 60 * 1000;
  return dueAtMs - offsetMs;
};

export default function TimelinePage() {
  const [todos, setTodos] = useState<TimelineTodo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
  const [isDebugExpanded, setIsDebugExpanded] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [localVolumeLevel, setLocalVolumeLevel] = useState(0);
  const [remoteVolumeLevel, setRemoteVolumeLevel] = useState(0);
  const [isRemoteMuted, setIsRemoteMuted] = useState(false);
  const [isRemoteVideoReady, setIsRemoteVideoReady] = useState(false);
  const [remotePresenceState, setRemotePresenceState] = useState<
    "connecting" | "online" | "offline"
  >("connecting");
  const [remoteWindowMessage, setRemoteWindowMessage] = useState<string | null>(
    null,
  );
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
  const localAudioContextRef = useRef<AudioContext | null>(null);
  const remoteAudioContextRef = useRef<AudioContext | null>(null);
  const localAudioRafRef = useRef<number | null>(null);
  const remoteAudioRafRef = useRef<number | null>(null);
  const localTrackCleanupRef = useRef<(() => void) | null>(null);
  const remoteTrackCleanupRef = useRef<(() => void) | null>(null);
  const isStartingRef = useRef(false);
  const isPollingRef = useRef(false);
  const isRefreshingRef = useRef(false);
  const suppressAutoStartUntilRef = useRef(0);
  const completionHideTimersRef = useRef<Record<string, number>>({});
  const remoteWindowMessageTimerRef = useRef<number | null>(null);
  const remotePresenceTimeoutRef = useRef<number | null>(null);

  const markRemoteOnline = useCallback(() => {
    setRemotePresenceState("online");
    if (remotePresenceTimeoutRef.current !== null) {
      window.clearTimeout(remotePresenceTimeoutRef.current);
      remotePresenceTimeoutRef.current = null;
    }
  }, []);

  const scheduleHideCompletedTodo = useCallback((todoId: string) => {
    const existingTimer = completionHideTimersRef.current[todoId];
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    completionHideTimersRef.current[todoId] = window.setTimeout(() => {
      setTodos((current) => current.filter((todo) => todo.id !== todoId));
      delete completionHideTimersRef.current[todoId];
    }, 5000);
  }, []);

  const showCompletedTemporarily = useCallback(
    (todoId: string, fallbackSource: "mine" | "shared" = "shared") => {
      let found = false;

      setTodos((current) => {
        const updated = current.map((todo) => {
          if (todo.id !== todoId) {
            return todo;
          }

          found = true;
          return {
            ...todo,
            completed: true,
          };
        });

        return updated;
      });

      if (!found) {
        void fetchTodos()
          .then((payload) => {
            const matched = [...payload.owned, ...payload.sharedWithMe].find(
              (todo) => todo.id === todoId,
            );

            if (!matched || !matched.completed || !matched.dueAt) {
              return;
            }

            setTodos((current) => {
              if (current.some((todo) => todo.id === todoId)) {
                return current;
              }

              const source =
                matched.ownerId === currentUserId ? "mine" : fallbackSource;
              return [...current, { ...matched, source }];
            });
          })
          .catch(() => {});
      }

      scheduleHideCompletedTodo(todoId);
    },
    [currentUserId, scheduleHideCompletedTodo],
  );

  const stopAudioMonitoring = useCallback((target: "local" | "remote") => {
    const isLocal = target === "local";
    const contextRef = isLocal ? localAudioContextRef : remoteAudioContextRef;
    const rafRef = isLocal ? localAudioRafRef : remoteAudioRafRef;
    const cleanupRef = isLocal ? localTrackCleanupRef : remoteTrackCleanupRef;

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    cleanupRef.current?.();
    cleanupRef.current = null;

    if (contextRef.current) {
      void contextRef.current.close();
      contextRef.current = null;
    }

    if (isLocal) {
      setLocalVolumeLevel(0);
    } else {
      setRemoteVolumeLevel(0);
      setIsRemoteMuted(false);
    }
  }, []);

  const startAudioMonitoring = useCallback(
    (stream: MediaStream, target: "local" | "remote") => {
      stopAudioMonitoring(target);

      const track = stream.getAudioTracks()[0];
      if (!track) {
        if (target === "remote") {
          setIsRemoteMuted(true);
        }
        return;
      }

      if (target === "remote") {
        const updateRemoteMuted = () => {
          setIsRemoteMuted(track.muted || track.readyState !== "live");
        };

        updateRemoteMuted();
        track.addEventListener("mute", updateRemoteMuted);
        track.addEventListener("unmute", updateRemoteMuted);
        track.addEventListener("ended", updateRemoteMuted);

        remoteTrackCleanupRef.current = () => {
          track.removeEventListener("mute", updateRemoteMuted);
          track.removeEventListener("unmute", updateRemoteMuted);
          track.removeEventListener("ended", updateRemoteMuted);
        };
      }

      const AudioContextCtor =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;

      if (!AudioContextCtor) {
        return;
      }

      const context = new AudioContextCtor();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;

      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);

      const data = new Uint8Array(analyser.fftSize);

      const measure = () => {
        analyser.getByteTimeDomainData(data);
        let sumSquares = 0;
        for (const byte of data) {
          const normalized = byte / 128 - 1;
          sumSquares += normalized * normalized;
        }

        const rms = Math.sqrt(sumSquares / data.length);
        const normalizedLevel = Math.min(1, rms * 3.2);

        if (target === "local") {
          setLocalVolumeLevel(normalizedLevel);
        } else {
          setRemoteVolumeLevel(normalizedLevel);
        }

        const raf = requestAnimationFrame(measure);
        if (target === "local") {
          localAudioRafRef.current = raf;
        } else {
          remoteAudioRafRef.current = raf;
        }
      };

      if (target === "local") {
        localAudioContextRef.current = context;
      } else {
        remoteAudioContextRef.current = context;
      }

      measure();
    },
    [stopAudioMonitoring],
  );

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
    setIsMicMuted(false);
    setIsRemoteVideoReady(false);
    setRemotePresenceState("connecting");

    if (remotePresenceTimeoutRef.current !== null) {
      window.clearTimeout(remotePresenceTimeoutRef.current);
      remotePresenceTimeoutRef.current = null;
    }
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
        .filter((todo) => Boolean(todo.dueAt) && !todo.completed)
        .sort(
          (first, second) =>
            (getMeetingStartAtMs(first) ?? Number.MAX_SAFE_INTEGER) -
            (getMeetingStartAtMs(second) ?? Number.MAX_SAFE_INTEGER),
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

  useEffect(() => {
    const handleTodoCreated = () => {
      void load();
    };

    window.addEventListener("todo:created", handleTodoCreated);
    return () => {
      window.removeEventListener("todo:created", handleTodoCreated);
    };
  }, [load]);

  const handleSignal = useCallback(
    async (todoId: string, payload: SignalPayload, fromUserId?: string) => {
      const connection = peerConnectionRef.current;

      if (payload.type === "switched_call") {
        const switchedMessage = `${fromUserId ?? "Remote user"} has switched to another call.`;
        setNotice(switchedMessage);
        setRemoteWindowMessage(switchedMessage);
        if (remoteWindowMessageTimerRef.current !== null) {
          window.clearTimeout(remoteWindowMessageTimerRef.current);
        }
        remoteWindowMessageTimerRef.current = window.setTimeout(() => {
          setRemoteWindowMessage(null);
          remoteWindowMessageTimerRef.current = null;
        }, 5000);
        suppressAutoStartUntilRef.current = Date.now() + 8000;
        releaseMediaResources();
        setActiveTodoId(null);
        setActiveCallSession(null);
        setCallRole(null);
        pushDebugMessage("Remote user switched to another call");
        return;
      }

      if (!connection) return;

      const flushPendingIceCandidates = async () => {
        if (!connection.currentRemoteDescription) {
          return;
        }

        while (pendingIceCandidatesRef.current.length > 0) {
          const candidate = pendingIceCandidatesRef.current.shift();
          if (!candidate) continue;
          try {
            if (!connection.currentRemoteDescription) {
              pendingIceCandidatesRef.current.unshift(candidate);
              break;
            }
            await connection.addIceCandidate(new RTCIceCandidate(candidate));
            pushDebugMessage("Applied queued ICE candidate");
          } catch (candidateError) {
            pushDebugMessage(
              `Failed queued ICE candidate: ${(candidateError as Error).message || "Unknown error"}`,
            );
          }
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

        try {
          await connection.addIceCandidate(
            new RTCIceCandidate(payload.candidate),
          );
        } catch (candidateError) {
          pendingIceCandidatesRef.current.push(payload.candidate);
          pushDebugMessage(
            `Deferred ICE candidate after add error: ${(candidateError as Error).message || "Unknown error"}`,
          );
        }
      }
    },
    [pushDebugMessage, releaseMediaResources],
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
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !isMicMuted;
      });
      pushDebugMessage("Local media stream acquired");

      const connection = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      const remoteStream = new MediaStream();
      localStreamRef.current = stream;
      remoteStreamRef.current = remoteStream;
      setIsRemoteVideoReady(false);
      setRemotePresenceState("connecting");
      setRemoteWindowMessage(null);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }

      stream.getTracks().forEach((track) => connection.addTrack(track, stream));

      connection.ontrack = (event) => {
        pushDebugMessage("Remote track received");
        markRemoteOnline();
        event.streams[0]?.getTracks().forEach((track) => {
          remoteStream.addTrack(track);
        });

        if (event.streams[0]) {
          startAudioMonitoring(event.streams[0], "remote");
        }
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
        if (connection.connectionState === "connected") {
          markRemoteOnline();
        }
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
    [
      currentUserId,
      isMicMuted,
      pushDebugMessage,
      releaseMediaResources,
      startAudioMonitoring,
      markRemoteOnline,
    ],
  );

  const startOrJoinCall = useCallback(
    async (todo: TimelineTodo) => {
      if (!todo.dueAt || !todo.sharedWithUserId || todo.completed) {
        return;
      }

      const connectionFailed =
        ["failed", "disconnected", "closed"].includes(connectionState) ||
        ["failed", "disconnected", "closed"].includes(iceConnectionState);

      if (activeTodoId === todo.id && !connectionFailed) {
        return;
      }

      if (activeTodoId === todo.id && connectionFailed) {
        pushDebugMessage(
          `Rebuilding call for todo ${todo.id} after connection failure`,
        );
        releaseMediaResources();
        setActiveTodoId(null);
        setActiveCallSession(null);
        setCallRole(null);
      }

      const startAtMs = getMeetingStartAtMs(todo);
      if (startAtMs === null || startAtMs > Date.now()) {
        return;
      }

      if (isStartingRef.current) return;

      try {
        isStartingRef.current = true;
        setError(null);
        setNotice(null);
        setIsPreparingCall(true);
        setDebugMessages([]);

        if (activeTodoId && activeTodoId !== todo.id) {
          try {
            await sendCallSignal(activeTodoId, {
              type: "switched_call",
              toTodoId: todo.id,
            });
          } catch {}

          releaseMediaResources();
          setActiveTodoId(null);
          setActiveCallSession(null);
          setCallRole(null);
          pushDebugMessage(`Switching from call ${activeTodoId} to ${todo.id}`);
        }

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
    [
      activeTodoId,
      connectionState,
      iceConnectionState,
      pushDebugMessage,
      releaseMediaResources,
      setupPeerConnection,
    ],
  );

  const sortedTodos = useMemo(() => {
    return [...todos].sort(
      (first, second) =>
        (getMeetingStartAtMs(first) ?? Number.MAX_SAFE_INTEGER) -
        (getMeetingStartAtMs(second) ?? Number.MAX_SAFE_INTEGER),
    );
  }, [todos]);

  const autoCallTodo = useMemo(() => {
    return sortedTodos.find(
      (todo) =>
        Boolean(todo.sharedWithUserId) &&
        Boolean(todo.dueAt) &&
        !todo.completed &&
        (getMeetingStartAtMs(todo) ?? Number.MAX_SAFE_INTEGER) <= nowMs,
    );
  }, [nowMs, sortedTodos]);

  const closestSharedTodo = useMemo(() => {
    const upcomingShared = sortedTodos.find((todo) => {
      if (todo.completed || !todo.sharedWithUserId) {
        return false;
      }

      const startAtMs = getMeetingStartAtMs(todo);
      return (startAtMs ?? Number.MAX_SAFE_INTEGER) >= nowMs;
    });

    if (upcomingShared) {
      return upcomingShared;
    }

    return (
      sortedTodos.find(
        (todo) => !todo.completed && Boolean(todo.sharedWithUserId),
      ) ?? null
    );
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
    if (Date.now() < suppressAutoStartUntilRef.current) return;
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
          const endedTodoId = activeTodoId;
          const endedTodoSource =
            activeTodo?.ownerId === currentUserId ? "mine" : "shared";
          releaseMediaResources();
          setActiveCallSession(callData.session);
          setActiveTodoId(null);
          setCallRole(null);

          void fetchTodos()
            .then((payload) => {
              const endedTodo = [
                ...payload.owned,
                ...payload.sharedWithMe,
              ].find((todo) => todo.id === endedTodoId);

              if (endedTodo?.completed) {
                showCompletedTemporarily(endedTodoId, endedTodoSource);
              } else {
                void load();
              }
            })
            .catch(() => {
              void load();
            });
          return;
        }

        setActiveCallSession(callData.session);

        const orderedSignals = [...callData.signals].sort((first, second) => {
          const firstType = (first.payload as { type?: string })?.type;
          const secondType = (second.payload as { type?: string })?.type;
          const firstPriority =
            firstType === "offer" || firstType === "answer" ? 0 : 1;
          const secondPriority =
            secondType === "offer" || secondType === "answer" ? 0 : 1;
          return firstPriority - secondPriority;
        });

        for (const signal of orderedSignals) {
          if (signal.fromUserId && signal.fromUserId !== currentUserId) {
            markRemoteOnline();
          }

          const payload = signal.payload as SignalPayload;
          if (!payload || typeof payload !== "object") continue;
          try {
            await handleSignal(activeTodoId, payload, signal.fromUserId);
          } catch (signalError) {
            pushDebugMessage(
              `Signal handling error: ${(signalError as Error).message || "Unknown error"}`,
            );
          }
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
  }, [
    activeTodo,
    activeTodoId,
    currentUserId,
    handleSignal,
    load,
    markRemoteOnline,
    pushDebugMessage,
    releaseMediaResources,
    showCompletedTemporarily,
  ]);

  useEffect(() => {
    if (!activeTodoId || !activeCallSession) {
      return;
    }

    if (remotePresenceState === "online" || isRemoteVideoReady) {
      if (remotePresenceTimeoutRef.current !== null) {
        window.clearTimeout(remotePresenceTimeoutRef.current);
        remotePresenceTimeoutRef.current = null;
      }
      return;
    }

    if (remotePresenceTimeoutRef.current !== null) {
      return;
    }

    remotePresenceTimeoutRef.current = window.setTimeout(() => {
      setRemotePresenceState((current) =>
        current === "connecting" ? "offline" : current,
      );
      remotePresenceTimeoutRef.current = null;
    }, 9000);

    return () => {
      if (remotePresenceTimeoutRef.current !== null) {
        window.clearTimeout(remotePresenceTimeoutRef.current);
        remotePresenceTimeoutRef.current = null;
      }
    };
  }, [
    activeCallSession,
    activeTodoId,
    isRemoteVideoReady,
    remotePresenceState,
  ]);

  useEffect(() => {
    if (!localStreamRef.current) {
      return;
    }

    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !isMicMuted;
    });
  }, [isMicMuted]);

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
    if (!activeTodoId || !activeCallSession) {
      stopAudioMonitoring("local");
      stopAudioMonitoring("remote");
      return;
    }

    if (localStreamRef.current) {
      startAudioMonitoring(localStreamRef.current, "local");
    }

    if (remoteStreamRef.current) {
      startAudioMonitoring(remoteStreamRef.current, "remote");
    }
  }, [
    activeCallSession,
    activeTodoId,
    startAudioMonitoring,
    stopAudioMonitoring,
  ]);

  useEffect(() => {
    const timersRef = completionHideTimersRef;

    return () => {
      for (const timerId of Object.values(timersRef.current)) {
        window.clearTimeout(timerId);
      }

      if (remoteWindowMessageTimerRef.current !== null) {
        window.clearTimeout(remoteWindowMessageTimerRef.current);
        remoteWindowMessageTimerRef.current = null;
      }

      if (remotePresenceTimeoutRef.current !== null) {
        window.clearTimeout(remotePresenceTimeoutRef.current);
        remotePresenceTimeoutRef.current = null;
      }

      stopAudioMonitoring("local");
      stopAudioMonitoring("remote");
      releaseMediaResources();
    };
  }, [releaseMediaResources, stopAudioMonitoring]);

  const endAsDone = async () => {
    if (!activeTodoId || !isCurrentUserB) return;
    try {
      setIsEndingCall(true);
      setError(null);
      setNotice(null);
      await endCallBySharedUser({ todoId: activeTodoId, markDone: true });
      suppressAutoStartUntilRef.current = Date.now() + 5000;
      releaseMediaResources();
      const completedTodoId = activeTodoId;
      const completedTodoSource =
        activeTodo?.ownerId === currentUserId ? "mine" : "shared";
      setActiveTodoId(null);
      setActiveCallSession(null);
      setCallRole(null);
      showCompletedTemporarily(completedTodoId, completedTodoSource);
      setNotice("Todo marked as done.");
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
      setNotice(null);
      await endCallBySharedUser({
        todoId: activeTodoId,
        markDone: false,
        rescheduleDueAt: localDateTimeInputToIso(rescheduleInput) ?? undefined,
      });
      suppressAutoStartUntilRef.current = Date.now() + 5000;
      releaseMediaResources();
      setActiveTodoId(null);
      setActiveCallSession(null);
      setCallRole(null);
      await load();
      setNotice("Todo has been rescheduled.");
    } catch (endError) {
      setError((endError as Error).message);
    } finally {
      setIsEndingCall(false);
    }
  };

  const canStartCallForTodo = (todo: TimelineTodo) => {
    const startAtMs = getMeetingStartAtMs(todo);
    return Boolean(
      todo.sharedWithUserId &&
      startAtMs !== null &&
      !todo.completed &&
      startAtMs <= nowMs,
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

  const toggleMute = () => {
    setIsMicMuted((current) => !current);
  };

  const isRemoteOffline =
    Boolean(activeTodo && activeCallSession) &&
    (remotePresenceState === "offline" ||
      ["failed", "disconnected", "closed"].includes(connectionState));

  const showRemoteConnecting =
    Boolean(activeTodo && activeCallSession) &&
    !isRemoteVideoReady &&
    !isRemoteOffline &&
    !remoteWindowMessage;

  const toggleCompleted = async (todo: TodoItem) => {
    try {
      setError(null);
      await updateTodo(todo.id, { completed: !todo.completed });
      await load();
    } catch (toggleError) {
      setError((toggleError as Error).message);
    }
  };

  const removeTodo = async (todo: TodoItem) => {
    try {
      setError(null);
      await deleteTodo(todo.id);
      await load();
    } catch (deleteError) {
      setError((deleteError as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Timeline</h1>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {notice && (
        <p className="text-sm text-emerald-700 dark:text-emerald-300">
          {notice}
        </p>
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
                const isClosestSharedTodo = closestSharedTodo?.id === todo.id;
                const canReconnectActiveCall =
                  isActiveCallTodo &&
                  (["failed", "disconnected", "closed"].includes(
                    connectionState,
                  ) ||
                    ["failed", "disconnected", "closed"].includes(
                      iceConnectionState,
                    ));

                return (
                  <TodoCard
                    key={todo.id}
                    todo={todo}
                    isOwnedByCurrentUser={todo.ownerId === currentUserId}
                    className={
                      isActiveCallTodo
                        ? "bg-emerald-50/60 border-emerald-400 dark:bg-emerald-950/20 dark:border-emerald-700"
                        : undefined
                    }
                    onDelete={(targetTodo) => {
                      void removeTodo(targetTodo);
                    }}
                    onToggleComplete={(targetTodo) => {
                      void toggleCompleted(targetTodo);
                    }}
                    extraInfo={
                      isClosestSharedTodo ? (
                        <p className="text-xs text-amber-600 dark:text-amber-300 font-medium">
                          Next Meeting Starts in{" "}
                          {formatCountdown(
                            (getMeetingStartAtMs(todo) ?? nowMs) - nowMs,
                          )}
                        </p>
                      ) : null
                    }
                    footerAction={
                      todo.sharedWithUserId ? (
                        todo.completed ? null : (
                          <button
                            type="button"
                            disabled={!dueReached || isPreparingCall}
                            onClick={() => startOrJoinCall(todo)}
                            className={`w-full px-3 py-2 rounded-md text-sm ${
                              isActiveCallTodo
                                ? "bg-emerald-600 text-white"
                                : dueReached
                                  ? "bg-blue-600 hover:bg-blue-700 text-white"
                                  : "bg-transparent border border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400"
                            }`}
                          >
                            {isActiveCallTodo
                              ? canReconnectActiveCall
                                ? "Reconnect Call"
                                : "Call Active"
                              : dueReached
                                ? "Start / Join Call"
                                : "Call starts at configured pre-meeting time"}
                          </button>
                        )
                      ) : null
                    }
                  />
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
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-black/90 overflow-hidden relative">
                  <div className="px-3 py-2 text-xs text-zinc-200 bg-zinc-900/80 border-b border-zinc-700 flex items-center justify-between gap-2">
                    <span>Remote: {remoteUserId ?? "Unknown"}</span>
                    <div className="flex items-center gap-2 min-w-28">
                      {isRemoteMuted ? (
                        <VolumeX size={14} className="text-zinc-300" />
                      ) : (
                        <Volume2 size={14} className="text-zinc-300" />
                      )}
                      <div className="h-1.5 w-16 rounded-full bg-zinc-700 overflow-hidden">
                        <div
                          className="h-full bg-emerald-400 transition-[width] duration-150"
                          style={{
                            width: `${Math.round(remoteVolumeLevel * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full aspect-video"
                    onPlaying={() => {
                      setIsRemoteVideoReady(true);
                      markRemoteOnline();
                    }}
                  />
                  {(showRemoteConnecting ||
                    isRemoteOffline ||
                    remoteWindowMessage) && (
                    <div className="absolute inset-x-0 bottom-0 top-9 flex items-center justify-center bg-black/55 px-4 text-center">
                      {remoteWindowMessage ? (
                        <p className="text-sm text-zinc-100 font-medium">
                          {remoteWindowMessage}
                        </p>
                      ) : isRemoteOffline ? (
                        <p className="text-sm text-zinc-100 font-medium">
                          Remote user is offline.
                        </p>
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-zinc-100">
                          <span className="h-8 w-8 rounded-full border-2 border-zinc-300 border-t-emerald-400 animate-spin" />
                          <p className="text-sm">Connecting to remote video…</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-black/90 overflow-hidden">
                  <div className="px-3 py-2 text-xs text-zinc-200 bg-zinc-900/80 border-b border-zinc-700 flex items-center justify-between gap-2">
                    <span>You: {currentUserId ?? "Unknown"}</span>
                    <div className="flex items-center gap-2 min-w-28">
                      {isMicMuted ? (
                        <VolumeX size={14} className="text-zinc-300" />
                      ) : (
                        <Volume2 size={14} className="text-zinc-300" />
                      )}
                      <div className="h-1.5 w-16 rounded-full bg-zinc-700 overflow-hidden">
                        <div
                          className="h-full bg-emerald-400 transition-[width] duration-150"
                          style={{
                            width: `${Math.round(localVolumeLevel * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
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

              <button
                type="button"
                onClick={toggleMute}
                className="w-full px-3 py-2 rounded-md bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-sm inline-flex items-center justify-center gap-2"
              >
                {isMicMuted ? <MicOff size={16} /> : <Mic size={16} />}
                {isMicMuted ? "Unmute My Microphone" : "Mute My Microphone"}
              </button>

              <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-3">
                <button
                  type="button"
                  onClick={() => setIsDebugExpanded((current) => !current)}
                  className="w-full text-left inline-flex items-center justify-between text-sm font-medium"
                >
                  <span>
                    Call state:{" "}
                    {isPreparingCall
                      ? "Preparing..."
                      : activeCallSession.status}
                  </span>
                  {isDebugExpanded ? (
                    <ChevronUp size={16} />
                  ) : (
                    <ChevronDown size={16} />
                  )}
                </button>

                {isDebugExpanded ? (
                  <>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 space-y-1 mt-2 mb-2">
                      Role: {callRole === "A" ? "Owner" : "Shared user"}, Peer:{" "}
                      {connectionState}, ICE: {iceConnectionState}, Signaling:{" "}
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
                  </>
                ) : null}
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
                    End Call & Mark as Done
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
                    End Call & Reschedule Due Date
                  </button>
                </div>
              ) : (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Your friend is the one who can stop the call and mark todo as
                  done or reschedule.
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
