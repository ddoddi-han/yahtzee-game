'use client';

import DiceBox, { DiceResult } from '@drdreo/dice-box-threejs';
import * as React from 'react';
import { DiceValue } from '../domain/scoring';

let diceBox: DiceBox | null = null;

export function createDiceIdMapper() {
  const diceIdToIndex = new Map<number, number>();

  return {
    rememberRolls(rolls: Pick<DiceResult, 'id'>[], originIndexes: number[]) {
      rolls.forEach((die, index) => {
        const originIndex = originIndexes[index];
        if (originIndex !== undefined) diceIdToIndex.set(die.id, originIndex);
      });
    },
    remember(engineId: number, originIndex: number) {
      diceIdToIndex.set(engineId, originIndex);
    },
    forget(engineId: number) {
      diceIdToIndex.delete(engineId);
    },
    handleEngineClick(engineId: number, handler: (originIndex: number) => void) {
      const originIndex = diceIdToIndex.get(engineId);
      if (originIndex !== undefined) handler(originIndex);
    },
  };
}

export function useDiceBoxAdapter(onDiceClick: (originIndex: number) => Promise<boolean>) {
  const boxRef = React.useRef<DiceBox | null>(null);
  const mapperRef = React.useRef(createDiceIdMapper());

  React.useEffect(() => {
    if (!diceBox) {
      diceBox = new DiceBox('#dice-box', {
        baseScale: 70,
        light_intensity: 13,
        strength: 8,
        enableDiceSelection: true,
      });

      diceBox.initialize().then(() => {
        if (!diceBox) return;
        diceBox.initialized = true;
        boxRef.current = diceBox;
      });
    } else {
      boxRef.current = diceBox;
    }
  }, []);

  const clear = React.useCallback(() => {
    boxRef.current?.clearDice();
  }, []);

  const rollValues = React.useCallback(
    (values: DiceValue[], originIndexes: number[]) => {
      const box = boxRef.current;
      if (!box?.initialized || values.length === 0) return;

      box.roll(`${values.length}dpip@${values.toString()}`);
      box.onRollComplete = result => {
        mapperRef.current.rememberRolls(result.sets[0].rolls, originIndexes);
      };
      box.onDiceClick = diceInfo => {
        if (diceInfo.reason === 'remove') return;
        mapperRef.current.handleEngineClick(diceInfo.id, originIndex => {
          void onDiceClick(originIndex).then(async shouldRemove => {
            if (!shouldRemove) return;
            await box.remove([diceInfo.id]);
            mapperRef.current.forget(diceInfo.id);
          });
        });
      };
    },
    [onDiceClick]
  );

  const restoreDie = React.useCallback(async (originIndex: number, value: DiceValue | null) => {
    if (!value) return;
    const addedDice = await boxRef.current?.add(`1dpip@${value}`);
    if (addedDice?.[0]) {
      mapperRef.current.remember(addedDice[0].id, originIndex);
    }
  }, []);

  const removeByEngineId = React.useCallback(async (engineId: number) => {
    await boxRef.current?.remove([engineId]);
    mapperRef.current.forget(engineId);
  }, []);

  return React.useMemo(
    () => ({
      clear,
      rollValues,
      restoreDie,
      removeByEngineId,
    }),
    [clear, rollValues, restoreDie, removeByEngineId]
  );
}
