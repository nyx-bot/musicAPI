# Nyx Music API

This is where Nyx gets their music powers from!

**There are two different servers to this:** main process, and node process. The main process pools multiple node processes for load balancing using multiple ip addresses (or even to thread host processes if absolutely necessary), though still works with one instance!

This service is compatible with [every listed media source on yt-dlp's supported sites page](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md) -- adding a certain media source is not issue-worthy of this repo, but rather yt-dlp.

## Running the API:

There are many ways to go about this. If you want to keep the server online for a while, I personally recommend [PM2](https://pm2.keymetrics.io/).

**Make sure you install all dependencies needed: `npm i`. You also need `ffmpeg` and `ffprobe` installed to the systems hosting the node clients for audio conversion**

Make a copy of the applicable config JSON file; copy "config.exampleNode.json" to "config.json" for the `node` process and edit accordingly. Same for `main` with "config.exampleMain.json".

> Don't worry about adding the keys to the client's json file -- by specifying the API key and location, it retrieves the service keys through the main API to make it easier for distribution.

- To run the main process / pooling server, run `node server main`. This is accessible through `http://{ip}:1400/`
- To run a node process and add it to the pool of servers accessible via the main server, make sure to create your config.json and point the `mainLocation` property to your main server's ip address & port (like: `http://mainLocation:1400/`). This type of server is accessible through `http://{ip}:1366/`

To make things easier, you can always run `node server main` on its own, as it spawns its own node client if no other node servers are detected, but if you are using a service such as PM2, I highly recommend spawning both `node server main` and `node server` in their own instances for better error handling (as the main server holds on to the request if the node server crashes, and waits for it to come back online)

You can access any endpoint available through the main server the exact same as you would through a node server. The main server is simply a proxy that pools multiple locations.

## Endpoints:

### [POST] /findMatchingSong

This endpoint is used to search multiple sources for a query, or to find an exact match of a certain song

Request body:

```json
{
    "title": "Song title (serves as a search query if none of the below are included)",
    "artist": "(optional) Song artist",
    "duration": "(optional) Duration of the song in ms"
}
```

### [POST] /findOnYoutube (deprecated)

The `/findMatchingSong` endpoint was created to replace this endpoint to allow searching on multiple different sources (avoiding YouTube if needed)

Request body:

```json
{
    "query": "",
    "title": "Title of song (optional if query above is provided)",
    "artist": "Artist of song (optional if query above is provided)",
    "duration": "Duration of song in ms (optional if query above is provided)"
}
```

### [GET] /getInfo/{url}

This endpoint is used to lookup info of a certain link.

### [GET] /lookupSpotify/{query}

This endpoint looks for a certain song through Spotify's API.

### [GET] /lyrics/{query}

This endpoint looks up for lyrics through certain endpoints

### [GET] /playlist/{url}

This endpoint looks up the songs in a certain playlist (soon to be updated for universal support through yt-dlp)

### [GET] /search/{query}

This endpoint is deprecated in favor of `/findMatchingSong` -- that endpoint also provides multiple results.

### [GET] /stream/{url}

This is the heart of the musicAPI -- this endpoint provides a stream of a certain URL from yt-dlp
