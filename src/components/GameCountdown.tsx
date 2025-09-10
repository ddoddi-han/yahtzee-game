"use client";

import * as React from "react";

interface GameCountdownProps {
  countdown: number | null;
  started: boolean;
}

export function GameCountdown({ countdown, started }: GameCountdownProps) {
  if (countdown !== null && !started) {
    return (
      <p className="text-center text-lg font-bold text-emerald-600">
        {countdown}초 후 게임을 시작합니다.
      </p>
    );
  }

  if (started) {
    return (
      <p className="text-center text-lg font-bold text-red-600">게임 시작!</p>
    );
  }

  return null;
}
