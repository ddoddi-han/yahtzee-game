import { describe, expect, it, vi } from 'vitest';
import { createDiceIdMapper } from './use-dice-box-adapter';

describe('createDiceIdMapper', () => {
  it('maps engine dice ids back to original dice indexes', () => {
    const mapper = createDiceIdMapper();
    const onOriginIndex = vi.fn();

    mapper.rememberRolls([{ id: 101 }, { id: 102 }], [1, 4]);

    mapper.handleEngineClick(102, onOriginIndex);

    expect(onOriginIndex).toHaveBeenCalledWith(4);
  });

  it('forgets removed engine dice ids', () => {
    const mapper = createDiceIdMapper();
    const onOriginIndex = vi.fn();

    mapper.rememberRolls([{ id: 101 }], [0]);
    mapper.forget(101);
    mapper.handleEngineClick(101, onOriginIndex);

    expect(onOriginIndex).not.toHaveBeenCalled();
  });
});
