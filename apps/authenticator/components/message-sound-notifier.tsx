'use client';

/**
 * Plays a short beep whenever the authenticator receives an incoming message
 * (from any conversation they participate in), as long as it wasn't sent by them.
 *
 * Works in both visible and background tabs. The first user gesture on the page
 * unlocks the AudioContext (browser autoplay policy); attempts before that
 * silently fail — acceptable because user must log in first anyway.
 *
 * Tone: 2-note "ding" via Web Audio Oscillator (no asset needed). Replaceable
 * with an MP3 later by swapping `playBeep` for an `<audio>` element.
 */
import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { api, getToken } from '@/lib/api';

const SOCKET_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000')
  .replace(/\/api\/?$/, '');

export function MessageSoundNotifier() {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const meIdRef = useRef<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Unlock AudioContext on first user gesture (browser policy)
  useEffect(() => {
    const unlock = () => {
      if (!audioCtxRef.current) {
        try {
          const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
          if (Ctx) audioCtxRef.current = new Ctx();
        } catch {}
      }
      if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
    };
    window.addEventListener('click', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock);
    return () => {
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, []);

  function playBeep() {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    try {
      // Two-tone ding: 880Hz → 660Hz, ~200ms total
      const now = ctx.currentTime;
      const playTone = (freq: number, start: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now + start);
        gain.gain.linearRampToValueAtTime(0.15, now + start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + start);
        osc.stop(now + start + dur);
      };
      playTone(880, 0, 0.12);
      playTone(660, 0.1, 0.15);
    } catch {}
  }

  // Connect socket + subscribe to user-room message events
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    api.me()
      .then((m) => {
        if (cancelled) return;
        meIdRef.current = m.id;
        const socket = io(`${SOCKET_URL}/chat`, {
          auth: { token },
          transports: ['websocket', 'polling'],
        });
        socketRef.current = socket;
        socket.on('connect', () => {
          // Server auto-joins this socket to `user:{userId}` room on auth.
          // No explicit join needed here.
        });
        socket.on('message', (msg: { senderId?: string }) => {
          // Don't beep on own messages
          if (msg?.senderId && msg.senderId === meIdRef.current) return;
          playBeep();
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  return null;
}
