'use client';

import { ScoreCategory, createEmptyScoreSheet } from '@/features/game/domain/categories';
import { DiceValue } from '@/features/game/domain/scoring';
import { useGameView, useRoomActions } from '@/providers/room-provider';
import { toast } from 'sonner';
import { Dice3D } from './Dice3D';
import { GameResult } from './GameResult';
import { getTurnNumber, ScoreTable } from './ScoreTable';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

export function GameBoard() {
  const { gameStarted, countdown, scores, turnNick, dice, result, notMyTurn } = useGameView();
  const { selectScore, restartRoom } = useRoomActions();

  const currentScores = turnNick && scores[turnNick] ? scores[turnNick] : createEmptyScoreSheet();

  const handleSelectCategory = async (category: ScoreCategory) => {
    try {
      await selectScore(category);
    } catch (err) {
      console.error('점수 업데이트 실패:', err);
      toast.error(err instanceof Error ? err.message : '점수 업데이트에 실패했습니다.');
    }
  };

  const handleRestart = async () => {
    try {
      await restartRoom();
    } catch (err) {
      console.error('재시작 실패:', err);
      toast.error(err instanceof Error ? err.message : '재시작에 실패했습니다.');
    }
  };

  return (
    <Card>
      {gameStarted && turnNick && (
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div>
              <span className="text-2xl font-bold text-blue-300">{turnNick}</span>
              님의 차례입니다.
            </div>
            <div>
              <span className="text-2xl font-bold text-pink-300">
                {getTurnNumber(currentScores)}
              </span>{' '}
              / 13 턴
            </div>
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className="flex-1 space-y-6">
        {!gameStarted ? (
          <div className="flex h-full items-center justify-center text-2xl text-muted-foreground">
            {countdown !== null ? (
              <>
                <span className="font-bold text-green-300">{countdown}</span>초 후 게임을
                시작합니다.
              </>
            ) : (
              '플레이어를 기다리는 중입니다...'
            )}
          </div>
        ) : result ? (
          <GameResult result={result} onRestart={handleRestart} />
        ) : (
          <>
            <Dice3D disabled={notMyTurn} />

            <ScoreTable
              scores={currentScores}
              dice={dice.map(d => d.value as DiceValue | null)}
              onSelectCategory={handleSelectCategory}
              disabled={notMyTurn}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
