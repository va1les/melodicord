const path = require('path');
const fs = require('fs');
const axios = require('axios');
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');

class Downloader {
    constructor() {
        this.downloadDir = path.join(__dirname, '..', 'src', 'downloads');
        this.metadataFile = path.join(this.downloadDir, 'downloaded_tracks.json');

        if (!fs.existsSync(this.downloadDir)) fs.mkdirSync(this.downloadDir);
        if (!fs.existsSync(this.metadataFile)) fs.writeFileSync(this.metadataFile, JSON.stringify({}));

        this.downloadedTracks = JSON.parse(fs.readFileSync(this.metadataFile));
    };

    async searchYouTube(query) {
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        const response = await axios.get(searchUrl);
        const videoIds = [...response.data.matchAll(/"videoId":"([a-zA-Z0-9-_]{11})"/g)].map(match => match[1]);

        return videoIds.length > 0 ? videoIds[0] : null;
    };

    isDownloaded(videoId) {
        const track = Object.values(this.downloadedTracks).find(track => track.videoId === videoId);
        return track && fs.existsSync(track.filename);
    };

    async downloadTrack(track) {
        const { title, author, from } = track
        let videoUrl = from == `youtube` ? track?.url : null;
        let videoId = null;

        if (!videoUrl) {
            const query = `${title} - ${author.name} (Official Audio)`;
            videoId = await this.searchYouTube(query);
            if (!videoId) return { status: 'error', content: 'No matching video found on YouTube', filename: null };

            videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        } else {
            const youtubeLinkRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/.*[?&]v=|youtu\.be\/)([^"&?\/\s]{11})/;
            const match = videoUrl.match(youtubeLinkRegex);
            videoId = match ? match[1] : null;
            if (!videoId) return { status: 'error', content: 'Invalid YouTube URL', filename: null };
        };

        if (this.isDownloaded(videoId)) {
            const existingTrack = Object.values(this.downloadedTracks).find(track => track.videoId === videoId);
            return { status: 'success', content: 'Track already downloaded', filename: existingTrack.filename };
        };

        const sanitizedTitle = title.replace(/[/\\]/g, ' ');
        const filename = path.join(this.downloadDir, `${sanitizedTitle} - ${author.name} [${videoId}].mp3`);

        await new Promise((resolve, reject) => {
            const stream = ytdl(videoUrl, { quality: 'highestaudio', filter: 'audioonly' });

            ffmpeg(stream)
                .audioBitrate(256)
                .format('mp3')
                .save(filename)
                .on('error', reject)
                .on('end', resolve);
        });

        this.downloadedTracks[videoId] = { title, author, videoId, filename };
        fs.writeFileSync(this.metadataFile, JSON.stringify(this.downloadedTracks, null, 2));

        return { status: 'success', content: 'Track downloaded successfully', filename };
    };
};

module.exports = Downloader;