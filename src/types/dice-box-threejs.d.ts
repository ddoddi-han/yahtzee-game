declare module "@drdreo/dice-box-threejs" {
  export interface DiceInfo {
    type: string;
    sides: number;
    id: number;
    value: number;
    label: string;
    reason: string;
    position: {
      x: number;
      y: number;
      z: number;
    };
    screenPosition: {
      x: number;
      y: number;
    };
    scale: number;
  }

  export interface DiceResult {
    notation: string;
    sets: DiceSet[];
    modifier: number;
    total: number;
  }

  export interface DiceSet {
    num: number;
    type: string;
    sides: number | null;
    rolls: DiceRoll[];
    total: number;
  }

  export interface DiceRoll {
    type: string;
    sides: number | null;
    id: number;
    value: number;
    label: string;
    reason: "forced" | "natural";
    position: {
      x: number;
      y: number;
      z: number;
    };
    screenPosition: {
      x: number;
      y: number;
    };
    scale: number;
  }

  export default class DiceBox {
    constructor(
      container: string | HTMLElement,
      options?: {
        assetPath?: string;
        framerate?: number;
        sounds?: boolean;
        volume?: number;
        color_spotlight?: number;
        shadows?: boolean;
        theme_surface?: string;
        sound_dieMaterial?: string;
        theme_customColorset?: null;
        theme_colorset?: string; // see available colorsets in https://github.com/3d-dice/dice-box-threejs/blob/main/src/const/colorsets.js
        theme_texture?: string; // see available textures in https://github.com/3d-dice/dice-box-threejs/blob/main/src/const/texturelist.js
        theme_material?: string; // "none" | "metal" | "wood" | "glass" | "plastic"
        gravity_multiplier?: number;
        light_intensity?: number;
        baseScale?: number;
        strength?: number; // toss strength of dice
        iterationLimit?: number;
        enableDiceSelection?: boolean; // Enable hover and click detection on dice
        onRollComplete?: (results: DiceResult) => void;
        onDiceHover?: (result: DiceInfo) => void;
        onDiceClick?: (result: DiceInfo) => void;
      }
    );

    diceList: any[];

    isInitialized?: boolean;
    initialize(): Promise<void>;
    add(notation: string): Promise<void>;
    remove(indexs: number[]): Promise<void>;
    roll(notation: string): Promise<DiceResult>;
    clearDice(): void;
    onRollComplete?: (results: DiceResult) => void;
    onDiceHover?: (result: DiceInfo) => void;
    onDiceClick?: (result: DiceInfo) => void;
  }
}
