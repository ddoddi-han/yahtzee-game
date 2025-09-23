"use client";

import { motion } from "framer-motion";
import * as React from "react";

type DiceCubeProps = {
  value: number | null;
  held: boolean;
  rollingTick: number; // 굴릴 때마다 증가시키는 값(랜덤 각도 재계산용)
  onClick: () => void;
  disabled?: boolean;
  size?: number; // px, 기본 48
};

export function DiceCube({
  value,
  held,
  rollingTick,
  onClick,
  disabled,
  size = 48,
}: DiceCubeProps) {
  // 굴릴 때마다 랜덤 회전 각도 생성
  const { rx, ry, rz } = React.useMemo(() => {
    const rand = (base = 360) => base + Math.floor(Math.random() * 360); // 360~719
    return { rx: rand(), ry: rand(), rz: Math.floor(Math.random() * 90) };
  }, [rollingTick]);

  const face = (text: React.ReactNode) => (
    <div
      className="absolute inset-0 flex items-center justify-center
                    rounded-lg bg-white border shadow-sm text-gray-900 font-semibold"
    >
      {text}
    </div>
  );

  // 한 변 길이와 translateZ 거리
  const d = size;
  const tz = d / 2;

  return (
    <div
      className={`relative`}
      style={{ width: d, height: d, perspective: 600 }}
    >
      <motion.button
        onClick={onClick}
        disabled={disabled}
        className={`relative w-full h-full rounded-lg outline-none
                    [transform-style:preserve-3d] select-none
                    ${held ? "grayscale-[40%] brightness-95" : ""}
                    ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
        // rollingTick이 바뀔 때마다 무작위 회전
        animate={{ rotateX: rx, rotateY: ry, rotateZ: rz }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* 6개 면: translateZ와 회전으로 큐브 구성 */}
        <div style={{ transform: `translateZ(${tz}px)` }}>
          {face(value ?? "•")}
        </div>
        <div style={{ transform: `rotateY(90deg) translateZ(${tz}px)` }}>
          {face(value ?? "•")}
        </div>
        <div style={{ transform: `rotateY(-90deg) translateZ(${tz}px)` }}>
          {face(value ?? "•")}
        </div>
        <div style={{ transform: `rotateY(180deg) translateZ(${tz}px)` }}>
          {face(value ?? "•")}
        </div>
        <div style={{ transform: `rotateX(90deg) translateZ(${tz}px)` }}>
          {face(value ?? "•")}
        </div>
        <div style={{ transform: `rotateX(-90deg) translateZ(${tz}px)` }}>
          {face(value ?? "•")}
        </div>

        {/* 고정(hold) 배지 */}
        {held && (
          <div
            className="absolute -top-1 -right-1 text-[10px] px-1 py-0.5
                          rounded bg-amber-500 text-white shadow"
          >
            HOLD
          </div>
        )}
      </motion.button>
    </div>
  );
}
