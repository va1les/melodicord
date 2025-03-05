const Queue = require('./Queue');
const MelodicordSpotifyClient = require('./MelodicordSpotifyClient');
const axios = require('axios');
const ytdl = require('ytdl-core');
const { EventEmitter } = require('events');

class Player extends EventEmitter {
    constructor(client, { spotifyClient, leaveOnEnd = true, leaveOnEmpty = true, timeout = 0 }) {
        super();
        this.client = client;
        this.queues = new Map();
        this.spotifyClient = spotifyClient ? new MelodicordSpotifyClient(spotifyClient) : null;
        this.leaveOnEnd = leaveOnEnd;
        this.leaveOnEmpty = leaveOnEmpty;
        this.timeout = timeout;

        this.setupPlayerEvents();
    };

    setupPlayerEvents() {
        this.client.on('voiceStateUpdate', async (oldState, newState) => {
            const guild = oldState.guild || newState.guild;
            const queue = this.getQueue(guild.id);
            if (!queue || !queue.connection) return;

            const botId = this.client.user.id;
            const nonBotMembers = oldState?.channel?.members?.filter(member => !member.user.bot);

            if (!newState.channelId && oldState.member?.user?.id === botId) {
                queue.stop();
                this.emit('clientDisconnect', queue);
            } else if (this.leaveOnEmpty && nonBotMembers?.size === 0) {
                setTimeout(() => {
                    const updatedMembers = oldState?.channel?.members?.filter(member => !member.user.bot);
                    if (updatedMembers?.size === 0) {
                        queue.stop();
                        this.emit('channelEmpty', queue);
                    };
                }, this.timeout);
            };
        });
    };

    createQueue(guildId, options = {}) {
        const queue = new Queue(guildId, this, options);
        this.queues.set(guildId, queue);
        return queue;
    };

    getQueue(guildId) {
        return this.queues.get(guildId) || null;
    };

    deleteQueue(guildId) {
        this.queues.delete(guildId);
    };

    async search(query, types = ['track'], limit = 1, market = 'RU') {
        function formatTrack(track, source, type = `track`) {
            return {
                name: track.name || 'Unknown Track',
                author: {
                    name: source === 'spotify' ? track.artists?.map(artist => artist.name).join(', ') || 'Unknown Artist' : track.artists?.name || 'Unknown Artist',
                    url: source === 'spotify' ? track.artists?.[0]?.external_urls?.spotify || null : track.external_urls?.youtube || null
                },
                url: track.external_urls?.spotify || track.external_urls?.youtube || null,
                thumbnail: track.album?.images?.[0]?.url || track.images?.[0]?.url || track.thumbnails?.[0]?.url || null,
                milliseconds: track.duration_ms || 0,
                duration: new Date(track.duration_ms || 0).toISOString().slice(14, 19),
                type: type,
                from: source,
            };
        };

        const spotifyRegex = /https:\/\/open\.spotify\.com\/(track|artist|album|playlist)\/([a-zA-Z0-9]{22})/;
        const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/.*[?&]v=|youtu\.be\/)([^"&?\/\s]{11})/;

        const spotifyMatch = query.match(spotifyRegex);
        const youtubeMatch = query.match(youtubeRegex);

        if (spotifyMatch && this.spotifyClient) {
            try {
                const [_, type, id] = spotifyMatch;
                const token = await this.spotifyClient.getAccessToken();
                const urls = {
                    track: `https://api.spotify.com/v1/tracks/${id}`,
                    album: `https://api.spotify.com/v1/albums/${id}`,
                    artist: `https://api.spotify.com/v1/artists/${id}/top-tracks`,
                    playlist: `https://api.spotify.com/v1/playlists/${id}?limit=100`
                };

                const response = await axios.get(urls[type], {
                    headers: { Authorization: `Bearer ${token}` }
                });

                if (type === 'album' || type === 'playlist' || type === 'artist') {
                    const tracksData = type === 'artist' ? response.data.tracks : response.data.tracks.items;

                    return tracksData.slice(0, 100).map(item => {
                        const track = item.track || item;
                        return {
                            ...formatTrack(track, 'spotify', type),
                            playlist: {
                                type: type,
                                name: response.data.name,
                                url: response.data.external_urls?.spotify || item.artists?.[0]?.external_urls?.spotify,
                                author: {
                                    name: response.data.owner?.display_name || response.data.artists?.map(artist => artist.name).join(', ') || item.artists?.map(artist => artist.name).join(', '),
                                    url: response.data.owner?.external_urls?.spotify || response.data.artists?.[0]?.external_urls?.spotify || item.artists?.[0]?.external_urls?.spotify,
                                },
                                thumbnail: response.data.images?.[0]?.url || null,
                            },
                        };
                    });
                };

                return [formatTrack(response.data, 'spotify', type)];
            } catch (err) {
                console.error('Spotify search failed:', err.message);
            };
        };

        if (youtubeMatch) {
            try {
                const videoId = youtubeMatch[1];
                const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
                const info = await ytdl.getInfo(videoUrl);

                return [formatTrack({
                    name: info.videoDetails.title,
                    artists: { name: info.videoDetails.author.name, url: videoUrl },
                    external_urls: { youtube: videoUrl },
                    thumbnails: info.videoDetails.thumbnails,
                    duration_ms: Number(info.videoDetails.lengthSeconds) * 1000
                }, 'youtube', `track`)];
            } catch (err) {
                console.warn('YouTube search failed:', err.message);
            };
        };

        if (this.spotifyClient) {
            try {
                const token = await this.spotifyClient.getAccessToken();
                const response = await axios.get('https://api.spotify.com/v1/search', {
                    headers: { Authorization: `Bearer ${token}` },
                    params: { q: query, type: types.join(','), limit, market }
                });

                const result = response.data.tracks?.items.map(track => formatTrack(track, 'spotify', `track`)) || [];
                return result;
            } catch (err) {
                console.warn('Spotify search failed:', err.message);
            };
        };

        try {
            const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
            const searchPage = await axios.get(searchUrl);
            const match = searchPage.data.match(/"videoId":"(.*?)"/);
            const videoId = match ? match[1] : null;

            if (videoId) {
                const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
                const info = await ytdl.getInfo(videoUrl);

                return [formatTrack({
                    name: info.videoDetails.title,
                    artists: { name: info.videoDetails.author.name, url: videoUrl },
                    external_urls: { youtube: videoUrl },
                    thumbnails: info.videoDetails.thumbnails,
                    duration_ms: Number(info.videoDetails.lengthSeconds) * 1000
                }, 'youtube', `track`)];
            };
        } catch (err) {
            console.warn('YouTube search failed:', err.message);
        };

        return [];
    };
};

module.exports = Player;