class Track {
    constructor({ title, url, author, thumbnail, milliseconds, duration, filename, type, from, requestedBy }) {
        this.title = title;
        this.url = url;
        this.author = author;
        this.thumbnail = thumbnail;
        this.milliseconds = milliseconds;
        this.duration = duration;
        this.filename = filename;
        this.requestedBy = requestedBy;
        this.type = type || 'track';
        this.from = from || 'spotify';
        this._data = {
            start: null,
            end: null,
            seeked: false,
        };
    };

    set_start() {
        this._data.start = Date.now();
    };

    getCurrentDuration() {
        if (!this._data.start) return '00:00';
        const elapsedMs = Date.now() - this._data.start;
        return new Date(elapsedMs).toISOString().slice(14, 19);
    };
};

module.exports = Track;