/**
 * LandChunkManager — Lazy chunk creation with LRU eviction.
 *
 * Chunks are created on first access via getChunk(cx, cy) and cached.
 * When the cache exceeds maxResidentChunks, the least-recently-used
 * chunk is evicted (dynamic state is lost; terrain can be regenerated).
 *
 * Chunk coordinates wrap toroidally:
 *   cx is taken mod worldChunksX, cy mod worldChunksY.
 *
 * A pluggable `chunkGenerator` callback is invoked on creation to
 * populate terrain data. If not provided, chunks are zero-initialized.
 */

import { type LandChunk, createLandChunk } from './landChunk';

// ── Types ───────────────────────────────────────────────────────────

/**
 * Called when a new chunk is created (or re-created after eviction).
 * The generator should populate chunk.data fields (at minimum terrainHeightM).
 */
export type ChunkGenerator = (chunk: LandChunk) => void;

export interface LandChunkManagerConfig {
  /** Number of cells per chunk side (256) */
  chunkCells: number;
  /** Number of chunks along the X axis of the world */
  worldChunksX: number;
  /** Number of chunks along the Y axis of the world */
  worldChunksY: number;
  /** Maximum number of chunks kept in memory before LRU eviction */
  maxResidentChunks: number;
}

export interface LandChunkManagerStats {
  /** Number of chunks currently in memory */
  residentCount: number;
  /** Total number of getChunk calls */
  totalAccesses: number;
  /** Number of cache hits (chunk already resident) */
  cacheHits: number;
  /** Number of cache misses (chunk created or re-created) */
  cacheMisses: number;
  /** Number of chunks evicted so far */
  evictions: number;
}

export interface LandChunkManager {
  /**
   * Get a chunk by chunk coordinates. Creates it if not resident.
   * Coordinates wrap toroidally.
   */
  getChunk(cx: number, cy: number): LandChunk;

  /**
   * Check if a chunk is currently resident without triggering creation.
   */
  hasChunk(cx: number, cy: number): boolean;

  /**
   * Iterate over all currently resident chunks.
   */
  forEachResident(callback: (chunk: LandChunk) => void): void;

  /**
   * Get the number of currently resident chunks.
   */
  residentCount(): number;

  /**
   * Get cache statistics.
   */
  getStats(): LandChunkManagerStats;

  /**
   * Reset stats counters (does not evict chunks).
   */
  resetStats(): void;

  /**
   * Evict all chunks from the cache.
   */
  clear(): void;

  /** World dimensions in chunks */
  readonly worldChunksX: number;
  readonly worldChunksY: number;
  readonly chunkCells: number;
  readonly maxResidentChunks: number;
}

// ── LRU Cache Node ──────────────────────────────────────────────────

interface LRUNode {
  key: string;
  chunk: LandChunk;
  prev: LRUNode | null;
  next: LRUNode | null;
}

// ── Factory ─────────────────────────────────────────────────────────

export function createLandChunkManager(
  config: LandChunkManagerConfig,
  generator?: ChunkGenerator,
): LandChunkManager {
  const { chunkCells, worldChunksX, worldChunksY, maxResidentChunks } = config;

  if (worldChunksX <= 0 || worldChunksY <= 0) {
    throw new Error(`worldChunksX/Y must be positive, got ${worldChunksX}×${worldChunksY}`);
  }
  if (maxResidentChunks <= 0) {
    throw new Error(`maxResidentChunks must be positive, got ${maxResidentChunks}`);
  }

  // ── LRU doubly-linked list + Map ────────────────────────────────
  // head = most recently used, tail = least recently used
  const cache = new Map<string, LRUNode>();
  let head: LRUNode | null = null;
  let tail: LRUNode | null = null;

  // Stats
  let totalAccesses = 0;
  let cacheHits = 0;
  let cacheMisses = 0;
  let evictions = 0;

  function chunkKey(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  /** Wrap chunk coordinates to valid range (toroidal). */
  function wrapCx(cx: number): number {
    return ((cx % worldChunksX) + worldChunksX) % worldChunksX;
  }
  function wrapCy(cy: number): number {
    return ((cy % worldChunksY) + worldChunksY) % worldChunksY;
  }

  /** Remove a node from the doubly-linked list. */
  function removeNode(node: LRUNode): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      head = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    } else {
      tail = node.prev;
    }
    node.prev = null;
    node.next = null;
  }

  /** Insert a node at the head (most recently used). */
  function insertAtHead(node: LRUNode): void {
    node.prev = null;
    node.next = head;
    if (head) {
      head.prev = node;
    }
    head = node;
    if (!tail) {
      tail = node;
    }
  }

  /** Move an existing node to the head. */
  function moveToHead(node: LRUNode): void {
    if (node === head) return;
    removeNode(node);
    insertAtHead(node);
  }

  /** Evict the least-recently-used chunk (tail). */
  function evictLRU(): void {
    if (!tail) return;
    const evicted = tail;
    removeNode(evicted);
    cache.delete(evicted.key);
    evictions++;
  }

  return {
    worldChunksX,
    worldChunksY,
    chunkCells,
    maxResidentChunks,

    getChunk(cx: number, cy: number): LandChunk {
      const wrappedCx = wrapCx(cx);
      const wrappedCy = wrapCy(cy);
      const key = chunkKey(wrappedCx, wrappedCy);

      totalAccesses++;

      const existing = cache.get(key);
      if (existing) {
        cacheHits++;
        moveToHead(existing);
        return existing.chunk;
      }

      // Cache miss — create new chunk
      cacheMisses++;

      // Evict if at capacity
      if (cache.size >= maxResidentChunks) {
        evictLRU();
      }

      const chunk = createLandChunk(wrappedCx, wrappedCy, chunkCells);

      // Run generator to populate terrain
      if (generator) {
        generator(chunk);
      }

      const node: LRUNode = { key, chunk, prev: null, next: null };
      cache.set(key, node);
      insertAtHead(node);

      return chunk;
    },

    hasChunk(cx: number, cy: number): boolean {
      const wrappedCx = wrapCx(cx);
      const wrappedCy = wrapCy(cy);
      return cache.has(chunkKey(wrappedCx, wrappedCy));
    },

    forEachResident(callback: (chunk: LandChunk) => void): void {
      for (const node of cache.values()) {
        callback(node.chunk);
      }
    },

    residentCount(): number {
      return cache.size;
    },

    getStats(): LandChunkManagerStats {
      return {
        residentCount: cache.size,
        totalAccesses,
        cacheHits,
        cacheMisses,
        evictions,
      };
    },

    resetStats(): void {
      totalAccesses = 0;
      cacheHits = 0;
      cacheMisses = 0;
      evictions = 0;
    },

    clear(): void {
      cache.clear();
      head = null;
      tail = null;
    },
  };
}
