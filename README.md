# Melodicord

A powerful music library for Discord bots with support for Spotify and YouTube.

## Installation

To install `melodicord`, use npm:

```bash
npm install melodicord
```

## Usage

Here is a simple example of how to integrate `melodicord` into your Discord bot:

```javascript
const Discord = require("discord.js");
const client = new Discord.Client({
    intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_VOICE_STATES]
    // intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildVoiceStates] for discord.js v14
});
const { Player } = require('melodicord');

const player = new Player(client, {
    spotifyClient: { clientId: 'yourClientId', clientSecret: 'yourClientSecret' },
    leaveOnEnd: true, // Leave the voice channel when the queue ends
    leaveOnEmpty: true, // Leave if no one is in the voice channel
    timeout: 0, // Disable timeout for leaving channels
});

// Assign player to client
client.player = player;

// Add event listeners for various events
client.player.on('songStarted', (song) => {
    console.log(`Now playing: ${song.title}`);
});

client.player.on('songEnded', (song) => {
    console.log(`Song ended: ${song.title}`);
});

client.player.on('songAdd', (song) => {
    console.log(`Added song to queue: ${song.title}`);
});

client.player.on('playlistAdd', (playlist) => {
    console.log(`Added playlist to queue: ${playlist.title}`);
});

client.player.on('channelEmpty', () => {
    console.log('No users in the voice channel, leaving...');
});

client.player.on('clientDisconnect', () => {
    console.log('Client disconnected from the voice channel');
});

client.player.on('queueEnd', () => {
    console.log('Queue has ended');
});
```

### Available Events

The following events are available for you to listen to in your bot:

- `songStarted`: Emitted when a song starts playing.
- `songEnded`: Emitted when a song ends.
- `songAdd`: Emitted when a song is added to the queue.
- `playlistAdd`: Emitted when a playlist is added to the queue.
- `channelEmpty`: Emitted when there are no users left in the voice channel.
- `clientDisconnect`: Emitted when the client disconnects from the voice channel.
- `queueEnd`: Emitted when the queue is empty and the bot has finished playing.

### Configuration Options

You can configure the following options when initializing the `Player`:

- `spotifyClient`: An object containing your `clientId` and `clientSecret` for Spotify integration.
- `leaveOnEnd`: Whether the bot should leave the voice channel when the queue ends (default: `true`).
- `leaveOnEmpty`: Whether the bot should leave the voice channel when no users are left (default: `true`).
- `timeout`: The amount of time (in milliseconds) before the bot leaves the channel if it's idle (default: `0`).

### Commands

Here are the commands you can implement using `melodicord` to control your music bot:

```js
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const args = message.content.split(' ');

    // Play command
    if (message.content.startsWith('!play')) {
        const query = args.slice(1).join(' ');
        if (!message.member.voice.channel) {
            return message.reply('You need to join a voice channel first!');
        }

        let queue = client.player.getQueue(message.guild.id);
        if (!queue) queue = client.player.createQueue(message.guild.id, { data: { channel: message.channel } });

        if (!queue.connection) {
            await queue.join(message.member.voice.channel);
        }

        await message.reply('🔄 Searching and downloading track(s)... Please wait.');

        try {
            const { source, added_tracks } = await queue.play(query, {
                requestedBy: message.author.toString(),
                onTrackDownloadStart: async (track) => {
                    await message.edit({ content: `🎶 Downloading **${track.title}** by ${track.author.name}...` });
                },
            });

            if (!added_tracks.length) {
                throw new Error('No tracks were added.');
            }

            await message.edit({
                content: `${added_tracks.length === 1 ? `🎶 **[${added_tracks[0].title}](${added_tracks[0].url})** added to the queue.` : `🎶 Successfully added ${added_tracks.length} tracks from **${source}** to the queue.`}`,
            });
        } catch (error) {
            console.error('Error during play:', error);
            await message.reply('❌ Failed to find or play the song.');
        }
    }

    // Skip command
    if (message.content === '!skip') {
        const queue = client.player.getQueue(message.guild.id);
        const track = queue.current();
        queue.skip();
        message.channel.send(`⏭️ Skipped **${track.title}** by ${track.author.name}.`);
    }

    // Skip to a specific track command
    if (message.content.startsWith('!skipto')) {
        const index = parseInt(args[1]);
        const queue = client.player.getQueue(message.guild.id);
        if (index < 1 || index >= queue.size()) {
            return message.channel.send('Invalid track index.');
        }
        queue.skipTo(index);
        message.channel.send(`⏩ Skipped to track #${index}`);
    }

    // Stop command
    if (message.content === '!stop') {
        const queue = client.player.getQueue(message.guild.id);
        queue.stop();
        message.channel.send('Playback stopped and queue cleared');
    }

    // Pause command
    if (message.content === '!pause') {
        const queue = client.player.getQueue(message.guild.id);
        queue.setPaused(true);
        message.channel.send('Paused the song');
    }

    // Resume command
    if (message.content === '!resume') {
        const queue = client.player.getQueue(message.guild.id);
        queue.setPaused(false);
        message.channel.send('Resumed the song');
    }

    // Volume command
    if (message.content.startsWith('!volume')) {
        const volume = parseInt(args[1]);
        const queue = client.player.getQueue(message.guild.id);
        queue.setVolume(volume / 100);
        message.channel.send(`🔊 Volume set to **${volume}%**`);
    }

    // Repeat command
    if (message.content.startsWith('!repeat')) {
        const mode = parseInt(args[1]);
        const queue = client.player.getQueue(message.guild.id);
        queue.setRepeatMode(mode);
        message.channel.send(`🔁 Repeat mode set to **${mode === 0 ? 'off' : (mode === 1 ? 'track' : 'queue')}**`);
    }

    // Clear queue command
    if (message.content === '!clearQueue') {
        const queue = client.player.getQueue(message.guild.id);
        queue.clear();
        message.channel.send('Queue has been cleared');
    }

    // Shuffle command
    if (message.content === '!shuffle') {
        const queue = client.player.getQueue(message.guild.id);
        queue.shuffle();
        message.channel.send('Shuffled the queue');
    }

    // Remove track command
    if (message.content.startsWith('!remove')) {
        const index = parseInt(args[1]);
        const queue = client.player.getQueue(message.guild.id);
        if (index < 1 || index >= queue.size()) {
            return message.channel.send('Invalid track index.');
        }
        const track = queue.remove(index);
        message.channel.send(`🗑️ Track **${track.title}** has been removed from the queue.`);
    }

    // Now playing command
    if (message.content === '!nowPlaying') {
        const queue = client.player.getQueue(message.guild.id);
        if (!queue || !queue.current) {
            return message.channel.send('No tracks are currently playing.');
        }
        const track = queue.current();
        message.channel.send(`🎶 Now playing: **${track.title}** by ${track.author.name}`);
    }
});
```

### License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.