import { useEffect } from 'react';
import { DiceEventData } from '@drdreo/dice-box-threejs';

type DiceHoverEvent = CustomEvent<DiceEventData | null>;

export function DiceHoverOverlay() {
  useEffect(() => {
    const handler = (event: Event) => {
      const diceInfo = (event as DiceHoverEvent).detail;
      let overlay = document.querySelector('.dice-hover-overlay') as HTMLDivElement;

      if (diceInfo && diceInfo.reason !== 'remove') {
        if (!overlay) {
          overlay = document.createElement('div');
          overlay.className = 'dice-hover-overlay';
          document.querySelector('#dice-box')?.appendChild(overlay);
        }

        overlay.style.left = `${diceInfo.screenPosition.x}px`;
        overlay.style.top = `${diceInfo.screenPosition.y}px`;
        overlay.style.width = `${diceInfo.scale * 64}px`; // 필요에 맞게 조정
        overlay.style.height = `${diceInfo.scale * 64}px`;

        overlay.classList.add('active'); // ✨ 등장 애니메이션
      } else {
        overlay?.classList.remove('active'); // ✨ 사라질 때
      }
    };

    document.addEventListener('diceHover', handler);
    return () => document.removeEventListener('diceHover', handler);
  }, []);

  return null;
}
