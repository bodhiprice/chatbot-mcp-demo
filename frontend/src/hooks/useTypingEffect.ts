import { useState, useEffect, useRef } from 'react';

interface UseTypingEffectOptions {
  speed?: number;
  enabled?: boolean;
}

export function useTypingEffect(targetText: string, options: UseTypingEffectOptions = {}) {
  const { speed = 20, enabled = true } = options;
  const [displayedText, setDisplayedText] = useState('');
  const indexRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) {
      setDisplayedText(targetText);
      return;
    }

    if (targetText.length === 0) {
      setDisplayedText('');
      indexRef.current = 0;
      return;
    }

    if (indexRef.current >= targetText.length) {
      return;
    }

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      setDisplayedText(targetText.slice(0, indexRef.current + 1));
      indexRef.current++;

      if (indexRef.current >= targetText.length) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    }, speed);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [targetText, speed, enabled]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return displayedText;
}