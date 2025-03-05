const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const Track = require('./Track');
const Downloader = require('./Downloader');

const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require(`@discordjs/voice`);

class Queue {
    constructor(guildId, player, options = {}) {
        this.guildId = guildId;
        this.playerInstance = player;

        this.player = createAudioPlayer();
        this.downloader = new Downloader();
        this.spotifyClient = player.spotifyClient;

        this.connection = null;
        this.voiceChannel = null;
        this.currentResource = null;

        this.options = options;
        this.data = options?.data

        this.tracks = [];

        this.isPlaying = false;
        this.paused = false;

        this.nowPlaying = this.current();

        this.repeatMode = 0;
        this.volume = 1;

        this.setupPlayerEvents();
    };

    setupPlayerEvents() {
        this.player.on(AudioPlayerStatus.Playing, () => {
            const track = this.current();
            if(track?.seeked) return track.seeked = false

            if (track) {
                track.set_start();
                this.playerInstance.emit('songStarted', this, this.current());
            };
        });

        this.player.on(AudioPlayerStatus.Idle, async () => {
            this.playerInstance.emit('songEnded', this, this.current());

            if (this.repeatMode == 1 && this.current()) {
                return this.playNext();
            };

            this.skip();
        });
    };

    add(track) {
        this.tracks.push(track);
    };

    remove(index) {
        return this.tracks.splice(index, 1)[0];
    };

    async skip() {
        const track = this.current();

        if (this.repeatMode == 2 && track) {
            this.add(track);
            this.tracks.shift();
            this.playNext();
            return;
        };

        if (track && track.filename) await this.deleteFile(track.filename);
        this.tracks.shift();
        this.playNext();
    };

    async skipTo(index) {
        if (index < 1 || index >= this.tracks.length) {
            throw new Error('Invalid track index.');
        };

        const skippedTracks = this.tracks.slice(1, index);
        for (const track of skippedTracks) {
            if (track.filename) await this.deleteFile(track.filename);
        };

        this.tracks.splice(1, index - 1);
        this.skip();
    };

