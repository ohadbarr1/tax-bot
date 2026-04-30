/**
 * Ambient module declaration for bidi-js (no shipped types).
 *
 * Mirrors the public API documented in `node_modules/bidi-js/README.md`.
 * Only the surface used by `lib/bidi.ts` is typed; extend as needed.
 */
declare module "bidi-js" {
  export interface Paragraph {
    start: number;
    end: number;
    level: number;
  }

  export interface EmbeddingLevels {
    levels: Uint8Array;
    paragraphs: Paragraph[];
  }

  export interface BidiInstance {
    getEmbeddingLevels(text: string, explicitDirection?: "ltr" | "rtl"): EmbeddingLevels;
    getReorderSegments(
      text: string,
      embeddingLevels: EmbeddingLevels,
      start?: number,
      end?: number,
    ): [number, number][];
    getMirroredCharactersMap(
      text: string,
      embeddingLevels: EmbeddingLevels,
      start?: number,
      end?: number,
    ): Map<number, string>;
    getMirroredCharacter(char: string): string | null;
    getBidiCharTypeName(char: string): string;
  }

  const factory: () => BidiInstance;
  export default factory;
}
