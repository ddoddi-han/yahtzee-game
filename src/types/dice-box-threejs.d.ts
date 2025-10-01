declare module "@drdreo/dice-box-threejs" {
  export interface DiceConfig {
    assetPath?: string;
    framerate?: number;
    sounds?: boolean;
    volume?: number;
    color_spotlight?: number;
    shadows?: boolean;
    theme_surface?: "green-felt" | "wood-table" | "wood-tray" | "metal";
    sound_dieMaterial?: "plastic" | "metal" | "wood";
    theme_customColorset?: any;
    theme_colorset?: string;
    theme_texture?: string;
    theme_material?: string;
    gravity_multiplier?: number;
    light_intensity?: number;
    baseScale?: number;
    strength?: number;
    iterationLimit?: number;
    onRollComplete?: (results: DiceResults) => void;
    onRerollComplete?: (results: DiceResult[]) => void;
    onAddDiceComplete?: (results: DiceResult[]) => void;
    onRemoveDiceComplete?: (results: DiceResult[]) => void;
    enableDiceSelection?: boolean;
    onDiceHover?: (diceInfo: DiceEventData | null) => void;
    onDiceClick?: (diceInfo: DiceEventData) => void;
  }

  export interface DicePosition {
    x: number;
    y: number;
    z: number;
  }

  export interface DiceScreenPosition {
    x: number;
    y: number;
  }

  export interface DiceEventData extends DiceResult {
    position: DicePosition;
    screenPosition: DiceScreenPosition;
    scale: number;
  }

  export interface DiceResult {
    type: string;
    sides: number;
    id: number;
    value: number;
    reason?: string;
    position: DicePosition;
    screenPosition: DiceScreenPosition;
    scale: number;
  }

  export interface DiceSet {
    num: number;
    type: string;
    sides: number;
    rolls: DiceResult[];
    total: number;
  }

  export interface DiceResults {
    notation: string;
    sets: DiceSet[];
    modifier: number;
    total: number;
  }

  export class DiceBox {
    constructor(element_container: string | HTMLElement, options?: Partial);

    initialized: boolean;
    container: HTMLElement;
    dimensions: THREE.Vector2;
    scene: THREE.Scene;
    world: CANNON.World;
    camera: THREE.PerspectiveCamera;

    initialize(): Promise<void>;
    enableShadows(): void;
    disableShadows(): void;
    setDimensions(dimensions: THREE.Vector2): void;
    clearDice(): void;

    roll(notationString: string): Promise<DiceResults>;
    reroll(diceIdArray: number[]): Promise<DiceResult[]>;
    add(notationString: string): Promise<DiceResult[]>;
    remove(diceIdArray: number[]): Promise<DiceResult[]>;

    getDiceResults(id: number): DiceResult;
    getDiceResults(): DiceResults;

    updateConfig(options: Partial<DiceConfig>): Promise<void>;

    onRollComplete?: (results: DiceResults) => void;
    onDiceClick?: (diceInfo: DiceEventData) => void;
  }

  export { DiceBox as default };
}
