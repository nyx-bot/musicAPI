const api = (keys, endpoint, query) => new Promise(async res => {
    require('superagent').get(`https://api.spotify.com/v1/${endpoint}/${query}`).set(`Authorization`, `Bearer ${keys.spotify}`).then(r => {
        if(r && r.body) {
            res({
                response: r.body,
                notFound: false,
                status: r.status,
            })
        } else {
            res({
                response: null,
                notFound: false,
                status: r.status,
            })
        }
    }).catch(e => {
        if(e && e.status == 404) {
            res({
                response: e && e.response && e.response.error && e.response.error.text ? JSON.parse(e.response.error.text) : null,
                notFound: true,
                status: e.status
            })
        } else {
            res({
                response: e && e.response && e.response.error && e.response.error.text ? JSON.parse(e.response.error.text) : null,
                notFound: false,
                status: e.status || null
            })
        }
    })
})

const parseTrack = (track, getInfo) => {
    if(track.track) track = track.track

    let obj = {
        title: track.name,
        artists: track.artists.map(a => a.name),
        duration: [track.duration_ms],
        url: track.external_urls.spotify,
        thumbnail: track.album.images[0].url,
        id: track.id,
        source: `Spotify`,
    };

    if(getInfo) {
        return Object.assign({}, obj, {
            title: track.name,
            duration: track.duration_ms / 1000,
            url: track.external_urls.spotify,
            thumbnail: track.album.images[0],
            uploader: track.artists[0].name,
            uploader_url: `https://open.spotify.com/artist/${track.artists[0].id}`
        })
    } else {
        return obj;
    }
}

module.exports = ({
    keys, q, getInfo
}) => new Promise(async (res, rej) => {
    if(q.includes(`/`)) q = q.split(`/`).slice(-1)[0];
    
    let result = null;

    let endpoints = [`tracks`, `playlists`, `albums`];

    for(i in endpoints) {
        let endpoint = endpoints[i];

        if(!result) {
            console.log(`no result... searching endpoint ${endpoint} (${Number(i)+1}/${endpoints.length})`)
            await api(keys, endpoint, q).then(r => {
                if(r.response && !r.response.error) {
                    result = r.response; r.endpoint = endpoint
                }
            })
        }
    };

    if(result) {
        if(result.tracks) {
            result.title = result.name;
            result.album = { images: result.images }
            if(result.owner && !result.artists) result.artists = [result.owner]

            let parsed = parseTrack(result, getInfo);

            parsed.tracks = result.tracks.items.map(o => parseTrack(Object.assign({}, o, {
                album: result
            }), getInfo));

            if(parsed.artists.length == 1 && (parsed.artists[0] == `Various Artists` || !parsed.artists[0])) {
                parsed.artists = [];
                
                parsed.tracks.forEach(track => {
                    track.artists.forEach(artist => {
                        if(parsed.artists.indexOf(artist) == -1) parsed.artists.push(artist)
                    })
                })
            }

            if(getInfo) {
                parsed.entries = parsed.tracks.slice(0);
                parsed.uploader = parsed.artists[0]
            }

            res(parsed)
        } else res(parseTrack(result, getInfo))
    } else res(null)
})