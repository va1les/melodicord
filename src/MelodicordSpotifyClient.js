const axios = require('axios');

class MelodicordSpotifyClient {
    constructor({ clientId, clientSecret }) {
        if (!clientId || !clientSecret) {
            throw new Error('clientId and clientSecret are required to initialize MelodicordSpotifyClient.');
        };

        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.accessToken = null;
        this.tokenExpires = null;
    };

    async getAccessToken() {
        if (this.accessToken && this.tokenExpires > Date.now()) {
            return this.accessToken;
        };

        try {
            const response = await axios.post('https://accounts.spotify.com/api/token', null, {
                params: { grant_type: 'client_credentials' },
                headers: {
                    'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            });

            this.accessToken = response.data.access_token;
            this.tokenExpires = Date.now() + response.data.expires_in * 1000;

            return this.accessToken;
        } catch (error) {
            console.error('Failed to get Spotify access token:', error.response?.data || error.message);
            throw new Error('Failed to retrieve Spotify access token.');
        };
    };
};

module.exports = MelodicordSpotifyClient;