    shuffle() {
        for (let i = this.tracks.length - 1; i > 1; i--) {
            const j = Math.floor(Math.random() * (i - 1)) + 1;
            [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
        };
    };

    isEmpty() {
        return this.tracks.length === 0;
    };

    size() {
        return this.tracks.length;
    };

    current() {
        return this.tracks[0];
    };

    clear() {
        this.tracks = [];
    };

    async join(voiceChannel) {
        if (!this.connection) {
            this.voiceChannel = voiceChannel;
            this.connection = await this.connectToVoiceChannel(voiceChannel);
        };
    };

    async connectToVoiceChannel(voiceChannel) {
        return joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        });
    };

    stop() {
        if (this.player) this.player.stop();
        if (this.connection) this.connection.destroy();

        this.playerInstance.deleteQueue(this.guildId);
        this.playerInstance.emit('queueDestroyed', this);
    };

    leave() {
        this.stop();
    };

    setPause(pause) {
        if (!this.current()) return false;

        this.isPlaying = !pause;
        this.paused = pause;

        if (pause) this.player.pause();
        else this.player.unpause()
        return pause;
    };

    setRepeatMode(mode) {
        if (![0, 1, 2].includes(mode)) {
            throw new Error('Invalid repeat mode. Use 0 (off), 1 (track), or 2 (queue).');
        };

        this.repeatMode = mode;
        return this.repeatMode;
    };

    setVolume(volume) {
        if (volume < 0 || volume > 2) throw new Error('Volume must be between 0 and 2.');

        this.volume = volume;
        if (this.currentResource && this.currentResource.volume) this.currentResource.volume.setVolume(this.volume);
    };

    async queueEnd() {
        if (this.player) this.player.stop();
        if (this.connection && this?.playerInstance?.leaveOnEnd) this.connection.destroy();
        this.playerInstance.emit('queueEnd', this);
        this.playerInstance.deleteQueue(this.guildId);
    };

    async play(query, options = {}) {
        const tracks = await this.playerInstance.search(query, ['track', 'album', 'artist', 'playlist']);
        if (!tracks.length) throw new Error('No tracks found');

        const isAlbum = tracks.every(t => t.type === 'album');
        const isArtist = tracks.every(t => t.type === 'artist');
        const isPlaylist = tracks.every(t => t.type === 'playlist');

        const source = isAlbum ? `Album «${tracks[0]?.playlist?.name}»` : isArtist ? `Tracks by «${tracks[0]?.author.name}»` : isPlaylist ? `Playlist «${tracks[0]?.playlist?.name}»` : 'Track';

        const added_tracks = [];

        for (const t of tracks) {
            const track = new Track({
                title: t.name,
                url: t.url,
                author: t.author,
                thumbnail: t.thumbnail,
                milliseconds: t.milliseconds,
                duration: t.duration,
                filename: null,
                requestedBy: options?.requestedBy || null,
                type: t.type,
                from: t.from,
            });

            if (options?.onTrackDownloadStart) await options.onTrackDownloadStart(track);

            const result = await this.downloader.downloadTrack(track);
            if (result.status === 'success') {
                track.filename = result.filename;
                this.add(track);
                added_tracks.push(track);

                if (this.size() === 1) await this.playNext();
            } else {
                console.warn(`Failed to download track: ${track.title}`);
            };
        };

        if (added_tracks.length === 1) {
            this.playerInstance.emit('songAdd', this, added_tracks[0]);
        } else if (added_tracks.length > 1) {
            this.playerInstance.emit('playlistAdd', this, {
                name: tracks[0]?.playlist.name || `Tracks by «${tracks[0].author.name}»`,
                author: tracks[0]?.playlist?.author,
                thumbnail: tracks[0]?.playlist?.thumbnail || null,
                url: tracks[0]?.playlist?.url || null,
                tracks: added_tracks,
                type: tracks[0]?.playlist?.type || `playlist`
            });
        };

        return { source, added_tracks };
    };

    async playNext() {
        const track = this.tracks[0];
        if (!track) {
            if (this.isEmpty()) return this.queueEnd();
            else return this.queueEnd();
        };

        if (!track.filename) {
            console.error('No filename found for track:', track.title);
            return this.skip();
        };

        try {
            const resource = createAudioResource(track.filename, { inlineVolume: true });
            resource.volume.setVolume(this.volume);

            this.currentResource = resource;
            this.isPlaying = true;

            this.player.play(resource);
            this.connection.subscribe(this.player);
            this.nowPlaying = track;
        } catch (error) {
            console.error('Error creating audio resource:', error);
            this.skip();
        };
    };

    async seek(seconds) {
        const track = this.current();
        if (!track || !track.filename) throw new Error('No track is currently playing.');

        const ffmpegStream = ffmpeg(track.filename)
            .setStartTime(seconds)
            .format('mp3')
            .on('error', err => {
                if (!err.message.includes('Premature close')) {
                    console.error('FFmpeg error:', err.message);
                };
            })
            .on('end', () => {
                // console.log('FFmpeg stream ended.');
            })
            .pipe();

        const resource = createAudioResource(ffmpegStream, {
            inlineVolume: true
        });

        resource.volume.setVolume(this.volume);

        this.currentResource = resource;
        this.isPlaying = true;
        this.current()._data.seeked = true;

        this.player.play(resource);
        this.connection.subscribe(this.player);
    };

    async deleteFile(filename) {
        try {
            const isFileInQueue = this.tracks.some(track => track.filename === filename);
            if (isFileInQueue) return;

            await fs.promises.unlink(path.resolve(filename));
        } catch (err) {
            console.error('Failed to delete track file:', filename, err);
        };
    };
};

module.exports = Queue;