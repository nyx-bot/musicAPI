module.exports = {
     endpoint: `/search/:arg(*+)`,
     func: async ({keys, idGen}, req, res) => {
          let q = req.params.arg;
          let entries = Object.entries(req.query)
          for(i in entries) {
              console.log(i)
              let ext = entries[i]
              let a = `&`; if(`${i}` == `0`) {a = '?'}
              q = q + a + ext[0];
              if(ext[1] !== '') {q = q + `=${ext[1]}`}
          }
          const sesID = idGen(16)
          const args = q.split("/");
          args.unshift('search')
          const search = unescape(args.splice(2).join("/"));
          let obj = {query: search, results: []};
          if (args[1] == `youtube`) {
               obj.source = `YouTube`;
               let ytsres = {videos: []};
               let attempt = 0;
               while (attempt !== 3 && ytsres.videos.length === 0) {
                    attempt++;
                    console.log(`attempt to search #${attempt}`);
                    ytsres = await require("yt-search")({
                         query: search,
                         pageStart: 1,
                         pageEnd: 1,
                    }).catch(e => {console.log(`${e}`)})
               }
               if (ytsres.videos.length === 0) return res.send(obj);
               let count = 0;
               while (count !== 5 && count !== ytsres.videos.length) {
                    resp = ytsres.videos[count];
                    count++;
                    let title = resp.title,
                         artists = [resp.author.name],
                         duration = [resp.seconds * 1000],
                         url = resp.url,
                         thumbnail = `https://i3.ytimg.com/vi/${resp.videoId}/maxresdefault.jpg`,
                         id = resp.videoId,
                         localID = idGen(32);
                    obj.results.push({
                         title,
                         artists,
                         duration,
                         url,
                         thumbnail,
                         id,
                         source: `YouTube`,
                    });
               }
               res.send(obj);
          } else if (args[1] == `soundcloud`) {
               obj.source = `SoundCloud`;
               require('superagent')
                    .get(
                         `https://api-v2.soundcloud.com/search/tracks?client_id=${
                              keys.sc
                         }&q=${encodeURI(search)}&limit=5`
                    )
                    .then((r) => r.body.collection)
                    .then(async (r) => {
                         if (r.length === 0) {
                         }
                         r.forEach(async (res) => {
                             let dur = [res.duration];
                             if(res.duration !== res.full_duration) {dur.push(res.full_duration)}
                              let title = res.title,
                                   artists = [res.user.username],
                                   duration = dur,
                                   url = res.permalink_url,
                                   thumbnail = null,
                                   id = res.urn;
                                   if(res.artwork_url) {thumbnail = res.artwork_url.replace('-large.jpg', '-t500x500.jpg')}
                              obj.results.push({
                                   title,
                                   artists,
                                   duration,
                                   url,
                                   thumbnail,
                                   id,
                                   source: `SoundCloud`,
                              });
                         });
                         res.send(obj);
                    })
                    .catch((e) => {
                         console.log(`${e}`);
                         res.send(obj);
                    });
          } else if (args[1] == `spotify`) {
               obj.source = `Spotify`;
               require('superagent')
                    .get(`https://api.spotify.com/v1/search?q=${encodeURI(search)}&limit=5&type=track`)
                    .set(`Authorization`, `Bearer ${keys.spotify}`)
                    .then((r) => r.body.tracks.items)
                    .then(async (r) => {
                         console.log(r)
                         for (i in r) {
                              let track = r[i];
                              obj.results.push({
                                   title: track.name,
                                   artists: track.artists.map(a => a.name),
                                   duration: [track.duration_ms],
                                   url: track.external_urls.spotify,
                                   live: false,
                                   thumbnail: track.album.images[0].url,
                                   id: track.id,
                                   source: `Spotify`,
                              });
                         }; res.send(obj)
                    })
                    .catch((e) => {
                         console.log(`${e}`);
                         res.send(obj);
                    });
          } else return res.send([])
     }
}