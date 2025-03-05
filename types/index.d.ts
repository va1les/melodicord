/// <reference types="node" />
import { EventEmitter } from 'events';

export interface SpotifyClientOptions {
  clientId: string;
  clientSecret: string;
}

export interface PlayerOptions {
  spotifyClient?: SpotifyClientOptions;
  leaveOnEnd?: boolean;
  leaveOnEmpty?: boolean;
  timeout?: number;
}

export interface TrackAuthor {
  name: string;
  url?: string | null;
}

export interface TrackOptions {
  title: string;
  url: string;
  author: TrackAuthor;
  thumbnail?: string | null;
  milliseconds: number;
  duration: string;
  filename?: string;
  type?: string;
  from?: string;
  requestedBy?: string;
}

export interface PlaylistInfo {
  type: string;
  name: string;
  url: string | null;
  author: TrackAuthor;
  thumbnail: string | null;
}

export interface SearchResult {
  name: string;
  author: TrackAuthor;
  url: string | null;
  thumbnail: string | null;
  milliseconds: number;
  duration: string;
  type: string;
  from: string;
  playlist?: PlaylistInfo;
}

export class MelodicordSpotifyClient {
  constructor(options: SpotifyClientOptions);
  clientId: string;
  clientSecret: string;
  accessToken: string | null;
  tokenExpires: number | null;
  getAccessToken(): Promise<string>;
}

export class Track {
  constructor(options: TrackOptions);
  title: string;
  url: string;
  author: TrackAuthor;
  thumbnail: string | null;
  milliseconds: number;
  duration: string;
  filename?: string;
  requestedBy?: string;
  type: string;
  from: string;
  private _data: { start: number | null; end: number | null };
  set_start(): void;
  getCurrentDuration(): string;
}

export class Player extends EventEmitter {
  constructor(client: any, options: PlayerOptions);
  client: any;
  queues: Map<string, any>;
  spotifyClient: MelodicordSpotifyClient | null;
  leaveOnEnd: boolean;
  leaveOnEmpty: boolean;
  timeout: number;
  private setupPlayerEvents(): void;
  createQueue(guildId: string, options?: any): any;
  getQueue(guildId: string): any | null;
  deleteQueue(guildId: string): void;
  search(query: string, types?: string[], limit?: number, market?: string): Promise<SearchResult[]>;
}

export interface DownloadResult {
  status: 'success' | 'error';
  content: string;
  filename: string | null;
}

export class Downloader {
  constructor();
  downloadDir: string;
  metadataFile: string;
  downloadedTracks: Record<string, any>;
  searchYouTube(query: string): Promise<string | null>;
  isDownloaded(videoId: string): boolean;
  downloadTrack(track: TrackOptions): Promise<DownloadResult>;
}