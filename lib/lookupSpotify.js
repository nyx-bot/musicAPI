module.exports = {
     endpoint: `/lookupSpotify/:arg(*+)`,
     func: async ({keys, idGen}, req, res) => {
          let q = req.params.arg;
          console.log(q)
          require('superagent').get(`https://api.spotify.com/v1/tracks/${q}`).set(`Authorization`, `Bearer ${keys.spotify}`).then(t => t.body).then(track => {
               console.log(track);
               return res.send({
                    title: track.name,
                    artists: track.artists.map(a => a.name),
                    duration: [track.duration_ms],
                    url: track.external_urls.spotify,
                    thumbnail: track.album.images[0].url,
                    id: track.id,
                    source: `Spotify`,
               })
          })
     }
}